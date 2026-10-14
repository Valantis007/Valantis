'use strict';

// Εγγύηση (δέσμευση ποσού στην πιστωτική κάρτα) και χρεώσεις μετά την επιστροφή.
//
// Κανόνες (βλ. και όρους ενοικίασης):
//  - Η εγγύηση ΔΕΝ είναι χρέωση: το ποσό δεσμεύεται και αποδεσμεύεται χωρίς καθυστέρηση
//    μετά την επιστροφή, εκτός από ό,τι αντιστοιχεί σε τεκμηριωμένες χρεώσεις.
//  - Γίνονται δεκτές μόνο πιστωτικές κάρτες.
//  - Χρεώσεις που ορίζονται στους όρους (καύσιμο, καθυστέρηση, καθαρισμός, διοικητικό
//    κόστος προστίμων) θεωρούνται αποδεκτές· ο πελάτης ενημερώνεται αναλυτικά.
//  - Χρέωση ΖΗΜΙΑΣ αφαιρείται μόνο με συναίνεση του πελάτη (online αποδοχή ή γραπτή
//    συναίνεση που καταγράφει το γραφείο). Ο πελάτης μπορεί να την αμφισβητήσει.

const crypto = require('node:crypto');
const config = require('../config');
const time = require('./time');
const format = require('./format');
const providers = require('./providers');
const bookings = require('./bookings');
const mailer = require('./mailer');
const { transaction } = require('../db');
const { insertCheckout, getCheckoutRow, setCheckoutStatus, openCheckouts, expireOpenCheckouts } = require('./checkouts');

const { BookingError } = bookings;
const CATEGORIES = ['fuel', 'late_return', 'cleaning', 'fines_admin', 'damage', 'other'];
const TOKEN_RE = /^[a-f0-9]{64}$/;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// ---------------------------------------------------------------------------
// Ανάγνωση
// ---------------------------------------------------------------------------

function getDeposit(db, id) {
  return db.prepare('SELECT * FROM deposits WHERE id = ?').get(id) || null;
}

function listForBooking(db, bookingId) {
  return db.prepare('SELECT * FROM deposits WHERE booking_id = ? ORDER BY id DESC').all(bookingId);
}

function activeDeposit(db, bookingId) {
  return (
    db
      .prepare(`SELECT * FROM deposits WHERE booking_id = ? AND status IN ('awaiting', 'held') ORDER BY id DESC LIMIT 1`)
      .get(bookingId) || null
  );
}

function heldDeposit(db, bookingId) {
  return db.prepare(`SELECT * FROM deposits WHERE booking_id = ? AND status = 'held' ORDER BY id DESC LIMIT 1`).get(bookingId) || null;
}

function chargesForBooking(db, bookingId) {
  return db.prepare('SELECT * FROM booking_charges WHERE booking_id = ? ORDER BY id').all(bookingId);
}

// Αποδεκτές χρεώσεις που δεν έχουν εξοφληθεί πλήρως.
function outstandingCharges(db, bookingId) {
  return db
    .prepare(`SELECT * FROM booking_charges WHERE booking_id = ? AND status = 'accepted' AND paid_cents < amount_cents ORDER BY id`)
    .all(bookingId);
}

function outstandingCents(db, bookingId) {
  return outstandingCharges(db, bookingId).reduce((sum, c) => sum + (c.amount_cents - c.paid_cents), 0);
}

function unresolvedDamage(db, bookingId) {
  return db
    .prepare(`SELECT * FROM booking_charges WHERE booking_id = ? AND status IN ('proposed', 'disputed') ORDER BY id`)
    .all(bookingId);
}

function linkUrl(token) {
  return `${config.baseUrl}/deposit/${token}`;
}

function findByToken(db, token) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  const deposit = db.prepare('SELECT * FROM deposits WHERE link_token_hash = ?').get(sha256(token));
  if (!deposit) return null;
  return { deposit, booking: bookings.getById(db, deposit.booking_id) };
}

// Πότε μπορεί ο πελάτης να εγκρίνει τη δέσμευση online.
function holdWindow(booking, nowLocal = time.nowLocal()) {
  const opensAt = time.addMinutes(booking.pickup_at, -config.deposits.linkOpensHoursBeforePickup * 60);
  const open = nowLocal >= opensAt && nowLocal < booking.return_at && ['confirmed', 'active'].includes(booking.status);
  return { opensAt, closesAt: booking.return_at, open };
}

function notifyAdmin(subject, data) {
  mailer.sendInBackground({ to: config.mail.adminNotify, subject, template: 'admin-deposit-alert', data });
}

// ---------------------------------------------------------------------------
// Δέσμευση εγγύησης
// ---------------------------------------------------------------------------

function assertBookingForDeposit(booking) {
  if (!['confirmed', 'active'].includes(booking.status)) {
    throw new BookingError('Εγγύηση δεσμεύεται μόνο σε επιβεβαιωμένες ή ενεργές κρατήσεις.');
  }
}

// Ακυρώνει τυχόν σύνδεσμο που περιμένει τον πελάτη (μέσα σε συναλλαγή).
function cancelAwaiting(db, bookingId, actor) {
  const awaiting = db.prepare(`SELECT * FROM deposits WHERE booking_id = ? AND status = 'awaiting'`).all(bookingId);
  for (const d of awaiting) {
    db.prepare(`UPDATE deposits SET status = 'cancelled', settled_at = datetime('now') WHERE id = ?`).run(d.id);
    bookings.logEvent(db, bookingId, actor, 'deposit_link_cancelled', `Ακυρώθηκε ο σύνδεσμος εγγύησης #${d.id}`);
  }
  return awaiting;
}

/**
 * Καταγραφή εγγύησης που δεσμεύτηκε στο POS του γραφείου (προέγκριση).
 */
function recordPosHold(db, bookingId, { amountCents, approvalCode, last4, creditConfirmed, actor }) {
  if (!(amountCents > 0)) throw new BookingError('Συμπληρώστε το ποσό της εγγύησης.');
  if (!approvalCode) throw new BookingError('Συμπληρώστε τον αριθμό έγκρισης (approval code) του POS.');
  if (!creditConfirmed) throw new BookingError('Η εγγύηση δεσμεύεται μόνο σε πιστωτική κάρτα. Επιβεβαιώστε τον τύπο της κάρτας.');
  if (last4 && !/^\d{4}$/.test(last4)) throw new BookingError('Τα τελευταία 4 ψηφία της κάρτας δεν είναι έγκυρα.');
  return transaction(db, () => {
    const booking = bookings.getById(db, bookingId);
    assertBookingForDeposit(booking);
    if (heldDeposit(db, bookingId)) throw new BookingError('Υπάρχει ήδη δεσμευμένη εγγύηση για αυτή την κράτηση.');
    cancelAwaiting(db, bookingId, actor);
    const res = db
      .prepare(
        `INSERT INTO deposits (booking_id, method, status, amount_cents, hold_ref, card_last4, funding, consent_at, created_by, held_at)
         VALUES (?, 'pos', 'held', ?, ?, ?, 'credit', datetime('now'), ?, datetime('now'))`,
      )
      .run(bookingId, amountCents, approvalCode, last4 || null, actor);
    bookings.logEvent(db, bookingId, actor, 'deposit_held', `Εγγύηση ${format.money(amountCents)} στο POS (έγκριση ${approvalCode})`);
    return Number(res.lastInsertRowid);
  });
}

/**
 * Δημιουργεί σύνδεσμο (και QR) με τον οποίο ο πελάτης εγκρίνει online τη δέσμευση.
 */
async function createOnlineLink(db, bookingId, { amountCents, actor, sendEmail = false }) {
  const provider = providers.active();
  if (!provider) throw new BookingError('Δεν έχει ρυθμιστεί πάροχος online πληρωμών (Stripe ή Revolut).');
  if (!(amountCents > 0)) throw new BookingError('Συμπληρώστε το ποσό της εγγύησης.');
  const token = crypto.randomBytes(32).toString('hex');
  const { depositId, cancelled } = transaction(db, () => {
    const booking = bookings.getById(db, bookingId);
    assertBookingForDeposit(booking);
    if (heldDeposit(db, bookingId)) throw new BookingError('Υπάρχει ήδη δεσμευμένη εγγύηση για αυτή την κράτηση.');
    const old = cancelAwaiting(db, bookingId, actor);
    const res = db
      .prepare(
        `INSERT INTO deposits (booking_id, method, status, amount_cents, link_token_hash, created_by)
         VALUES (?, ?, 'awaiting', ?, ?, ?)`,
      )
      .run(bookingId, provider.name, amountCents, sha256(token), actor);
    bookings.logEvent(db, bookingId, actor, 'deposit_link', `Σύνδεσμος online εγγύησης ${format.money(amountCents)} (${provider.label})`);
    return { depositId: Number(res.lastInsertRowid), cancelled: old };
  });
  if (cancelled.length) await expireDepositCheckouts(db, bookingId, cancelled.map((d) => d.id));
  const url = linkUrl(token);
  if (sendEmail) sendLinkEmail(db, bookingId, depositId, url);
  return { depositId, token, url };
}

function sendLinkEmail(db, bookingId, depositId, url) {
  const booking = bookings.getById(db, bookingId);
  const deposit = getDeposit(db, depositId);
  mailer.sendInBackground({
    to: booking.email,
    subject: `Εγγύηση για την κράτηση ${booking.reference}`,
    template: 'deposit-link',
    data: { booking, deposit, url, window: holdWindow(booking) },
  });
}

async function expireDepositCheckouts(db, bookingId, depositIds, { except = null } = {}) {
  for (const row of openCheckouts(db, bookingId, 'deposit')) {
    if (row.id === except || !depositIds.includes(row.ref_id)) continue;
    const provider = providers.get(row.provider);
    if (provider) await provider.expireCheckout(row.id);
  }
}

/**
 * Ο πελάτης αποδέχθηκε τους όρους της εγγύησης: ανοίγει η σελίδα του παρόχου.
 */
async function startOnlineHold(db, token) {
  const found = findByToken(db, token);
  if (!found) throw new BookingError('Ο σύνδεσμος δεν είναι έγκυρος.');
  const { deposit, booking } = found;
  if (deposit.status !== 'awaiting') throw new BookingError('Η εγγύηση αυτή δεν περιμένει πλέον έγκριση.');
  const window = holdWindow(booking);
  if (!window.open) {
    throw new BookingError(
      `Η δέσμευση της εγγύησης γίνεται από ${format.dateTime(window.opensAt)} έως την επιστροφή του αυτοκινήτου.`,
    );
  }
  const provider = providers.get(deposit.method);
  if (!provider) throw new BookingError('Οι online πληρωμές δεν είναι διαθέσιμες αυτή τη στιγμή.');

  for (const row of openCheckouts(db, booking.id, 'deposit')) {
    if (row.ref_id === deposit.id && row.url && Date.now() - row.created_at < 20 * 60 * 1000) return row.url;
  }
  // Η δέσμευση πρέπει να διαρκεί όσο η ενοικίαση + λίγες ημέρες για τον έλεγχο του αυτοκινήτου.
  const holdDays = Math.min(Math.max(Math.ceil(time.minutesBetween(time.nowLocal(), booking.return_at) / 1440) + 3, 1), 30);
  const checkout = await provider.createCheckout({
    kind: 'deposit',
    booking,
    refId: deposit.id,
    amountCents: deposit.amount_cents,
    description: 'Εγγύηση ενοικίασης - δέσμευση ποσού (όχι χρέωση)',
    expiresAtMs: Date.now() + 60 * 60 * 1000,
    successUrl: `${config.baseUrl}/deposit/${token}/return`,
    cancelUrl: `${config.baseUrl}/deposit/${token}`,
    hold: true,
    holdDays,
  });
  transaction(db, () => {
    insertCheckout(db, { id: checkout.id, provider: provider.name, bookingId: booking.id, kind: 'deposit', refId: deposit.id, amountCents: deposit.amount_cents, url: checkout.url });
    db.prepare(`UPDATE deposits SET checkout_id = ?, consent_at = datetime('now'), failure_reason = NULL WHERE id = ?`).run(checkout.id, deposit.id);
  });
  await expireDepositCheckouts(db, booking.id, [deposit.id], { except: checkout.id });
  return checkout.url;
}

/**
 * Αποτέλεσμα από τον πάροχο για μια σελίδα δέσμευσης εγγύησης.
 */
async function syncFromCheckout(db, row, state, { actor = 'system' } = {}) {
  if (state.status === 'authorised') {
    const decision = transaction(db, () => {
      const current = getCheckoutRow(db, row.id);
      if (!['open', 'expired'].includes(current.status)) return { result: 'already' };
      const dep = getDeposit(db, current.ref_id);
      const funding = state.card && state.card.funding;
      if (!dep || dep.status !== 'awaiting') {
        setCheckoutStatus(db, current.id, 'expired', state.paymentRef);
        return { result: 'release', ref: state.paymentRef, reason: 'stale' };
      }
      if (funding === 'debit' || funding === 'prepaid') {
        setCheckoutStatus(db, current.id, 'expired', state.paymentRef);
        db.prepare('UPDATE deposits SET failure_reason = ? WHERE id = ?').run(
          'Η κάρτα που χρησιμοποιήθηκε δεν είναι πιστωτική. Η δέσμευση ακυρώθηκε — δοκιμάστε με πιστωτική κάρτα.',
          dep.id,
        );
        bookings.logEvent(db, dep.booking_id, actor, 'deposit_rejected', `Απόρριψη κάρτας τύπου ${funding} για την εγγύηση`);
        return { result: 'release', ref: state.paymentRef, reason: 'not_credit' };
      }
      setCheckoutStatus(db, current.id, 'authorised', state.paymentRef);
      db.prepare(
        `UPDATE deposits SET status = 'held', hold_ref = ?, card_brand = ?, card_last4 = ?, funding = ?,
           capture_deadline_ms = ?, held_at = datetime('now'), failure_reason = ?
         WHERE id = ?`,
      ).run(
        state.paymentRef,
        state.card ? state.card.brand : null,
        state.card ? state.card.last4 : null,
        funding || null,
        state.captureDeadlineMs || null,
        funding === 'credit' ? null : 'Ο πάροχος δεν επιβεβαίωσε ότι η κάρτα είναι πιστωτική — ελέγξτε την κάρτα στην παραλαβή.',
        dep.id,
      );
      bookings.logEvent(db, dep.booking_id, actor, 'deposit_held', `Εγγύηση ${format.money(dep.amount_cents)} δεσμεύτηκε online (${current.provider})`);
      return { result: 'held', depositId: dep.id };
    });
    if (decision.result === 'release') {
      try {
        await providers.get(row.provider).releaseHold(decision.ref, `deposit-reject-${row.id}`);
      } catch (err) {
        console.error('[deposit] Αποτυχία αποδέσμευσης μη αποδεκτής κάρτας:', err.message);
        notifyAdmin('Απαιτείται χειροκίνητη αποδέσμευση εγγύησης', { message: `Η δέσμευση ${decision.ref} πρέπει να ακυρωθεί από τον πίνακα του παρόχου.`, bookingId: row.booking_id });
      }
    } else if (decision.result === 'held') {
      const booking = bookings.getById(db, row.booking_id);
      mailer.sendInBackground({
        to: booking.email,
        subject: `Δέσμευση εγγύησης - κράτηση ${booking.reference}`,
        template: 'deposit-held',
        data: { booking, deposit: getDeposit(db, decision.depositId) },
      });
    }
    return decision;
  }
  if (['expired', 'cancelled'].includes(state.status) && row.status === 'open') setCheckoutStatus(db, row.id, 'expired');
  return { result: state.status };
}

/**
 * Ελέγχει στον πάροχο αν μια online εγγύηση είναι ακόμη δεσμευμένη.
 */
async function syncHold(db, depositId) {
  const dep = getDeposit(db, depositId);
  if (!dep || dep.status !== 'held' || dep.method === 'pos' || !dep.hold_ref) return dep;
  const provider = providers.get(dep.method);
  if (!provider) return dep;
  const hold = await provider.getHold(dep.hold_ref);
  if (hold.status === 'held') {
    if (hold.captureDeadlineMs && hold.captureDeadlineMs !== dep.capture_deadline_ms) {
      db.prepare('UPDATE deposits SET capture_deadline_ms = ? WHERE id = ?').run(hold.captureDeadlineMs, dep.id);
    }
  } else if (['expired', 'released'].includes(hold.status)) {
    transaction(db, () => {
      const res = db
        .prepare(`UPDATE deposits SET status = 'expired', settled_at = datetime('now'), failure_reason = ? WHERE id = ? AND status = 'held'`)
        .run('Η δέσμευση έληξε ή ακυρώθηκε από την τράπεζα / τον πάροχο.', dep.id);
      if (res.changes) bookings.logEvent(db, dep.booking_id, 'system', 'deposit_expired', 'Η δέσμευση της εγγύησης έληξε');
    });
    notifyAdmin('Η δέσμευση εγγύησης έληξε', { message: 'Η δέσμευση της εγγύησης δεν ισχύει πλέον.', bookingId: dep.booking_id });
  } else if (hold.status === 'captured') {
    transaction(db, () => {
      db.prepare(`UPDATE deposits SET status = 'captured', captured_cents = ?, settled_at = datetime('now') WHERE id = ? AND status = 'held'`).run(
        hold.capturedCents || dep.amount_cents,
        dep.id,
      );
    });
  }
  return getDeposit(db, dep.id);
}

// ---------------------------------------------------------------------------
// Χρεώσεις μετά την επιστροφή
// ---------------------------------------------------------------------------

function addCharge(db, bookingId, { category, description, amountCents, evidence, customerConsent, actor }) {
  if (!CATEGORIES.includes(category)) throw new BookingError('Επιλέξτε κατηγορία χρέωσης.');
  if (!description) throw new BookingError('Περιγράψτε τη χρέωση.');
  if (!(amountCents > 0)) throw new BookingError('Συμπληρώστε ποσό.');
  const isDamage = category === 'damage';
  if (isDamage && !evidence) throw new BookingError('Για χρέωση ζημιάς απαιτείται τεκμηρίωση (π.χ. αριθμός πρακτικού, φωτογραφίες, εκτίμηση συνεργείου).');
  const id = transaction(db, () => {
    const booking = bookings.getById(db, bookingId);
    if (!['active', 'completed'].includes(booking.status)) {
      throw new BookingError('Χρεώσεις καταχωρούνται μόνο μετά την παράδοση του αυτοκινήτου.');
    }
    let status = 'accepted';
    let consent = 'Σύμφωνα με τους όρους ενοικίασης';
    let respondBy = null;
    if (isDamage) {
      if (customerConsent) {
        consent = `Γραπτή συναίνεση πελάτη: ${customerConsent}`;
      } else {
        status = 'proposed';
        consent = null;
        respondBy = time.addDaysToDate(time.datePart(time.nowLocal()), config.deposits.damageResponseDays);
      }
    }
    const res = db
      .prepare(
        `INSERT INTO booking_charges (booking_id, category, description, amount_cents, status, evidence, consent, respond_by, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(bookingId, category, description, amountCents, status, evidence || null, consent, respondBy, actor);
    bookings.logEvent(db, bookingId, actor, 'charge_added', `${format.label('chargeCategory', category)}: ${description} ${format.money(amountCents)}`);
    return Number(res.lastInsertRowid);
  });
  const charge = db.prepare('SELECT * FROM booking_charges WHERE id = ?').get(id);
  if (charge.status === 'proposed') {
    const booking = bookings.getById(db, bookingId);
    mailer.sendInBackground({
      to: booking.email,
      subject: `Αναφορά ζημιάς - κράτηση ${booking.reference}`,
      template: 'charge-notice',
      data: { booking, charge },
    });
  }
  return charge;
}

function getCharge(db, bookingId, chargeId) {
  return db.prepare('SELECT * FROM booking_charges WHERE id = ? AND booking_id = ?').get(chargeId, bookingId) || null;
}

// Απάντηση του πελάτη σε χρέωση ζημιάς.
function respondToCharge(db, bookingId, chargeId, { accept, note, actor }) {
  transaction(db, () => {
    const charge = getCharge(db, bookingId, chargeId);
    if (!charge || charge.status !== 'proposed') throw new BookingError('Η χρέωση δεν περιμένει απάντηση.');
    if (accept) {
      db.prepare(
        `UPDATE booking_charges SET status = 'accepted', consent = ?, customer_note = ?, responded_at = datetime('now') WHERE id = ?`,
      ).run(`Αποδοχή online από τον πελάτη (${new Date().toISOString()})`, note || null, charge.id);
    } else {
      db.prepare(`UPDATE booking_charges SET status = 'disputed', customer_note = ?, responded_at = datetime('now') WHERE id = ?`).run(
        note || null,
        charge.id,
      );
    }
    bookings.logEvent(db, bookingId, actor, accept ? 'charge_accepted' : 'charge_disputed', `${charge.description}${note ? ` — «${note}»` : ''}`);
  });
  const booking = bookings.getById(db, bookingId);
  mailer.sendInBackground({
    to: config.mail.adminNotify,
    subject: `${accept ? 'Αποδοχή' : 'ΑΜΦΙΣΒΗΤΗΣΗ'} χρέωσης ζημιάς - κράτηση ${booking.reference}`,
    template: 'admin-charge-response',
    data: { booking, charge: getCharge(db, bookingId, chargeId), accept },
  });
}

// Ενέργειες του γραφείου πάνω σε μια χρέωση.
function adminChargeAction(db, bookingId, chargeId, action, { consentNote, method, actor }) {
  transaction(db, () => {
    const charge = getCharge(db, bookingId, chargeId);
    if (!charge) throw new BookingError('Η χρέωση δεν βρέθηκε.');
    if (action === 'accept') {
      if (!['proposed', 'disputed'].includes(charge.status)) throw new BookingError('Η χρέωση δεν περιμένει αποδοχή.');
      if (!consentNote) throw new BookingError('Περιγράψτε πώς συναίνεσε ο πελάτης (π.χ. «υπέγραψε το πρακτικό ζημιάς Νο 123»).');
      db.prepare(`UPDATE booking_charges SET status = 'accepted', consent = ?, responded_at = datetime('now') WHERE id = ?`).run(
        `Γραπτή συναίνεση πελάτη: ${consentNote}`,
        charge.id,
      );
    } else if (action === 'withdraw') {
      if (charge.paid_cents > 0 || charge.status === 'withdrawn') throw new BookingError('Η χρέωση δεν μπορεί να αποσυρθεί.');
      db.prepare(`UPDATE booking_charges SET status = 'withdrawn' WHERE id = ?`).run(charge.id);
    } else if (action === 'mark_paid') {
      if (charge.status !== 'accepted' || charge.paid_cents >= charge.amount_cents) throw new BookingError('Η χρέωση δεν είναι προς εξόφληση.');
      db.prepare(
        `UPDATE booking_charges SET paid_cents = amount_cents, status = 'charged', charged_via = ?, charged_at = datetime('now') WHERE id = ?`,
      ).run(method === 'pos' ? 'pos' : 'other', charge.id);
    } else {
      throw new BookingError('Άγνωστη ενέργεια.');
    }
    bookings.logEvent(db, bookingId, actor, `charge_${action}`, charge.description);
  });
}

// Μοιράζει ένα ποσό που εισπράχθηκε στις εκκρεμείς αποδεκτές χρεώσεις (με σειρά καταχώρησης).
function allocateToCharges(db, bookingId, amountCents, via, checkoutId = null) {
  let remaining = amountCents;
  for (const c of outstandingCharges(db, bookingId)) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, c.amount_cents - c.paid_cents);
    const paid = c.paid_cents + take;
    db.prepare(
      `UPDATE booking_charges SET paid_cents = ?, status = CASE WHEN ? >= amount_cents THEN 'charged' ELSE status END,
         charged_via = ?, checkout_id = COALESCE(?, checkout_id),
         charged_at = CASE WHEN ? >= amount_cents THEN datetime('now') ELSE charged_at END
       WHERE id = ?`,
    ).run(paid, paid, via, checkoutId, paid, c.id);
    remaining -= take;
  }
  return remaining;
}

// ---------------------------------------------------------------------------
// Εκκαθάριση / αποδέσμευση
// ---------------------------------------------------------------------------

/**
 * Κλείσιμο εγγύησης μετά την επιστροφή: αφαιρούνται οι αποδεκτές χρεώσεις (έως το ποσό
 * της εγγύησης) και το υπόλοιπο αποδεσμεύεται αμέσως.
 */
async function settleDeposit(db, depositId, { actor, force = false, posConfirmed = false }) {
  const dep = getDeposit(db, depositId);
  if (!dep || dep.status !== 'held') throw new BookingError('Η εγγύηση δεν είναι δεσμευμένη.');
  const booking = bookings.getById(db, dep.booking_id);
  if (booking.status !== 'completed') throw new BookingError('Η εκκαθάριση γίνεται μετά την επιστροφή του αυτοκινήτου.');
  const unresolved = unresolvedDamage(db, booking.id);
  if (unresolved.length && !force) {
    throw new BookingError(
      'Υπάρχουν χρεώσεις ζημιάς χωρίς αποδοχή του πελάτη. Περιμένετε την απάντησή του ή κλείστε την εγγύηση χωρίς αυτές (θα εισπραχθούν χωριστά).',
      'unresolved',
    );
  }
  if (dep.method === 'pos' && !posConfirmed) {
    throw new BookingError('Ολοκληρώστε πρώτα την ενέργεια στο POS (ολοκλήρωση προέγκρισης ή ακύρωση) και επιβεβαιώστε.');
  }
  const due = outstandingCents(db, booking.id);
  const capture = Math.min(due, dep.amount_cents);

  if (dep.method !== 'pos') {
    const provider = providers.get(dep.method);
    if (!provider) throw new BookingError('Ο πάροχος πληρωμών δεν είναι ρυθμισμένος.');
    try {
      if (capture > 0) await provider.captureHold(dep.hold_ref, capture, `deposit-capture-${dep.id}-${capture}`);
      else await provider.releaseHold(dep.hold_ref, `deposit-release-${dep.id}`);
    } catch (err) {
      const fresh = await syncHold(db, dep.id).catch(() => null);
      if (fresh && fresh.status !== 'held') {
        throw new BookingError('Η δέσμευση δεν ισχύει πλέον στον πάροχο (έληξε ή ακυρώθηκε). Οι χρεώσεις πρέπει να εισπραχθούν χωριστά.');
      }
      throw new BookingError(`Ο πάροχος απέρριψε την ενέργεια: ${err.message}`);
    }
  }

  transaction(db, () => {
    db.prepare(`UPDATE deposits SET status = ?, captured_cents = ?, settled_at = datetime('now') WHERE id = ? AND status = 'held'`).run(
      capture > 0 ? 'captured' : 'released',
      capture,
      dep.id,
    );
    if (capture > 0) allocateToCharges(db, booking.id, capture, dep.method === 'pos' ? 'pos' : 'deposit');
    bookings.logEvent(
      db,
      booking.id,
      actor,
      'deposit_settled',
      capture > 0
        ? `Παρακράτηση ${format.money(capture)} από την εγγύηση, αποδέσμευση ${format.money(dep.amount_cents - capture)}`
        : `Αποδέσμευση εγγύησης ${format.money(dep.amount_cents)}`,
    );
  });

  const settled = getDeposit(db, dep.id);
  mailer.sendInBackground({
    to: booking.email,
    subject: `Εγγύηση κράτησης ${booking.reference}: ${capture > 0 ? 'εκκαθάριση' : 'αποδέσμευση'}`,
    template: 'deposit-settled',
    data: {
      booking,
      deposit: settled,
      capturedCents: capture,
      releasedCents: dep.amount_cents - capture,
      charges: chargesForBooking(db, booking.id).filter((c) => c.paid_cents > 0 || c.status === 'accepted'),
      outstandingCents: outstandingCents(db, booking.id),
      unresolved: unresolvedDamage(db, booking.id),
    },
  });
  return { capturedCents: capture, releasedCents: dep.amount_cents - capture, outstandingCents: outstandingCents(db, booking.id) };
}

/**
 * Πλήρης αποδέσμευση χωρίς χρεώσεις (π.χ. ακύρωση κράτησης ή αλλαγή κάρτας).
 */
async function releaseDeposit(db, depositId, { actor, reason = null }) {
  const dep = getDeposit(db, depositId);
  if (!dep || !['awaiting', 'held'].includes(dep.status)) return dep;
  if (dep.status === 'awaiting') {
    transaction(db, () => {
      db.prepare(`UPDATE deposits SET status = 'cancelled', settled_at = datetime('now') WHERE id = ? AND status = 'awaiting'`).run(dep.id);
      bookings.logEvent(db, dep.booking_id, actor, 'deposit_link_cancelled', reason);
    });
    await expireDepositCheckouts(db, dep.booking_id, [dep.id]);
    return getDeposit(db, dep.id);
  }
  if (dep.method !== 'pos') {
    const provider = providers.get(dep.method);
    if (!provider) throw new BookingError('Ο πάροχος πληρωμών δεν είναι ρυθμισμένος.');
    try {
      await provider.releaseHold(dep.hold_ref, `deposit-release-${dep.id}`);
    } catch (err) {
      const fresh = await syncHold(db, dep.id).catch(() => null);
      if (!fresh || fresh.status === 'held') throw new BookingError(`Ο πάροχος απέρριψε την αποδέσμευση: ${err.message}`);
      return fresh;
    }
  }
  transaction(db, () => {
    db.prepare(`UPDATE deposits SET status = 'released', settled_at = datetime('now') WHERE id = ? AND status = 'held'`).run(dep.id);
    bookings.logEvent(db, dep.booking_id, actor, 'deposit_released', `Αποδέσμευση εγγύησης ${format.money(dep.amount_cents)}${reason ? ` - ${reason}` : ''}`);
  });
  if (dep.method === 'pos') {
    notifyAdmin('Ακυρώστε την προέγκριση στο POS', {
      message: `Η εγγύηση ${format.money(dep.amount_cents)} (έγκριση ${dep.hold_ref}) πρέπει να ακυρωθεί στο τερματικό POS.`,
      bookingId: dep.booking_id,
    });
  }
  return getDeposit(db, dep.id);
}

async function releaseAllForBooking(db, bookingId, { actor, reason }) {
  for (const dep of db.prepare(`SELECT id FROM deposits WHERE booking_id = ? AND status IN ('awaiting', 'held')`).all(bookingId)) {
    await releaseDeposit(db, dep.id, { actor, reason });
  }
}

// ---------------------------------------------------------------------------
// Περιοδικές εργασίες & ειδοποιήσεις
// ---------------------------------------------------------------------------

// Αυτόματη αποδέσμευση online εγγυήσεων όταν το αυτοκίνητο επιστράφηκε χωρίς χρεώσεις.
async function autoRelease(db) {
  const hours = config.deposits.autoReleaseHours;
  if (!(hours > 0)) return 0;
  const rows = db
    .prepare(
      `SELECT d.id FROM deposits d JOIN bookings b ON b.id = d.booking_id
       WHERE d.status = 'held' AND d.method != 'pos' AND b.status = 'completed'
         AND EXISTS (SELECT 1 FROM booking_events e WHERE e.booking_id = b.id AND e.action = 'returned'
                     AND e.created_at <= datetime('now', ?))
         AND NOT EXISTS (SELECT 1 FROM booking_charges c WHERE c.booking_id = b.id
                         AND (c.status IN ('proposed', 'disputed') OR (c.status = 'accepted' AND c.paid_cents < c.amount_cents)))`,
    )
    .all(`-${hours} hours`);
  for (const { id } of rows) {
    try {
      await releaseDeposit(db, id, { actor: 'system', reason: `Αυτόματη αποδέσμευση ${hours} ώρες μετά την επιστροφή χωρίς χρεώσεις` });
    } catch (err) {
      console.error(`[deposit ${id}] Αυτόματη αποδέσμευση:`, err.message);
    }
  }
  return rows.length;
}

async function syncHeldDeposits(db, { limit = 20 } = {}) {
  const rows = db.prepare(`SELECT id FROM deposits WHERE status = 'held' AND method != 'pos' ORDER BY id LIMIT ?`).all(limit);
  for (const { id } of rows) {
    try {
      await syncHold(db, id);
    } catch (err) {
      console.error(`[deposit ${id}] Συγχρονισμός:`, err.message);
    }
  }
}

// Λίστα για τον πίνακα ελέγχου: εγγυήσεις που χρειάζονται ενέργεια.
function attentionList(db, nowMs = Date.now()) {
  const rows = db
    .prepare(
      `SELECT d.*, b.reference, b.status AS booking_status, b.return_at, b.pickup_at, b.first_name, b.last_name, b.deposit_cents AS required_cents
       FROM deposits d JOIN bookings b ON b.id = d.booking_id
       WHERE d.status IN ('held', 'awaiting') ORDER BY b.return_at`,
    )
    .all();
  const nowLocal = time.nowLocal(new Date(nowMs));
  const out = [];
  for (const r of rows) {
    const notes = [];
    if (r.status === 'held') {
      if (r.capture_deadline_ms && r.capture_deadline_ms < nowMs + 24 * 3600 * 1000) notes.push('Η δέσμευση λήγει σε λιγότερο από 24 ώρες');
      else if (r.capture_deadline_ms) {
        const ret = time.localToDate(r.return_at);
        if (ret && r.capture_deadline_ms < ret.getTime() + 24 * 3600 * 1000) notes.push('Η δέσμευση λήγει πριν ή αμέσως μετά την επιστροφή');
      }
      if (r.booking_status === 'completed') notes.push('Το αυτοκίνητο επιστράφηκε: εκκαθαρίστε την εγγύηση');
      if (r.failure_reason) notes.push(r.failure_reason);
    } else if (r.status === 'awaiting' && r.booking_status === 'active') {
      notes.push('Το αυτοκίνητο παραδόθηκε χωρίς δεσμευμένη εγγύηση');
    } else if (r.status === 'awaiting' && r.pickup_at <= nowLocal) {
      notes.push('Ο πελάτης δεν έχει εγκρίνει ακόμη την εγγύηση');
    }
    if (notes.length) out.push({ ...r, notes });
  }
  const disputed = db
    .prepare(
      `SELECT c.*, b.reference, b.id AS booking_id FROM booking_charges c JOIN bookings b ON b.id = c.booking_id
       WHERE c.status IN ('disputed', 'proposed') ORDER BY c.id`,
    )
    .all();
  return { deposits: out, charges: disputed };
}

module.exports = {
  CATEGORIES,
  getDeposit,
  listForBooking,
  activeDeposit,
  heldDeposit,
  chargesForBooking,
  outstandingCharges,
  outstandingCents,
  unresolvedDamage,
  findByToken,
  holdWindow,
  linkUrl,
  recordPosHold,
  createOnlineLink,
  sendLinkEmail,
  startOnlineHold,
  syncFromCheckout,
  syncHold,
  addCharge,
  getCharge,
  respondToCharge,
  adminChargeAction,
  allocateToCharges,
  settleDeposit,
  releaseDeposit,
  releaseAllForBooking,
  autoRelease,
  syncHeldDeposits,
  attentionList,
};
