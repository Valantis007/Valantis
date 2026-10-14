'use strict';

// Περιοδικές εργασίες: λήξη απλήρωτων κρατήσεων, συγχρονισμός πληρωμών που
// δεν ειδοποιήθηκαν με webhook, επανάληψη επιστροφών χρημάτων, εγγυήσεις.

const bookings = require('./bookings');
const payments = require('./payments');
const deposits = require('./deposits');
const config = require('../config');
const time = require('./time');
const { expireOpenCheckouts } = require('./checkouts');

let running = false;
let lastSlow = 0;
let lastPurge = 0;

/**
 * Διατήρηση δεδομένων (ΓΚΠΔ, αρχή περιορισμού της αποθήκευσης): μετά από
 * `retention.operationalMonths` από την επιστροφή διαγράφονται τα στοιχεία διπλώματος,
 * γέννησης, τηλέφωνο, πτήση, σημειώσεις. Μένουν όσα χρειάζονται για τα φορολογικά βιβλία
 * (ονοματεπώνυμο, email, ποσά, στοιχεία τιμολογίου). Δεν αγγίζονται κρατήσεις με εκκρεμή
 * εγγύηση ή χρέωση. Τα μηνύματα επικοινωνίας διαγράφονται μετά από `retention.messagesMonths`.
 */
function purgeExpiredPersonalData(db, nowLocal = time.nowLocal()) {
  const cutoff = time.addMinutes(nowLocal, -config.retention.operationalMonths * 30 * 24 * 60);
  const purged = db
    .prepare(
      `UPDATE bookings SET phone = '', birth_date = '', license_number = '', license_country = '', license_issued = '',
         flight_number = NULL, notes = NULL, child_info = NULL, personal_data_purged_at = datetime('now')
       WHERE personal_data_purged_at IS NULL AND status IN ('completed', 'cancelled', 'expired') AND return_at < ?
         AND NOT EXISTS (SELECT 1 FROM deposits d WHERE d.booking_id = bookings.id AND d.status IN ('awaiting', 'held'))
         AND NOT EXISTS (SELECT 1 FROM booking_charges c WHERE c.booking_id = bookings.id
                         AND (c.status IN ('proposed', 'disputed') OR (c.status = 'accepted' AND c.paid_cents < c.amount_cents)))`,
    )
    .run(cutoff).changes;
  const messages = db
    .prepare(`DELETE FROM messages WHERE created_at < datetime('now', ?)`)
    .run(`-${config.retention.messagesMonths} months`).changes;
  return { purged, messages };
}

async function runMaintenance(db, { store = null, force = false } = {}) {
  if (running) return;
  running = true;
  try {
    for (const id of bookings.expireStaleHolds(db)) {
      await expireOpenCheckouts(db, id, 'rental');
    }
    if (store) store.prune();
    // Οι κλήσεις προς τους παρόχους γίνονται λιγότερο συχνά.
    if (force || Date.now() - lastSlow > 5 * 60 * 1000) {
      lastSlow = Date.now();
      await payments.reconcileOpenCheckouts(db);
      await payments.processPendingRefunds(db);
      await payments.checkProviderRefunds(db);
      await deposits.syncHeldDeposits(db);
      await deposits.autoRelease(db);
    }
    if (force || Date.now() - lastPurge > 24 * 60 * 60 * 1000) {
      lastPurge = Date.now();
      purgeExpiredPersonalData(db);
    }
  } catch (err) {
    console.error('[maintenance]', err);
  } finally {
    running = false;
  }
}

module.exports = { runMaintenance, purgeExpiredPersonalData };
