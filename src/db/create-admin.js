'use strict';

// Χρήση: npm run create-admin -- email@example.gr "ΙσχυρόςΚωδικός123"
// Δημιουργεί διαχειριστή ή κάνει διαχειριστή (και αλλάζει τον κωδικό) σε υπάρχοντα χρήστη.

const bcrypt = require('bcryptjs');
const { passwordProblems, isEmail } = require('../lib/validation');

async function upsertAdmin(db, email, password) {
  email = String(email).trim().toLowerCase();
  if (!isEmail(email)) throw new Error('Μη έγκυρο email διαχειριστή.');
  const problem = passwordProblems(String(password));
  if (problem) throw new Error(`Κωδικός διαχειριστή: ${problem}`);
  const hash = await bcrypt.hash(String(password), 12);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    // Ο λογαριασμός μπορεί να τον είχε δημιουργήσει οποιοσδήποτε (δεν υπάρχει επιβεβαίωση email):
    // αλλάζουμε τον κωδικό και αποσυνδέουμε ΟΛΕΣ τις υπάρχουσες συνδέσεις του πριν γίνει διαχειριστής.
    db.prepare(
      `UPDATE users SET role = 'admin', password_hash = ?, reset_token_hash = NULL, reset_expires_at = NULL WHERE id = ?`,
    ).run(hash, existing.id);
    db.prepare(`DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?`).run(existing.id);
    return `Ο υπάρχων λογαριασμός ${email} έγινε διαχειριστής με νέο κωδικό. Όλες οι προηγούμενες συνδέσεις του τερματίστηκαν.`;
  }
  db.prepare(
    `INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, 'Διαχειριστής', '-', 'admin')`,
  ).run(email, hash);
  return `Δημιουργήθηκε διαχειριστής: ${email}`;
}

if (require.main === module) {
  const config = require('../config');
  const { openDb } = require('./index');
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Χρήση: npm run create-admin -- email@example.gr "ΙσχυρόςΚωδικός123"');
    process.exit(1);
  }
  upsertAdmin(openDb(config.dbPath), email, password)
    .then((msg) => console.log(msg))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { upsertAdmin };
