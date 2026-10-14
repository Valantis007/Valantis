'use strict';

// Περιοδικές εργασίες: λήξη απλήρωτων κρατήσεων, συγχρονισμός πληρωμών που
// δεν ειδοποιήθηκαν με webhook, επανάληψη επιστροφών χρημάτων, εγγυήσεις.

const bookings = require('./bookings');
const payments = require('./payments');
const deposits = require('./deposits');
const { expireOpenCheckouts } = require('./checkouts');

let running = false;
let lastSlow = 0;

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
      await deposits.syncHeldDeposits(db);
      await deposits.autoRelease(db);
    }
  } catch (err) {
    console.error('[maintenance]', err);
  } finally {
    running = false;
  }
}

module.exports = { runMaintenance };
