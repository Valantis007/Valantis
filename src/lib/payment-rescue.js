'use strict';

// Διάσωση πληρωμών με κάρτα που απέτυχαν ή εγκαταλείφθηκαν (π.χ. η κάρτα απορρίφθηκε, απέτυχε
// το 3-D Secure ή ο πελάτης έκλεισε τη σελίδα πληρωμής):
//
//  1. «Πληρωμή κατά την παραλαβή» στη σελίδα μιας κράτησης που περιμένει πληρωμή: κλείνουν οι
//     σελίδες πληρωμής στον πάροχο και η κράτηση επιβεβαιώνεται όπως μια κράτηση με πληρωμή κατά
//     την παραλαβή (ίδια emails). Αν η πληρωμή με κάρτα ολοκληρωθεί τελικά (webhook ή περιοδικός
//     συγχρονισμός), καταγράφεται κανονικά στην κράτηση (payments.js → handleRentalPaid).
//  2. Email «Η κράτησή σας δεν έχει ολοκληρωθεί» μία φορά, λίγα λεπτά μετά την κράτηση
//     (PAYMENT_REMINDER_MINUTES), πάντα πριν λήξει η δέσμευση του αυτοκινήτου.
//  3. «Κάντε νέα αναζήτηση» για μια κράτηση που έληξε: η ίδια αναζήτηση (σημεία, ημερομηνίες, ώρες).

const config = require('../config');
const bookings = require('./bookings');
const payments = require('./payments');
const providers = require('./providers');
const mailer = require('./mailer');
const time = require('./time');
const i18n = require('./i18n');
const { searchQuery } = require('./search');
const { openCheckouts } = require('./checkouts');
const { transaction } = require('../db');

const { BookingError } = bookings;

// Καταστάσεις του παρόχου όπου η πληρωμή είναι σε εξέλιξη (π.χ. έλεγχος της τράπεζας).
const IN_PROGRESS = ['processing', 'authorised'];

// Κράτηση που δεν περιμένει πλέον πληρωμή επειδή επιβεβαιώθηκε ήδη: 'paid' (πληρώθηκε με κάρτα)
// ή 'already' (έγινε ήδη η αλλαγή σε πληρωμή κατά την παραλαβή)· αλλιώς null.
function settledState(b) {
  if (!b || !['confirmed', 'active', 'completed'].includes(b.status)) return null;
  if (b.payment_status === 'paid') return 'paid';
  if (b.switched_to_pickup_at && b.payment_method === 'pay_at_pickup') return 'already';
  return null;
}

/**
 * Ο πελάτης επιλέγει «Πληρωμή κατά την παραλαβή» για μια κράτηση που περιμένει πληρωμή με κάρτα.
 *
 * Σειρά (ασφαλής απέναντι σε μια πληρωμή που ολοκληρώνεται την ίδια στιγμή):
 *  1. Κλείνουν οι ανοιχτές σελίδες πληρωμής στον πάροχο και διαβάζεται η κατάστασή τους. Αν μία
 *     είχε ήδη πληρωθεί, η κράτηση επιβεβαιώνεται ως πληρωμένη (κανονική ροή) και δεν αλλάζει τίποτα.
 *  2. Η αλλαγή γίνεται μέσα σε συναλλαγή και μόνο αν η κράτηση περιμένει ακόμη πληρωμή. Μια πληρωμή
 *     που φτάσει μετά καταγράφεται στην κράτηση (switched_to_pickup_at), χωρίς δεύτερη επιβεβαίωση.
 *
 * @returns {{ result: 'confirmed' | 'already' | 'paid', booking }}
 *   'already': η αλλαγή είχε ήδη γίνει (π.χ. διπλό πάτημα)· 'paid': η πληρωμή με κάρτα είχε ήδη ολοκληρωθεί.
 */
async function switchToPayAtPickup(db, bookingId, { actor = 'guest' } = {}) {
  const before = bookings.getById(db, bookingId);
  const settled = settledState(before);
  if (settled) return { result: settled, booking: before };
  if (!bookings.canSwitchToPayAtPickup(before)) {
    throw new BookingError('Η πληρωμή κατά την παραλαβή δεν είναι πλέον δυνατή για αυτή την κράτηση.', 'not_switchable');
  }

  const rows = openCheckouts(db, bookingId, 'rental');
  await payments.expireOpenCheckouts(db, bookingId, 'rental');
  for (const row of rows) {
    try {
      await payments.reconcileCheckout(db, row.id, { actor });
    } catch (err) {
      // Ο πάροχος δεν απαντά: η αλλαγή γίνεται κανονικά· μια πληρωμή που θα φανεί αργότερα καταγράφεται στην κράτηση.
      console.warn('[payments] Αδυναμία ελέγχου σελίδας πληρωμής πριν την αλλαγή σε πληρωμή κατά την παραλαβή:', err.message);
    }
  }

  const outcome = transaction(db, () => {
    const b = bookings.getById(db, bookingId);
    const done = settledState(b);
    if (done) return done;
    if (!bookings.canSwitchToPayAtPickup(b)) {
      throw new BookingError('Η πληρωμή κατά την παραλαβή δεν είναι πλέον δυνατή για αυτή την κράτηση.', 'not_switchable');
    }
    const res = db
      .prepare(
        `UPDATE bookings SET status = 'confirmed', payment_method = 'pay_at_pickup', hold_expires_at = NULL,
           switched_to_pickup_at = datetime('now')
         WHERE id = ? AND status = 'pending_payment' AND payment_status = 'unpaid'`,
      )
      .run(b.id);
    if (!res.changes) throw new BookingError('Η κράτηση άλλαξε στο μεταξύ. Ανανεώστε τη σελίδα.', 'conflict');
    bookings.logEvent(db, b.id, actor, 'switched_to_pickup', 'Η πληρωμή με κάρτα δεν ολοκληρώθηκε· ο πελάτης επέλεξε πληρωμή κατά την παραλαβή');
    return 'confirmed';
  });

  const booking = bookings.getById(db, bookingId);
  if (outcome !== 'confirmed') return { result: outcome, booking };
  // Ίδια emails με μια κράτηση με πληρωμή κατά την παραλαβή: επιβεβαίωση (με τους όρους συνημμένους) και ειδοποίηση του γραφείου.
  bookings.notifyConfirmed(db, booking);
  // Μια σελίδα πληρωμής που άνοιξε στο μεταξύ (π.χ. «Πληρωμή» σε άλλη καρτέλα) κλείνει κι αυτή.
  // Αν πληρωθεί παρ' όλα αυτά, η πληρωμή καταγράφεται στην κράτηση (payments.js → handleRentalPaid).
  try {
    await payments.expireOpenCheckouts(db, bookingId, 'rental');
  } catch (err) {
    console.warn('[payments] Αδυναμία κλεισίματος σελίδας πληρωμής μετά την αλλαγή σε πληρωμή κατά την παραλαβή:', err.message);
  }
  return { result: 'confirmed', booking };
}

// Η υπενθύμιση στέλνεται μόνο αν ο πελάτης έχει ακόμη χρόνο να ολοκληρώσει την κράτηση.
const MIN_HOLD_LEFT_MS = 5 * 60 * 1000;

/**
 * Email «Η κράτησή σας δεν έχει ολοκληρωθεί»: μία φορά για κάθε κράτηση που περιμένει ακόμη
 * πληρωμή PAYMENT_REMINDER_MINUTES λεπτά μετά τη δημιουργία της, αν απομένουν τουλάχιστον
 * 5 λεπτά δέσμευσης. Καλείται από την περιοδική εργασία (κάθε λεπτό).
 */

async function sendPaymentReminders(db, { nowMs = Date.now(), limit = 20 } = {}) {
  const minutes = config.rules.paymentReminderMinutes;
  if (!(minutes > 0)) return 0;
  const createdBefore = Math.floor(nowMs / 1000) - minutes * 60;
  const candidates = db
    .prepare(
      `SELECT id FROM bookings
       WHERE status = 'pending_payment' AND payment_status = 'unpaid' AND payment_reminder_sent_at IS NULL
         AND created_at <= datetime(?, 'unixepoch') AND hold_expires_at > ?
       ORDER BY id LIMIT ?`,
    )
    .all(createdBefore, nowMs + MIN_HOLD_LEFT_MS, limit);

  let sent = 0;
  for (const { id } of candidates) {
    // Πρώτα ο πάροχος: ο πελάτης μπορεί να πλήρωσε ήδη (το webhook ή ο συγχρονισμός δεν έφτασαν ακόμη).
    let inProgress = false;
    for (const row of openCheckouts(db, id, 'rental')) {
      try {
        const r = await payments.reconcileCheckout(db, row.id, { actor: 'system-sync' });
        if (IN_PROGRESS.includes(r.result)) inProgress = true;
      } catch (err) {
        console.warn(`[reminder] Αδυναμία ελέγχου πληρωμής ${row.id}:`, err.message);
      }
    }
    // Πληρωμή σε εξέλιξη: δεν χρειάζεται υπενθύμιση (ξαναελέγχεται στον επόμενο κύκλο).
    if (inProgress) continue;

    const claimed = transaction(db, () => {
      const res = db
        .prepare(
          `UPDATE bookings SET payment_reminder_sent_at = datetime('now')
           WHERE id = ? AND status = 'pending_payment' AND payment_status = 'unpaid' AND payment_reminder_sent_at IS NULL AND hold_expires_at > ?`,
        )
        .run(id, nowMs + MIN_HOLD_LEFT_MS);
      if (res.changes) bookings.logEvent(db, id, 'system', 'payment_reminder', 'Στάλθηκε email «Η κράτησή σας δεν έχει ολοκληρωθεί»');
      return res.changes > 0;
    });
    if (!claimed) continue;

    const booking = bookings.getById(db, id);
    mailer.sendInBackground({
      to: booking.email,
      subject: i18n.msg('Η κράτησή σας δεν έχει ολοκληρωθεί - κράτηση {ref}', { ref: booking.reference }),
      template: 'payment-reminder',
      data: {
        booking,
        extras: bookings.getExtras(db, booking.id),
        canPayCard: providers.onlineEnabled(),
        canPayAtPickup: bookings.canSwitchToPayAtPickup(booking, { nowMs }),
      },
      // Με τη βάση: κουμπί «Η κράτησή μου» (σύνδεσμος /b/<token> με ένα πάτημα).
      db,
    });
    sent += 1;
  }
  return sent;
}

/** Το query string της αναζήτησης μιας κράτησης (σημεία, ημερομηνίες, ώρες), για το /cars?… */
function searchQueryFor(booking) {
  return searchQuery({
    pickup_location: String(booking.pickup_location_id),
    return_location: String(booking.return_location_id),
    pickup_date: time.datePart(booking.pickup_at),
    pickup_time: time.timePart(booking.pickup_at),
    return_date: time.datePart(booking.return_at),
    return_time: time.timePart(booking.return_at),
  });
}

module.exports = { switchToPayAtPickup, sendPaymentReminders, searchQueryFor };
