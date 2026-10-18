'use strict';

// «Ρυθμίσεις δοκιμών» (Διαχείριση): αποστολή email και δοκιμαστικές πληρωμές με κάρτα (Stripe),
// χωρίς χειροκίνητη επεξεργασία του .env. Μόνο εκτός παραγωγής. Δεν εμφανίζει ούτε καταγράφει
// ποτέ κωδικούς ή κλειδιά: μόνο «έχει οριστεί ••••1234».

const os = require('node:os');
const path = require('node:path');
const nodemailer = require('nodemailer');
const config = require('../config');
const envFile = require('./env-file');
const { str, isEmail, intOrNull, checkbox } = require('./validation');
const { internationalDigits } = require('./phone');

const MAIL_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'ADMIN_NOTIFY_EMAIL'];
const STRIPE_KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
const WHATSAPP_KEYS = ['COMPANY_WHATSAPP'];
const KEYS = [...MAIL_KEYS, ...STRIPE_KEYS, ...WHATSAPP_KEYS];
const SECRET_KEYS = new Set(['SMTP_PASS', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']);
const GMAIL = { host: 'smtp.gmail.com', port: 465, secure: true };

// Οι τιμές με τις οποίες ξεκίνησε η ιστοσελίδα: ισχύουν μέχρι την επόμενη επανεκκίνηση.
const running = Object.fromEntries(KEYS.map((key) => [key, process.env[key] ?? '']));

const root = path.resolve(__dirname, '..', '..');
const TEMPLATE = path.join(root, '.env.local.example');

/**
 * Το αρχείο που γράφεται. Το dotenv διαβάζει το .env του φακέλου από τον οποίο ξεκινά η ιστοσελίδα
 * (τα start-windows.bat / start-mac.command ξεκινούν από τον φάκελο της ιστοσελίδας).
 * Στα tests ποτέ το πραγματικό .env.
 */
function envPath(explicit = null) {
  if (explicit) return path.resolve(explicit);
  if (process.env.SETTINGS_ENV_PATH) return path.resolve(process.env.SETTINGS_ENV_PATH);
  if (config.isTest) return path.join(os.tmpdir(), `rental-settings-test-${process.pid}.env`);
  return path.resolve(process.cwd(), '.env');
}

/**
 * Τι ισχύει τώρα και τι θα ισχύσει μετά την επανεκκίνηση.
 * Μια μεταβλητή του περιβάλλοντος του υπολογιστή υπερισχύει του .env (δεν αλλάζει από εδώ).
 */
function state(file) {
  const text = envFile.read(file);
  const saved = envFile.parse(text);
  const current = {};
  const pending = [];
  const overridden = [];
  for (const key of KEYS) {
    const system = config.systemEnvKeys.has(key);
    const inFile = Object.hasOwn(saved, key);
    current[key] = system ? running[key] : inFile ? saved[key] : '';
    if (current[key] !== running[key]) pending.push(key);
    if (system && inFile && saved[key] !== '' && saved[key] !== running[key]) overridden.push(key);
  }
  return { exists: text !== null, current, running, pending, overridden };
}

// «έχει οριστεί ••••1234»: μόνο τα 4 τελευταία ψηφία, και κανένα για σύντομες τιμές.
function mask(value) {
  if (!value) return null;
  return value.length >= 12 ? `••••${value.slice(-4)}` : '••••';
}

// ---------------- Email ----------------

function mailForm(cur) {
  const gmail = !cur.SMTP_HOST || cur.SMTP_HOST === GMAIL.host;
  return {
    preset: gmail ? 'gmail' : 'other',
    gmail_user: gmail ? cur.SMTP_USER : '',
    smtp_host: gmail ? '' : cur.SMTP_HOST,
    smtp_port: gmail ? '587' : cur.SMTP_PORT || '587',
    smtp_secure: !gmail && cur.SMTP_SECURE === 'true' ? 'ssl' : 'starttls',
    smtp_user: gmail ? '' : cur.SMTP_USER,
    mail_from: cur.MAIL_FROM,
    admin_notify: cur.ADMIN_NOTIFY_EMAIL,
  };
}

// Όνομα αποστολέα για το «Όνομα <email>» (χωρίς χαρακτήρες που θα το έσπαγαν σε πολλές διευθύνσεις).
function defaultFrom(address) {
  const name = String(config.company.name || '').replace(/["\\\r\n]/g, '').trim();
  if (!name) return address;
  return /[,;:<>@()[\]]/.test(name) ? `"${name}" <${address}>` : `${name} <${address}>`;
}

function parseMail(body, cur) {
  const errors = {};
  const preset = body.preset === 'other' ? 'other' : 'gmail';
  const form = {
    preset,
    gmail_user: str(body.gmail_user, 254),
    smtp_host: str(body.smtp_host, 253),
    smtp_port: str(body.smtp_port, 5),
    smtp_secure: body.smtp_secure === 'ssl' ? 'ssl' : 'starttls',
    smtp_user: str(body.smtp_user, 254),
    mail_from: str(body.mail_from, 254).replace(/[\r\n]/g, ''),
    admin_notify: str(body.admin_notify, 500),
  };
  let host;
  let port;
  let secure;
  let user;
  let typed;
  const passField = preset === 'gmail' ? 'gmail_pass' : 'smtp_pass';
  if (preset === 'gmail') {
    ({ host, port, secure } = GMAIL);
    user = form.gmail_user;
    // Η Google δείχνει τον κωδικό σε 4 ομάδες με κενά: τα κενά αφαιρούνται.
    typed = String(body.gmail_pass || '').replace(/\s+/g, '');
    if (!isEmail(user)) errors.gmail_user = 'Γράψτε τη διεύθυνση Gmail (π.χ. onoma@gmail.com).';
    if (typed && !/^[A-Za-z]{16}$/.test(typed)) {
      errors.gmail_pass = 'Ο κωδικός εφαρμογής έχει 16 γράμματα (π.χ. abcd efgh ijkl mnop). Ο κανονικός κωδικός του Gmail δεν λειτουργεί εδώ.';
    }
  } else {
    host = form.smtp_host.toLowerCase();
    port = intOrNull(form.smtp_port);
    secure = form.smtp_secure === 'ssl';
    user = form.smtp_user;
    typed = str(body.smtp_pass, 200);
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) {
      errors.smtp_host = 'Γράψτε τη διεύθυνση του server, όπως σας τη δίνει ο πάροχος (π.χ. smtp-relay.brevo.com).';
    }
    if (!(port >= 1 && port <= 65535)) errors.smtp_port = 'Η θύρα είναι αριθμός (συνήθως 587 ή 465).';
    if (/\s/.test(user)) errors.smtp_user = 'Το όνομα χρήστη δεν περιέχει κενά.';
    if (!user && typed) errors.smtp_user = 'Γράψτε και το όνομα χρήστη.';
  }

  // Κενός κωδικός = μένει ο αποθηκευμένος, μόνο αν δεν άλλαξαν ο server και ο χρήστης.
  let pass = typed;
  let keepPass = false;
  if (!pass && user) {
    if (cur.SMTP_PASS && host === cur.SMTP_HOST && user === cur.SMTP_USER) {
      pass = cur.SMTP_PASS;
      keepPass = true;
    } else if (!errors[passField]) {
      errors[passField] = preset === 'gmail' ? 'Γράψτε τον κωδικό εφαρμογής (16 γράμματα).' : 'Γράψτε τον κωδικό.';
    }
  }

  let from = form.mail_from;
  if (!from) {
    if (isEmail(user)) from = defaultFrom(user);
    else errors.mail_from = 'Γράψτε τον αποστολέα (π.χ. Rent a Car <info@to-domain-sas.gr>).';
  } else {
    const m = /^(.*?)<([^<>]+)>$/.exec(from);
    const address = (m ? m[2] : from).trim();
    if (!isEmail(address) || (m && /[<>]/.test(m[1]))) errors.mail_from = 'Μορφή: Όνομα <email> ή σκέτο email (π.χ. Rent a Car <onoma@gmail.com>).';
  }

  const notify = form.admin_notify.split(',').map((s) => s.trim()).filter(Boolean);
  if (notify.some((e) => !isEmail(e))) errors.admin_notify = 'Μη έγκυρο email. Για περισσότερες διευθύνσεις, χωρίστε τες με κόμμα.';

  const updates = {
    SMTP_HOST: host,
    SMTP_PORT: String(port),
    SMTP_SECURE: secure ? 'true' : 'false',
    SMTP_USER: user,
    MAIL_FROM: from,
    ADMIN_NOTIFY_EMAIL: notify.join(','),
  };
  if (!keepPass) updates.SMTP_PASS = user ? pass : '';
  return { form, errors, updates, transport: { host, port, secure, user, pass }, gmail: preset === 'gmail', typedPass: Boolean(typed) };
}

// Το πραγματικό σφάλμα του server email, εξηγημένο απλά (και η τεχνική λεπτομέρεια, χωρίς τον κωδικό).
function explainSmtpError(err, { host, port, pass, gmail }) {
  const message = String((err && err.message) || err);
  const text = `${message} ${(err && err.response) || ''}`;
  const code = err && err.code;
  const mismatch = 'Η θύρα και η κρυπτογράφηση δεν ταιριάζουν: για τη θύρα 465 επιλέξτε «SSL/TLS», για τη θύρα 587 «STARTTLS».';
  let reason;
  if (code === 'EAUTH' && gmail && /5\.7\.9|application-specific password/i.test(text)) {
    reason = 'Η Google ζητά κωδικό εφαρμογής: ο κανονικός κωδικός του Gmail δεν λειτουργεί εδώ. Φτιάξτε κωδικό εφαρμογής με τα βήματα της σελίδας.';
  } else if (code === 'EAUTH' && /missing credentials/i.test(text)) {
    reason = 'Λείπει ο κωδικός.';
  } else if (code === 'EAUTH' && gmail) {
    reason = 'Η Google δεν δέχτηκε τη διεύθυνση Gmail ή τον κωδικό εφαρμογής. Ελέγξτε ότι η διεύθυνση είναι σωστή και ότι βάλατε τον κωδικό εφαρμογής των 16 γραμμάτων (όχι τον κανονικό κωδικό του Gmail). Αν αλλάξατε πρόσφατα τον κωδικό του λογαριασμού Google, οι κωδικοί εφαρμογής ακυρώνονται: φτιάξτε νέο.';
  } else if (code === 'EAUTH') {
    reason = 'Ο server email δεν δέχτηκε το όνομα χρήστη ή τον κωδικό. Ελέγξτε τα στοιχεία που σας έδωσε ο πάροχος.';
  } else if (code === 'EDNS' || /ENOTFOUND|EAI_AGAIN/.test(text)) {
    reason = `Δεν βρέθηκε ο server «${host}». Ελέγξτε ότι η διεύθυνση είναι σωστή και ότι ο υπολογιστής έχει σύνδεση στο internet.`;
  } else if (/ECONNREFUSED/.test(text)) {
    reason = `Ο server «${host}» δεν δέχεται συνδέσεις στη θύρα ${port}. Ελέγξτε τη θύρα (συνήθως 587 ή 465).`;
  } else if (/wrong version number|packet length too long|ssl3_get_record|unknown protocol/i.test(text)) {
    reason = mismatch;
  } else if (code === 'ETIMEDOUT' && /greeting/i.test(text)) {
    reason = `Ο server «${host}» συνδέθηκε αλλά δεν απάντησε όπως αναμενόταν. Συνήθως αυτό σημαίνει ότι η θύρα και η κρυπτογράφηση δεν ταιριάζουν: για τη θύρα 465 επιλέξτε «SSL/TLS», για τη θύρα 587 «STARTTLS».`;
  } else if (code === 'ETIMEDOUT' || /ETIMEDOUT|timed? ?out/i.test(text)) {
    reason = `Ο server «${host}» δεν απάντησε (θύρα ${port}). Ελέγξτε τη θύρα και την κρυπτογράφηση· αν είναι σωστές, ίσως το antivirus ή το τείχος προστασίας (firewall) του υπολογιστή μπλοκάρει την αποστολή email.`;
  } else if (/certificate|CERT_|self[- ]signed/i.test(text)) {
    reason = 'Το πιστοποιητικό ασφαλείας του server δεν είναι έγκυρο. Συχνή αιτία: antivirus που ελέγχει τα εξερχόμενα emails (απενεργοποιήστε αυτόν τον έλεγχο) ή λάθος διεύθυνση server.';
  } else {
    reason = 'Η σύνδεση με τον server email απέτυχε.';
  }
  let detail = message.replace(/\s+/g, ' ').trim();
  if (pass) detail = detail.split(pass).join('••••');
  return [reason, `Τεχνική λεπτομέρεια: ${detail.slice(0, 300)}`];
}

// Δοκιμή σύνδεσης (nodemailer verify) με τα στοιχεία της φόρμας, πριν αποθηκευτούν.
async function verifyMail({ host, port, secure, user, pass }, { gmail = false, timeoutMs = 10000 } = {}) {
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs + 5000,
  });
  try {
    await transport.verify();
    return {
      ok: true,
      lines: [
        user
          ? `Η σύνδεση με ${host}:${port} πέτυχε και ο server δέχτηκε το ${gmail ? 'email και τον κωδικό εφαρμογής' : 'όνομα χρήστη και τον κωδικό'}.`
          : `Η σύνδεση με ${host}:${port} πέτυχε.`,
      ],
    };
  } catch (err) {
    return { ok: false, lines: explainSmtpError(err, { host, port, secure, pass, gmail }) };
  } finally {
    transport.close();
  }
}

// ---------------- Stripe (μόνο δοκιμαστικά κλειδιά) ----------------

function stripeKeyProblem(key) {
  if (/^(sk|rk)_live_/.test(key)) {
    return 'Αυτό είναι ΠΡΑΓΜΑΤΙΚΟ κλειδί (live). Εδώ, για δοκιμές, μπαίνει μόνο δοκιμαστικό κλειδί, που ξεκινά με sk_test_. Τα live κλειδιά μπαίνουν μόνο στον πραγματικό server, κατά το άνοιγμα της ιστοσελίδας.';
  }
  if (/^pk_/.test(key)) return 'Αυτό είναι το «Publishable key». Χρειάζεται το «Secret key», που ξεκινά με sk_test_.';
  if (/^rk_/.test(key)) return 'Αυτό είναι «Restricted key». Χρειάζεται το «Secret key», που ξεκινά με sk_test_.';
  if (/^whsec_/.test(key)) return 'Αυτό είναι το webhook secret (whsec_…): μπαίνει στο δεύτερο πεδίο. Εδώ μπαίνει το «Secret key» (sk_test_…).';
  if (!/^sk_test_[A-Za-z0-9]{10,}$/.test(key)) return 'Το κλειδί πρέπει να ξεκινά με sk_test_ (Stripe → Test mode → Developers → API keys → «Secret key»).';
  return null;
}

function parseStripe(body, cur) {
  const errors = {};
  // Τα κενά/αλλαγές γραμμής από την αντιγραφή αφαιρούνται.
  const key = String(body.stripe_key || '').replace(/\s+/g, '').slice(0, 300);
  const hook = String(body.stripe_webhook || '').replace(/\s+/g, '').slice(0, 300);
  const clearKey = checkbox(body.clear_stripe_key) && !key;
  const clearHook = checkbox(body.clear_stripe_webhook) && !hook;
  if (key) {
    const problem = stripeKeyProblem(key);
    if (problem) errors.stripe_key = problem;
  }
  if (hook && !/^whsec_[A-Za-z0-9]+$/.test(hook)) errors.stripe_webhook = 'Το webhook secret ξεκινά με whsec_ (το δίνει το Stripe CLI ή το Stripe → Developers → Webhooks → «Signing secret»).';
  const updates = {};
  if (key) updates.STRIPE_SECRET_KEY = key;
  else if (clearKey) updates.STRIPE_SECRET_KEY = '';
  if (hook) updates.STRIPE_WEBHOOK_SECRET = hook;
  else if (clearHook) updates.STRIPE_WEBHOOK_SECRET = '';
  return {
    errors,
    updates,
    key: key || (clearKey ? '' : cur.STRIPE_SECRET_KEY),
    webhookSecret: hook || (clearHook ? '' : cur.STRIPE_WEBHOOK_SECRET),
    typedKey: Boolean(key),
  };
}

function explainStripeError(err) {
  const type = (err && (err.type || (err.raw && err.raw.type))) || '';
  const message = String((err && err.message) || err).replace(/\s+/g, ' ').trim().slice(0, 300);
  let reason;
  if (type === 'StripeAuthenticationError' || (err && err.statusCode === 401)) {
    reason = 'Το Stripe δεν αναγνώρισε το κλειδί. Αντιγράψτε ξανά ολόκληρο το «Secret key» (Stripe → Test mode → Developers → API keys).';
  } else if (type === 'StripePermissionError' || (err && err.statusCode === 403)) {
    reason = 'Το κλειδί δεν έχει τα απαραίτητα δικαιώματα. Χρησιμοποιήστε το «Secret key» (sk_test_…), όχι κλειδί με περιορισμούς.';
  } else if (type === 'StripeConnectionError') {
    reason = 'Δεν ήταν δυνατή η σύνδεση με το Stripe. Ελέγξτε τη σύνδεση του υπολογιστή στο internet (ή αν το antivirus/τείχος προστασίας μπλοκάρει το Node.js).';
  } else {
    reason = 'Το Stripe απέρριψε τη σύνδεση.';
  }
  return [reason, `Τεχνική λεπτομέρεια: ${message}`];
}

// Δοκιμή σύνδεσης με τον ίδιο έλεγχο που κάνει ο «Έλεγχος συστήματος», για κλειδί που ίσως δεν έχει αποθηκευτεί.
async function verifyStripe({ key, webhookSecret }) {
  const stripe = require('./providers').PROVIDERS.stripe;
  try {
    return await stripe.checkConnection({ client: stripe.clientFor(key), keyMode: stripe.mode(key), webhookSecret });
  } catch (err) {
    return { ok: false, lines: explainStripeError(err) };
  }
}

// ---------------- WhatsApp (αριθμός της επιχείρησης) ----------------

// Αριθμός WhatsApp: αποθηκεύεται σε διεθνή μορφή, μόνο ψηφία (π.χ. «694 123 4567» → 306941234567).
// Κενό = χωρίς WhatsApp.
function parseWhatsapp(body) {
  const typed = str(body.company_whatsapp, 40);
  const errors = {};
  const digits = typed ? internationalDigits(typed) : '';
  if (typed && !digits) {
    errors.company_whatsapp = 'Γράψτε τον αριθμό με τον κωδικό χώρας, μόνο ψηφία (π.χ. 306941234567 για το 694 123 4567).';
  }
  return { form: { company_whatsapp: typed }, errors, updates: { COMPANY_WHATSAPP: digits || '' } };
}

// ---------------- Κανονική λειτουργία (production): μόνο οδηγίες ----------------

const SERVER_GUIDE = [
  ['SMTP_HOST', 'Server αποστολής email της υπηρεσίας email του domain σας (π.χ. Brevo, Google Workspace, Microsoft 365).'],
  ['SMTP_PORT', '587 (ή 465).'],
  ['SMTP_SECURE', 'true μόνο με τη θύρα 465, αλλιώς false.'],
  ['SMTP_USER', 'Όνομα χρήστη SMTP.'],
  ['SMTP_PASS', 'Κωδικός SMTP.'],
  ['MAIL_FROM', 'Αποστολέας, π.χ. "Το Όνομά Σας <info@to-domain-sas.gr>".'],
  ['ADMIN_NOTIFY_EMAIL', 'Πού έρχονται οι ειδοποιήσεις του γραφείου (νέες κρατήσεις κ.λπ.).'],
  ['STRIPE_SECRET_KEY', 'Στις online δοκιμές sk_test_…· στο άνοιγμα το πραγματικό sk_live_….'],
  ['STRIPE_WEBHOOK_SECRET', 'Το «Signing secret» (whsec_…) του webhook προς /webhooks/stripe.'],
  ['COMPANY_WHATSAPP', 'Προαιρετικό: αριθμός WhatsApp της επιχείρησης με τον κωδικό χώρας, μόνο ψηφία (π.χ. 306941234567).', true],
];

function serverGuide() {
  return SERVER_GUIDE.map(([key, text, optional = false]) => ({ key, text, optional, set: Boolean(process.env[key]), secret: SECRET_KEYS.has(key) }));
}

module.exports = {
  KEYS,
  MAIL_KEYS,
  STRIPE_KEYS,
  WHATSAPP_KEYS,
  parseWhatsapp,
  GMAIL,
  TEMPLATE,
  envPath,
  state,
  mask,
  mailForm,
  parseMail,
  verifyMail,
  explainSmtpError,
  stripeKeyProblem,
  parseStripe,
  verifyStripe,
  explainStripeError,
  serverGuide,
};
