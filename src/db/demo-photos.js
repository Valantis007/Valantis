'use strict';

// Ενδεικτικές φωτογραφίες (Wikimedia Commons) για όσα αυτοκίνητα δεν έχουν δική σας φωτογραφία.
// Χρήση: npm run demo-photos   (ή από τη Διαχείριση → Στόλος → «Λήψη ενδεικτικών φωτογραφιών»)

const config = require('../config');
const { openDb } = require('./index');
const { addDemoPhotos } = require('../lib/demo-photos');

(async () => {
  const db = openDb(config.dbPath);
  const result = await addDemoPhotos(db, config.uploadDir);
  if (!result.considered) console.log('Όλα τα αυτοκίνητα έχουν ήδη φωτογραφία.');
  for (const name of result.added) console.log(`✓ ${name}`);
  for (const f of result.failed) console.log(`✕ ${f.car}: ${f.reason}`);
  db.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
