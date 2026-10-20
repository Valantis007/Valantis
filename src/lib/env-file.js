'use strict';

// Ανάγνωση και ενημέρωση του αρχείου .env (σελίδα «Ρυθμίσεις δοκιμών»).
// Οι γραμμές που αλλάζουν ενημερώνονται στη θέση τους· σχόλια και υπόλοιπες γραμμές μένουν όπως είναι.
// Οι τιμές (κωδικοί, κλειδιά) δεν γράφονται ποτέ στο log.

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
// Τιμές που γράφονται χωρίς εισαγωγικά (π.χ. smtp.gmail.com, 465, sk_test_...).
const BARE_RE = /^[A-Za-z0-9_@.:/+,-]*$/;

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function parse(text) {
  return text ? dotenv.parse(text) : {};
}

/**
 * Η τιμή όπως γράφεται στο .env, ώστε το dotenv να τη διαβάσει ακριβώς ίδια.
 * Το dotenv δεν έχει χαρακτήρα διαφυγής: διαλέγουμε εισαγωγικά που δεν υπάρχουν μέσα στην τιμή.
 * Επιστρέφει null αν η τιμή δεν μπορεί να γραφτεί με ασφάλεια.
 */
function quote(value) {
  const v = String(value);
  if (/[\r\n\0]/.test(v)) return null;
  if (BARE_RE.test(v)) return v;
  // Μονά εισαγωγικά: το περιεχόμενο διαβάζεται αυτούσιο.
  if (!v.includes("'")) return `'${v}'`;
  // Διπλά: το dotenv μετατρέπει τα \n και \r σε αλλαγή γραμμής, άρα μόνο αν δεν υπάρχουν.
  if (!v.includes('"') && !/\\[nr]/.test(v)) return `"${v}"`;
  if (!v.includes('`')) return `\`${v}\``;
  return null;
}

class EnvValueError extends Error {
  constructor(key) {
    super(`Η τιμή του ${key} περιέχει χαρακτήρες που δεν μπορούν να αποθηκευτούν στο αρχείο .env.`);
    this.key = key;
  }
}

/**
 * Νέο περιεχόμενο του .env με τις τιμές του `updates` ({ KEY: 'τιμή' }).
 * Υπάρχουσες γραμμές του κλειδιού αλλάζουν στη θέση τους· όσα κλειδιά δεν υπάρχουν προστίθενται στο τέλος.
 */
function apply(text, updates) {
  const source = text || '';
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.length ? source.split(/\r?\n/) : [];
  // Το τελευταίο «κομμάτι» μετά την τελική αλλαγή γραμμής είναι κενό: το αφαιρούμε και το ξαναβάζουμε στο τέλος.
  const endsWithNewline = source.length > 0 && /\r?\n$/.test(source);
  if (endsWithNewline) lines.pop();

  const pending = new Map();
  for (const [key, value] of Object.entries(updates)) {
    if (!KEY_RE.test(key)) throw new Error(`Μη έγκυρο όνομα ρύθμισης: ${key}`);
    const quoted = quote(value);
    if (quoted === null) throw new EnvValueError(key);
    pending.set(key, `${key}=${quoted}`);
  }

  const found = new Set();
  const out = lines.map((line) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=/.exec(line);
    if (!m || !pending.has(m[1])) return line;
    found.add(m[1]);
    return pending.get(m[1]);
  });

  const missing = [...pending.keys()].filter((key) => !found.has(key));
  if (missing.length) {
    if (out.length && out[out.length - 1].trim() !== '') out.push('');
    out.push('# Από τη Διαχείριση → Ρυθμίσεις δοκιμών');
    for (const key of missing) out.push(pending.get(key));
  }

  const result = out.join(eol) + eol;
  // Έλεγχος ασφαλείας: το dotenv πρέπει να διαβάζει ακριβώς τις τιμές που αποθηκεύσαμε.
  const check = dotenv.parse(result);
  for (const [key, value] of Object.entries(updates)) {
    if (check[key] !== String(value)) throw new EnvValueError(key);
  }
  return result;
}

/**
 * Γράφει τις τιμές στο αρχείο (το δημιουργεί αν λείπει, με βάση το `template` αν δοθεί).
 * Η εγγραφή γίνεται σε προσωρινό αρχείο και μετά αντικαθιστά το παλιό, ώστε να μη μείνει ποτέ μισό.
 */
function update(file, updates, { template = null } = {}) {
  const existing = read(file);
  const base = existing !== null ? existing : template ? read(template) || '' : '';
  const content = apply(base, updates);
  let mode = 0o600;
  try {
    mode = fs.statSync(file).mode & 0o777;
  } catch {
    // νέο αρχείο
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, content, { mode });
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    // Στα Windows η αντικατάσταση μπορεί να αποτύχει αν κάποιο πρόγραμμα (π.χ. antivirus) κρατά ανοιχτό
    // το αρχείο εκείνη τη στιγμή: τότε γράφεται απευθείας.
    if (!['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err;
    fs.writeFileSync(file, content, { mode });
  }
  return { created: existing === null };
}

module.exports = { read, parse, quote, apply, update, EnvValueError };
