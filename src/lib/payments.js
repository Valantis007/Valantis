'use strict';

// Online πληρωμές (Stripe / Revolut), ακυρώσεις και επιστροφές χρημάτων.
//
// Βασικές αρχές:
//  - Κάθε σελίδα πληρωμής που ανοίγουμε καταγράφεται στον πίνακα checkouts, ώστε
//    καμία πληρωμή να μη «χαθεί» (π.χ. αν ο πελάτης πλήρωσε σε παλιότερη καρτέλα).
//  - Την κατάσταση μιας πληρωμής τη διαβάζουμε ΠΑΝΤΑ από τον πάροχο (όχι από το URL
//    επιστροφής ή το webhook), και η καταγραφή της είναι idempotent.
//  - Οι επιστροφές χρημάτων καταγράφονται πρώτα (πίνακας refunds) και μετά στέλνονται
//    στον πάροχο με idempotency key· αν αποτύχουν, ξαναδοκιμάζονται αυτόματα.

const config = require('../config');
const providers = require('./providers');
const bookings = require('./bookings');
const i18n = require('./i18n');
const fiscal = require('./fiscal');
const deposits = require('./deposits');
const mailer = require('./mailer');
const format = require('./format');
const { isCarAvailable } = require('./availability');
const { transaction } = require('../db');
const { insertCheckout, getCheckoutRow, setCheckoutStatus, openCheckouts, expireOpenCheckouts } = require('./checkouts');

const { BookingError } = bookings;
const MAX_REFUND_ATTEMPTS = 8;

// ---------------------------------------------------------------------------
// Πληρωμή ενοικίασης
// ---------------------------------------------------------------------------

// Εμφανίζεται στη σελίδα πληρωμής του παρόχου: στη γλώσσα της κράτησης.
function rentalDescription(booking) {
  const key = booking.days === 1 ? 'Ενοικίαση {car} - {days} ημέρα' : 'Ενοικίαση {car} - {days} ημέρες';
  return i18n.t(booking.locale, key, { car: `${booking.make} ${booking.model}`, days: booking.days });
}

/**
 * Επιστρέφει το URL της σελίδας πληρωμής για μια κράτηση που περιμένει πληρωμή.
 * Αν υπάρχει ήδη ανοιχτή σελίδα, την ξαναχρησιμοποιεί· αλλιώς ανανεώνει τη δέσμευση
 * του αυτοκινήτου και ανοίγει νέα.
 */
async function startRentalPayment(db, bookingId) {
  let booking = bookings.getById(db, bookingId);
  const provider = booking.payment_provider ? providers.get(booking.payment_provider) : providers.active();
  if (!provider) throw new BookingError('Οι online πληρωμές δεν είναι διαθέσιμες αυτή τη στιγμή.', 'payments_disabled');

  for (const row of openCheckouts(db, booking.id, 'rental')) {
    if (row.provider !== provider.name || !row.url) continue;
    try {
      const state = await provider.getCheckout(row.id);
      if (state.status === 'open' && booking.status === 'pending_payment' && booking.hold_expires_at > Date.now() + 5 * 60 * 1000) {
        return row.url;
      }
    } catch (err) {
      console.warn('[payments] Αδυναμία ελέγχου σελίδας πληρωμής:', err.message);
    }
  }

  const holdUntil = transaction(db, () => {
    const b = bookings.getById(db, bookingId);
    if (b.status !== 'pending_payment' || b.payment_status !== 'unpaid') {
      throw new BookingError('Η πληρωμή δεν είναι πλέον δυνατή για αυτή την κράτηση.', 'not_payable');
    }
    const nowMs = Date.now();
    if (!(b.hold_expires_at > nowMs) && !isCarAvailable(db, b.car_id, b.pickup_at, b.return_at, { excludeBookingId: b.id })) {
      throw new BookingError('Το αυτοκίνητο δεν είναι πλέον διαθέσιμο για αυτές τις ημερομηνίες.', 'unavailable');
    }
    // Νέα σελίδα πληρωμής => νέα δέσμευση (το Stripe απαιτεί τουλάχιστον 30' ισχύ).
    const until = Math.max(b.hold_expires_at || 0, nowMs + config.rules.paymentHoldMinutes * 60 * 1000);
    db.prepare('UPDATE bookings SET hold_expires_at = ? WHERE id = ?').run(until, b.id);
    return until;
  });

  booking = bookings.getById(db, bookingId);
  const checkout = await provider.createCheckout({
    kind: 'rental',
    booking,
    amountCents: booking.total_cents,
    description: rentalDescription(booking),
    expiresAtMs: holdUntil - 60 * 1000,
    successUrl: `${i18n.siteUrl(booking.locale)}/booking/${booking.reference}/payment/return`,
    cancelUrl: `${i18n.siteUrl(booking.locale)}/booking/${booking.reference}/payment/cancel`,
  });
  transaction(db, () => {
    insertCheckout(db, { id: checkout.id, provider: provider.name, bookingId: booking.id, kind: 'rental', amountCents: booking.total_cents, url: checkout.url });
    db.prepare('UPDATE bookings SET checkout_id = ?, payment_provider = ? WHERE id = ?').run(checkout.id, provider.name, booking.id);
  });
  // Οι παλιότερες σελίδες κλείνουν, ώστε να μην πληρωθεί η κράτηση δύο φορές.
  await expireOpenCheckouts(db, booking.id, 'rental', { except: checkout.id });
  return checkout.url;
}

function recalcPaymentStatus(paid, refunded) {
  if (paid <= 0) return 'unpaid';
  if (refunded >= paid) return 'refunded';
  if (refunded > 0) return 'partially_refunded';
  return 'paid';
}

async function handleRentalPaid(db, row, state, actor) {
  const decision = transaction(db, () => {
    const current = getCheckoutRow(db, row.id);
    if (['paid', 'refund_pending', 'refunded'].includes(current.status)) return { result: 'already' };
    const b = bookings.getById(db, current.booking_id);
    const amountOk = state.amountCents === current.amount_cents && (!state.currency || state.currency.toUpperCase() === 'EUR');
    const holdValid = b.status === 'pending_payment' && b.hold_expires_at > Date.now();
    const canConfirm =
      amountOk &&
      b.payment_status === 'unpaid' &&
      current.amount_cents === b.total_cents &&
      ['pending_payment', 'expired'].includes(b.status) &&
      (holdValid || isCarAvailable(db, b.car_id, b.pickup_at, b.return_at, { excludeBookingId: b.id }));

    if (canConfirm) {
      setCheckoutStatus(db, current.id, 'paid', state.paymentRef);
      db.prepare(
        `UPDATE bookings SET status = 'confirmed', payment_status = 'paid', paid_cents = ?, payment_ref = ?,
           payment_provider = ?, checkout_id = ?, hold_expires_at = NULL
         WHERE id = ?`,
      ).run(current.amount_cents, state.paymentRef, current.provider, current.id, b.id);
      bookings.logEvent(db, b.id, actor, 'paid', `Πληρωμή ${format.money(current.amount_cents)} (${current.provider})`);
      fiscal.record(db, { bookingId: b.id, kind: 'receipt', amountCents: current.amount_cents, description: `Ενοικίαση ${b.reference} - πληρωμή online`, source: current.provider });
      return { result: 'confirmed', bookingId: b.id };
    }

    // Η πληρωμή δεν μπορεί να «κουμπώσει» στην κράτηση: επιστρέφεται αυτόματα.
    let reason;
    if (!amountOk || current.amount_cents !== b.total_cents) reason = 'Το ποσό της πληρωμής δεν αντιστοιχεί στην κράτηση';
    else if (b.payment_status !== 'unpaid') reason = 'Η κράτηση είχε ήδη πληρωθεί (διπλή πληρωμή)';
    else if (b.status === 'cancelled') reason = 'Η κράτηση είχε ήδη ακυρωθεί';
    else reason = 'Η πληρωμή ολοκληρώθηκε αφού έληξε η προσωρινή δέσμευση και το αυτοκίνητο δεν ήταν πλέον διαθέσιμο';
    setCheckoutStatus(db, current.id, 'refund_pending', state.paymentRef);
    const refundId = createRefund(db, {
      bookingId: b.id,
      checkoutId: current.id,
      provider: current.provider,
      paymentRef: state.paymentRef,
      amountCents: state.amountCents,
      appliesToBooking: false,
      reason,
      actor: 'system',
    });
    bookings.logEvent(db, b.id, 'system', 'payment_returned', `${reason}. Αυτόματη επιστροφή ${format.money(state.amountCents)}.`);
    return { result: 'refund', bookingId: b.id, refundId, reason };
  });

  if (decision.result === 'confirmed') {
    bookings.notifyConfirmed(db, bookings.getById(db, decision.bookingId));
    await expireOpenCheckouts(db, decision.bookingId, 'rental');
  } else if (decision.result === 'refund') {
    await processRefund(db, decision.refundId);
    const b = bookings.getById(db, decision.bookingId);
    mailer.sendInBackground({
      to: b.email,
      subject: i18n.msg('Επιστροφή πληρωμής - κράτηση {ref}', { ref: b.reference }),
      template: 'payment-returned',
      data: { booking: b, amountCents: state.amountCents, reason: decision.reason },
    });
  }
  return decision;
}

/**
 * Συγχρονίζει μια σελίδα πληρωμής με την πραγματική της κατάσταση στον πάροχο.
 * Καλείται από το webhook, τη σελίδα επιστροφής και την περιοδική εργασία.
 */
async function reconcileCheckout(db, checkoutId, { actor = 'system' } = {}) {
  const row = getCheckoutRow(db, checkoutId);
  if (!row) return { result: 'unknown' };
  const provider = providers.get(row.provider);
  if (!provider) return { result: 'provider_disabled' };
  const state = await provider.getCheckout(row.id);
  const booking = bookings.getById(db, row.booking_id);
  if (state.reference && state.reference !== booking.reference) {
    console.error(`[payments] Η πληρωμή ${row.id} αναφέρεται σε άλλη κράτηση (${state.reference})`);
    return { result: 'mismatch' };
  }
  if (row.kind === 'deposit') return deposits.syncFromCheckout(db, row, state, { actor });
  if (row.kind === 'charge') return handleChargePaid(db, row, state, actor);
  if (state.status === 'paid') return handleRentalPaid(db, row, state, actor);
  if (['expired', 'cancelled'].includes(state.status) && row.status === 'open') {
    setCheckoutStatus(db, row.id, 'expired');
  }
  return { result: state.status };
}

// Συγχρονίζει όλες τις ανοιχτές σελίδες πληρωμής μιας κράτησης (π.χ. στην επιστροφή από τον πάροχο).
async function reconcileBooking(db, bookingId, kinds = ['rental', 'charge']) {
  for (const kind of kinds) {
    for (const row of openCheckouts(db, bookingId, kind)) {
      try {
        await reconcileCheckout(db, row.id, { actor: 'customer-return' });
      } catch (err) {
        console.error('[payments] Αποτυχία συγχρονισμού πληρωμής:', err.message);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Πληρωμή εκκρεμών χρεώσεων (π.χ. ζημιά που δεν καλύφθηκε από την εγγύηση)
// ---------------------------------------------------------------------------

async function startChargesPayment(db, bookingId) {
  const booking = bookings.getById(db, bookingId);
  const provider = providers.active();
  if (!provider) throw new BookingError('Οι online πληρωμές δεν είναι διαθέσιμες. Επικοινωνήστε μαζί μας.');
  const outstanding = deposits.outstandingCharges(db, booking.id);
  const amount = outstanding.reduce((sum, c) => sum + (c.amount_cents - c.paid_cents), 0);
  if (amount <= 0) throw new BookingError('Δεν υπάρχουν χρεώσεις προς πληρωμή.');
  if (deposits.heldDeposit(db, booking.id) || deposits.unknownCapture(db, booking.id)) {
    throw new BookingError('Οι χρεώσεις θα αφαιρεθούν πρώτα από την εγγύηση. Θα σας ενημερώσουμε για τυχόν υπόλοιπο.');
  }
  for (const row of openCheckouts(db, booking.id, 'charge')) {
    if (row.provider === provider.name && row.amount_cents === amount && row.url && Date.now() - row.created_at < 20 * 60 * 1000) {
      return row.url;
    }
  }
  const checkout = await provider.createCheckout({
    kind: 'charge',
    booking,
    amountCents: amount,
    description: i18n.t(booking.locale, 'Χρεώσεις μετά την επιστροφή του αυτοκινήτου'),
    expiresAtMs: Date.now() + 60 * 60 * 1000,
    successUrl: `${i18n.siteUrl(booking.locale)}/booking/${booking.reference}/payment/return`,
    cancelUrl: `${i18n.siteUrl(booking.locale)}/booking/${booking.reference}`,
  });
  insertCheckout(db, { id: checkout.id, provider: provider.name, bookingId: booking.id, kind: 'charge', amountCents: amount, url: checkout.url });
  await expireOpenCheckouts(db, booking.id, 'charge', { except: checkout.id });
  return checkout.url;
}

async function handleChargePaid(db, row, state, actor) {
  if (state.status !== 'paid') {
    if (['expired', 'cancelled'].includes(state.status) && row.status === 'open') setCheckoutStatus(db, row.id, 'expired');
    return { result: state.status };
  }
  const decision = transaction(db, () => {
    const current = getCheckoutRow(db, row.id);
    if (current.status !== 'open' && current.status !== 'expired') return { result: 'already' };
    const outstanding = deposits.outstandingCharges(db, current.booking_id);
    const due = outstanding.reduce((sum, c) => sum + (c.amount_cents - c.paid_cents), 0);
    if (state.amountCents > due || state.amountCents !== current.amount_cents) {
      setCheckoutStatus(db, current.id, 'refund_pending', state.paymentRef);
      const refundId = createRefund(db, {
        bookingId: current.booking_id,
        checkoutId: current.id,
        provider: current.provider,
        paymentRef: state.paymentRef,
        amountCents: state.amountCents,
        appliesToBooking: false,
        reason: 'Οι χρεώσεις είχαν ήδη εξοφληθεί',
        actor: 'system',
      });
      return { result: 'refund', refundId };
    }
    setCheckoutStatus(db, current.id, 'paid', state.paymentRef);
    deposits.allocateToCharges(db, current.booking_id, state.amountCents, 'payment_link', current.id);
    fiscal.record(db, { bookingId: current.booking_id, kind: 'receipt', amountCents: state.amountCents, description: 'Χρεώσεις μετά την επιστροφή - πληρωμή online', source: current.provider });
    bookings.logEvent(db, current.booking_id, actor, 'charges_paid', `Πληρωμή χρεώσεων ${format.money(state.amountCents)} (${current.provider})`);
    return { result: 'paid' };
  });
  if (decision.result === 'refund') await processRefund(db, decision.refundId);
  return decision;
}

// ---------------------------------------------------------------------------
// Επιστροφές χρημάτων
// ---------------------------------------------------------------------------

function createRefund(db, { bookingId, checkoutId = null, provider, paymentRef, amountCents, appliesToBooking = true, reason = null, actor }) {
  const res = db
    .prepare(
      `INSERT INTO refunds (booking_id, checkout_id, provider, payment_ref, amount_cents, applies_to_booking, reason, actor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(bookingId, checkoutId, provider, paymentRef, amountCents, appliesToBooking ? 1 : 0, reason, actor);
  return Number(res.lastInsertRowid);
}

// Επιστροφές που εκτελούνται αυτή τη στιγμή (μία διεργασία Node: αρκεί κλείδωμα στη μνήμη).
const refundsInFlight = new Set();

// Επιστρέφει true αν η επιστροφή ολοκληρώθηκε.
async function processRefund(db, refundId) {
  if (refundsInFlight.has(refundId)) return false;
  refundsInFlight.add(refundId);
  try {
    return await runRefund(db, refundId);
  } finally {
    refundsInFlight.delete(refundId);
  }
}

async function runRefund(db, refundId) {
  const row = db.prepare('SELECT * FROM refunds WHERE id = ?').get(refundId);
  if (!row || row.status !== 'pending') return row ? row.status === 'done' : false;
  const provider = providers.get(row.provider);
  let result;
  try {
    if (!provider) throw new Error(`Ο πάροχος ${row.provider} δεν είναι ρυθμισμένος`);
    // Ο πάροχος ελέγχει πρώτα αν η επιστροφή `refund-<id>` έγινε ήδη: ποτέ διπλή επιστροφή.
    result = await provider.refund(row.payment_ref, row.amount_cents, `refund-${row.id}`, { attempt: row.attempts });
    if (result && result.status === 'failed') throw new Error('Ο πάροχος απέρριψε την επιστροφή');
  } catch (err) {
    const attempts = row.attempts + 1;
    const failed = attempts >= MAX_REFUND_ATTEMPTS;
    db.prepare(`UPDATE refunds SET attempts = ?, last_error = ?, status = ? WHERE id = ? AND status = 'pending'`).run(
      attempts,
      String(err.message).slice(0, 500),
      failed ? 'failed' : 'pending',
      row.id,
    );
    console.error(`[refund ${row.id}] Αποτυχία (${attempts}/${MAX_REFUND_ATTEMPTS}):`, err.message);
    if (failed || attempts === 1) {
      const b = bookings.getById(db, row.booking_id);
      mailer.sendInBackground({
        to: config.mail.adminNotify,
        subject: `${failed ? 'ΑΠΟΤΥΧΙΑ' : 'Καθυστέρηση'} επιστροφής χρημάτων - κράτηση ${b.reference}`,
        template: 'admin-refund-problem',
        data: { booking: b, refund: { ...row, attempts, last_error: err.message }, failed },
      });
    }
    return false;
  }
  transaction(db, () => {
    const res = db
      .prepare(
        `UPDATE refunds SET status = 'done', attempts = attempts + 1, done_at = datetime('now'),
           provider_refund_id = ?, provider_status = ?, checked_at = datetime('now')
         WHERE id = ? AND status = 'pending'`,
      )
      .run((result && result.id) || null, (result && result.status) || null, row.id);
    if (!res.changes) return;
    if (row.applies_to_booking) {
      const b = bookings.getById(db, row.booking_id);
      const refunded = b.refunded_cents + row.amount_cents;
      db.prepare('UPDATE bookings SET refunded_cents = ?, payment_status = ? WHERE id = ?').run(
        refunded,
        recalcPaymentStatus(b.paid_cents, refunded),
        b.id,
      );
    }
    if (row.checkout_id) setCheckoutStatus(db, row.checkout_id, 'refunded');
    if (row.applies_to_booking) {
      fiscal.record(db, {
        bookingId: row.booking_id,
        kind: 'credit',
        amountCents: row.amount_cents,
        description: `Επιστροφή χρημάτων${row.reason ? ` - ${row.reason}` : ''}`,
        source: row.provider,
        refundId: row.id,
      });
    }
    bookings.logEvent(db, row.booking_id, row.actor, 'refunded', `Επιστροφή ${format.money(row.amount_cents)}${row.reason ? ` - ${row.reason}` : ''}`);
  });
  return true;
}

/**
 * Μια επιστροφή που ο πάροχος δέχτηκε μπορεί να αποτύχει αργότερα (π.χ. η κάρτα έκλεισε).
 * Ελέγχουμε όσες είναι ακόμη σε εξέλιξη· αν αποτύχουν, αναιρούμε την καταγραφή και
 * ειδοποιούμε το γραφείο να επιστρέψει τα χρήματα με άλλο τρόπο.
 */
async function checkProviderRefunds(db, { limit = 20 } = {}) {
  const rows = db
    .prepare(
      `SELECT * FROM refunds WHERE status = 'done' AND provider_refund_id IS NOT NULL
         AND provider_status IN ('pending', 'requires_action') AND done_at > datetime('now', '-30 days')
       ORDER BY COALESCE(checked_at, '') LIMIT ?`,
    )
    .all(limit);
  for (const row of rows) {
    const provider = providers.get(row.provider);
    if (!provider || !provider.getRefund) continue;
    let state;
    try {
      state = await provider.getRefund(row.provider_refund_id, row.payment_ref);
    } catch (err) {
      console.error(`[refund ${row.id}] Έλεγχος:`, err.message);
      continue;
    }
    const failed = transaction(db, () => {
      if (state.status !== 'failed') {
        db.prepare(`UPDATE refunds SET provider_status = ?, checked_at = datetime('now') WHERE id = ?`).run(state.status, row.id);
        return false;
      }
      const res = db
        .prepare(`UPDATE refunds SET status = 'failed', provider_status = 'failed', last_error = ?, checked_at = datetime('now') WHERE id = ? AND status = 'done'`)
        .run(state.reason || 'Ο πάροχος δεν μπόρεσε να ολοκληρώσει την επιστροφή', row.id);
      if (!res.changes) return false;
      if (row.applies_to_booking) {
        const b = bookings.getById(db, row.booking_id);
        const refunded = Math.max(b.refunded_cents - row.amount_cents, 0);
        db.prepare('UPDATE bookings SET refunded_cents = ?, payment_status = ? WHERE id = ?').run(
          refunded,
          recalcPaymentStatus(b.paid_cents, refunded),
          b.id,
        );
      }
      if (row.checkout_id) setCheckoutStatus(db, row.checkout_id, 'refund_pending');
      // Το πιστωτικό δεν πρέπει να εκδοθεί (ή πρέπει να αντιλογιστεί αν εκδόθηκε ήδη).
      db.prepare('DELETE FROM fiscal_docs WHERE refund_id = ? AND issued_at IS NULL').run(row.id);
      const issued = db.prepare('SELECT mark FROM fiscal_docs WHERE refund_id = ? AND issued_at IS NOT NULL').get(row.id);
      bookings.logEvent(db, row.booking_id, 'system', 'refund_failed', `Η επιστροφή ${format.money(row.amount_cents)} απέτυχε στον πάροχο`);
      return { issuedMark: issued ? issued.mark || '-' : null };
    });
    if (failed) {
      const b = bookings.getById(db, row.booking_id);
      let message = state.reason || 'Απέτυχε στον πάροχο μετά την αποδοχή';
      if (failed.issuedMark) message += `. Το πιστωτικό (ΜΑΡΚ ${failed.issuedMark}) έχει ήδη εκδοθεί: ενημερώστε τον λογιστή.`;
      mailer.sendInBackground({
        to: config.mail.adminNotify,
        subject: `ΑΠΟΤΥΧΙΑ επιστροφής χρημάτων - κράτηση ${b.reference}`,
        template: 'admin-refund-problem',
        data: { booking: b, refund: { ...row, last_error: message }, failed: true },
      });
    }
  }
}

async function processPendingRefunds(db, { limit = 20 } = {}) {
  const rows = db.prepare(`SELECT id FROM refunds WHERE status = 'pending' ORDER BY id LIMIT ?`).all(limit);
  for (const { id } of rows) await processRefund(db, id);
  return rows.length;
}

function pendingRefundCents(db, bookingId) {
  return db
    .prepare(`SELECT COALESCE(SUM(amount_cents), 0) s FROM refunds WHERE booking_id = ? AND applies_to_booking = 1 AND status = 'pending'`)
    .get(bookingId).s;
}

/**
 * Επιστροφή ποσού σε online πληρωμή (χωρίς ακύρωση — π.χ. έκπτωση ή αποζημίωση).
 */
async function refundBookingAmount(db, bookingId, amountCents, { actor, reason }) {
  const refundId = transaction(db, () => {
    const b = bookings.getById(db, bookingId);
    if (!bookings.isOnlinePayment(b)) throw new BookingError('Η κράτηση δεν πληρώθηκε online. Καταχωρήστε την επιστροφή χειροκίνητα.');
    const refundable = b.paid_cents - b.refunded_cents - pendingRefundCents(db, b.id);
    if (!(amountCents > 0) || amountCents > refundable) {
      throw new BookingError(`Μη έγκυρο ποσό. Μέγιστο ποσό επιστροφής: ${format.money(refundable)}.`);
    }
    return createRefund(db, { bookingId: b.id, provider: b.payment_provider, paymentRef: b.payment_ref, amountCents, reason, actor });
  });
  const done = await processRefund(db, refundId);
  return { refundId, done };
}

// Καταγραφή επιστροφής που έγινε εκτός συστήματος (μετρητά, τραπεζική μεταφορά, POS).
function recordManualRefund(db, bookingId, amountCents, { actor, note }) {
  return transaction(db, () => {
    const b = bookings.getById(db, bookingId);
    const refundable = b.paid_cents - b.refunded_cents - pendingRefundCents(db, b.id);
    if (!(amountCents > 0) || amountCents > refundable) {
      throw new BookingError(`Μη έγκυρο ποσό. Μέγιστο ποσό επιστροφής: ${format.money(refundable)}.`);
    }
    const refunded = b.refunded_cents + amountCents;
    db.prepare('UPDATE bookings SET refunded_cents = ?, payment_status = ? WHERE id = ?').run(
      refunded,
      recalcPaymentStatus(b.paid_cents, refunded),
      b.id,
    );
    bookings.logEvent(db, b.id, actor, 'refunded', `Επιστροφή εκτός συστήματος ${format.money(amountCents)}${note ? ` - ${note}` : ''}`);
    fiscal.record(db, { bookingId: b.id, kind: 'credit', amountCents, description: `Επιστροφή χρημάτων εκτός συστήματος${note ? ` - ${note}` : ''}`, source: 'office' });
  });
}

// ---------------------------------------------------------------------------
// Ακύρωση κράτησης
// ---------------------------------------------------------------------------

/**
 * Ακυρώνει μια κράτηση και επιστρέφει χρήματα όπου χρειάζεται.
 * Η ακύρωση «κλειδώνεται» πρώτα στη βάση (ώστε δύο ταυτόχρονες ακυρώσεις να μην κάνουν
 * διπλή επιστροφή) και μετά εκτελείται η επιστροφή, που ξαναδοκιμάζεται αν αποτύχει.
 *
 * @returns {{ booking, refundedCents, refundPendingCents, refundDueCents }}
 */
// `retainCents`: ποσό που παρακρατείται (π.χ. χρέωση ακύρωσης). Υπολογίζεται μέσα στη συναλλαγή,
// μετά την αφαίρεση των επιστροφών που εκκρεμούν, ώστε να μην επιστραφεί ποτέ.
// `reason`: σταθερό ελληνικό κείμενο ή Msg (μεταφράζεται στο email)· `note`: σημείωση του γραφείου,
// γραμμένη ήδη στη γλώσσα του πελάτη (εμφανίζεται όπως είναι).
async function cancelBooking(db, bookingId, { actor, reason = null, note = null, refund = true, refundCents = null, retainCents = 0, notify = true, allowExpiredPaid = false }) {
  const claim = transaction(db, () => {
    const b = bookings.getById(db, bookingId);
    const allowed = ['pending_payment', 'confirmed'];
    if (allowExpiredPaid && b.status === 'expired' && b.paid_cents > b.refunded_cents) allowed.push('expired');
    if (!allowed.includes(b.status)) throw new BookingError('Η κράτηση δεν μπορεί να ακυρωθεί σε αυτή την κατάσταση.', 'bad_state');

    const res = db
      .prepare(`UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now'), hold_expires_at = NULL WHERE id = ? AND status = ?`)
      .run(b.id, b.status);
    if (!res.changes) throw new BookingError('Η κράτηση άλλαξε στο μεταξύ. Ανανεώστε τη σελίδα.', 'conflict');

    const refundable = Math.max(b.paid_cents - b.refunded_cents - pendingRefundCents(db, b.id) - retainCents, 0);
    let amount = 0;
    if (refund && refundable > 0) amount = refundCents === null ? refundable : Math.min(Math.max(refundCents, 0), refundable);
    let refundId = null;
    let refundDue = 0;
    if (amount > 0) {
      if (bookings.isOnlinePayment(b)) {
        refundId = createRefund(db, { bookingId: b.id, provider: b.payment_provider, paymentRef: b.payment_ref, amountCents: amount, reason: 'Ακύρωση κράτησης', actor });
      } else {
        refundDue = amount;
        bookings.logEvent(db, b.id, 'system', 'refund_due', `Οφείλεται επιστροφή ${format.money(amount)} (πληρωμή εκτός συστήματος)`);
      }
    }
    // Το `reason` μπορεί να είναι Msg (μεταφράζεται στο email)· στο ιστορικό γράφεται στα ελληνικά.
    const logged = [reason instanceof i18n.Msg ? String(reason) : reason, note].filter(Boolean).join(' — ');
    bookings.logEvent(db, b.id, actor, 'cancelled', logged || null);
    return { refundId, amount, refundDue };
  });

  // Ο πελάτης δεν πρέπει να μπορεί να πληρώσει μια ακυρωμένη κράτηση.
  await expireOpenCheckouts(db, bookingId, 'rental');
  try {
    await deposits.releaseAllForBooking(db, bookingId, { actor, reason: 'Ακύρωση κράτησης' });
  } catch (err) {
    console.error('[cancel] Αποτυχία αποδέσμευσης εγγύησης:', err.message);
  }

  let refundedCents = 0;
  let refundPendingCents = 0;
  if (claim.refundId) {
    const done = await processRefund(db, claim.refundId);
    if (done) refundedCents = claim.amount;
    else refundPendingCents = claim.amount;
  }

  const updated = bookings.getById(db, bookingId);
  if (notify) {
    mailer.sendInBackground({
      to: updated.email,
      subject: i18n.msg('Ακύρωση κράτησης {ref}', { ref: updated.reference }),
      template: 'booking-cancelled',
      data: { booking: updated, refundedCents: refundedCents + refundPendingCents, refundDueCents: claim.refundDue, reason, note },
    });
  }
  if (claim.refundDue > 0) {
    mailer.sendInBackground({
      to: config.mail.adminNotify,
      subject: `Οφείλεται επιστροφή χρημάτων - κράτηση ${updated.reference}`,
      template: 'admin-refund-due',
      data: { booking: updated, amountCents: claim.refundDue },
    });
  }
  return { booking: updated, refundedCents, refundPendingCents, refundDueCents: claim.refundDue };
}

// ---------------------------------------------------------------------------
// Περιοδικός συγχρονισμός (για χαμένα webhooks)
// ---------------------------------------------------------------------------

async function reconcileOpenCheckouts(db, { limit = 25, nowMs = Date.now() } = {}) {
  const rows = db
    .prepare(
      `SELECT id FROM checkouts WHERE status = 'open' AND created_at < ? AND created_at > ?
       ORDER BY updated_at LIMIT ?`,
    )
    .all(nowMs - 60 * 1000, nowMs - 26 * 60 * 60 * 1000, limit);
  for (const { id } of rows) {
    try {
      await reconcileCheckout(db, id, { actor: 'system-sync' });
      db.prepare('UPDATE checkouts SET updated_at = ? WHERE id = ?').run(Date.now(), id);
    } catch (err) {
      console.error(`[sync] ${id}:`, err.message);
    }
  }
  // Πολύ παλιές «ανοιχτές» σελίδες δεν μπορούν πλέον να πληρωθούν.
  db.prepare(`UPDATE checkouts SET status = 'expired', updated_at = ? WHERE status = 'open' AND created_at <= ?`).run(
    nowMs,
    nowMs - 26 * 60 * 60 * 1000,
  );
  return rows.length;
}

module.exports = {
  startRentalPayment,
  reconcileCheckout,
  reconcileBooking,
  startChargesPayment,
  cancelBooking,
  refundBookingAmount,
  recordManualRefund,
  processRefund,
  processPendingRefunds,
  checkProviderRefunds,
  pendingRefundCents,
  reconcileOpenCheckouts,
  expireOpenCheckouts,
  insertCheckout,
  getCheckoutRow,
  setCheckoutStatus,
  recalcPaymentStatus,
};
