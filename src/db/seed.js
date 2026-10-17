'use strict';

// Χρήση: npm run seed
// Δημιουργεί τη βάση (αν δεν υπάρχει), προσθέτει ενδεικτικά δεδομένα
// και τον αρχικό διαχειριστή από τις μεταβλητές ADMIN_EMAIL / ADMIN_PASSWORD.

const config = require('../config');
const { openDb } = require('./index');
const { seedIfEmpty } = require('./seed-data');
const { upsertAdmin } = require('./create-admin');

const db = openDb(config.dbPath);
seedIfEmpty(db);
console.log(`Η βάση δεδομένων είναι έτοιμη: ${config.dbPath}`);

if (config.admin.email && config.admin.password) {
  upsertAdmin(db, config.admin.email, config.admin.password)
    .then((msg) => console.log(msg))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    });
} else {
  console.log('Για να δημιουργήσετε διαχειριστή: npm run create-admin -- email@example.gr "ΙσχυρόςΚωδικός123"');
}
