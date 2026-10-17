'use strict';

// Χρήση: npm run clear-test-data -- --yes
//
// Μετά τις δοκιμές και ΠΡΙΝ το άνοιγμα: διαγράφει κρατήσεις, πληρωμές, εγγυήσεις, χρεώσεις,
// παραστατικά, μηνύματα και λογαριασμούς πελατών που δημιουργήθηκαν κατά τις δοκιμές.
// Κρατά τα αυτοκίνητα, τα σημεία, τα πρόσθετα, τις εποχικές τιμές και τους διαχειριστές.
// Πριν από τη διαγραφή κρατά αντίγραφο της βάσης δίπλα στο αρχείο της.

// Με σειρά ώστε να μη σπάνε οι αναφορές μεταξύ πινάκων.
const TABLES = [
  'fiscal_docs',
  'refunds',
  'booking_charges',
  'deposits',
  'checkouts',
  'booking_events',
  'booking_extras',
  'bookings',
  'messages',
  'processed_webhooks',
  'sessions',
];

function counts(db) {
  const out = {};
  for (const t of TABLES) out[t] = db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  out.customers = db.prepare(`SELECT COUNT(*) n FROM users WHERE role = 'customer'`).get().n;
  return out;
}

function clearTestData(db) {
  const { transaction } = require('./index');
  return transaction(db, () => {
    const before = counts(db);
    for (const t of TABLES) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare(`DELETE FROM users WHERE role = 'customer'`).run();
    db.prepare('DELETE FROM car_blocks').run();
    return before;
  });
}

if (require.main === module) {
  const config = require('../config');
  const { openDb } = require('./index');
  const db = openDb(config.dbPath);
  const before = counts(db);
  console.log('Θα διαγραφούν:');
  console.log(`  κρατήσεις: ${before.bookings}, πληρωμές/σελίδες πληρωμής: ${before.checkouts}, εγγυήσεις: ${before.deposits}`);
  console.log(`  χρεώσεις: ${before.booking_charges}, επιστροφές: ${before.refunds}, παραστατικά: ${before.fiscal_docs}`);
  console.log(`  μηνύματα: ${before.messages}, λογαριασμοί πελατών: ${before.customers}, συνδέσεις: ${before.sessions}`);
  console.log('Μένουν: αυτοκίνητα, σημεία, πρόσθετα, εποχικές τιμές, διαχειριστές.');
  if (!process.argv.includes('--yes')) {
    console.log('\nΓια να γίνει η διαγραφή τρέξτε: npm run clear-test-data -- --yes');
    console.log('ΠΡΟΣΟΧΗ: μην το τρέξετε αφού ανοίξει η ιστοσελίδα — θα διαγραφούν πραγματικές κρατήσεις.');
    process.exit(0);
  }
  if (config.dbPath !== ':memory:') {
    const backup = `${config.dbPath}.before-clear-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
    db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    console.log(`Αντίγραφο ασφαλείας: ${backup}`);
  }
  clearTestData(db);
  db.exec('VACUUM');
  console.log('Τα δοκιμαστικά δεδομένα διαγράφηκαν. Η ιστοσελίδα είναι έτοιμη για πραγματικές κρατήσεις.');
  db.close();
}

module.exports = { clearTestData };
