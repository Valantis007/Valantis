'use strict';

// Διαχείριση → «Ρυθμίσεις δοκιμών»: email (Gmail / άλλος πάροχος) και κλειδί Stripe (μόνο sk_test_)
// γραμμένα στο .env (εδώ σε προσωρινό αρχείο), «Δοκιμή σύνδεσης» πριν την αποθήκευση,
// «Επανεκκίνηση» χωρίς τερματισμό στα tests, και μόνο οδηγίες σε κανονική λειτουργία (production).

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const dotenv = require('dotenv');
const config = require('../src/config');
const { openDb } = require('../src/db');
const { seedIfEmpty } = require('../src/db/seed-data');
const { createApp } = require('../src/app');
const envFile = require('../src/lib/env-file');
const settings = require('../src/lib/settings');
const stripe = require('../src/lib/providers/stripe');
const { fakeStripe } = require('./fakes');

const EXAMPLE = fs.readFileSync(path.join(__dirname, '..', '.env.local.example'), 'utf8');
const GOOD_KEY = 'sk_test_51AbCdEfGhIjKlMnOpQrStUv9876';

function setup(t, { envText = EXAMPLE, onRestart = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rental-settings-'));
  const envPath = path.join(dir, '.env');
  if (envText !== null) fs.writeFileSync(envPath, envText);
  const db = openDb(':memory:');
  seedIfEmpty(db);
  const app = createApp({ db, uploadDir: path.join(dir, 'uploads'), settingsEnvPath: envPath, onRestart });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return {
    db,
    app,
    envPath,
    text: () => (fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : null),
    values: () => dotenv.parse(fs.readFileSync(envPath, 'utf8')),
  };
}

async function adminAgent(app, db) {
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  return aa;
}

const post = (agent, url, data) => h.post(agent, url, data, '/admin/settings');

async function postJson(agent, url, data) {
  const token = await h.csrf(agent, '/admin/settings');
  return agent.post(url).set('Accept', 'application/json').type('form').send({ ...data, _csrf: token });
}

// Μικρός ψεύτικος server SMTP: δέχεται μόνο τον σωστό κωδικό (όπως το Gmail, απαντά 535 στον λάθος).
async function fakeSmtp(t, { user, pass }) {
  const server = net.createServer((sock) => {
    sock.on('error', () => {});
    sock.write('220 fake ESMTP\r\n');
    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (/^EHLO/i.test(line)) sock.write('250-fake\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH PLAIN /i.test(line)) {
          const [, u, p] = Buffer.from(line.slice(11), 'base64').toString().split('\0');
          sock.write(u === user && p === pass ? '235 2.7.0 Accepted\r\n' : '535-5.7.8 Username and Password not accepted.\r\n535 5.7.8 BadCredentials\r\n');
        } else if (/^QUIT/i.test(line)) sock.end('221 bye\r\n');
        else sock.write('250 ok\r\n');
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return server.address().port;
}

const gmail = (overrides = {}) => ({ preset: 'gmail', gmail_user: 'owner@gmail.com', gmail_pass: 'qwer tyui opas dfgh', mail_from: '', admin_notify: 'office2@example.gr', ...overrides });

test('ρυθμίσεις δοκιμών: μόνο για διαχειριστές, στο μενού της διαχείρισης και στον Έλεγχο συστήματος', async (t) => {
  const { db, app, text } = setup(t);
  const anonymous = await h.request(app).get('/admin/settings');
  assert.equal(anonymous.status, 302);
  const customer = h.agent(app);
  await h.login(customer, await h.createUser(db));
  assert.equal((await customer.get('/admin/settings')).status, 403);
  const denied = await h.post(customer, '/admin/settings/mail', gmail());
  assert.equal(denied.status, 403);
  assert.equal((await h.post(customer, '/admin/settings/restart', {})).status, 403);
  assert.equal(text(), EXAMPLE, 'ο πελάτης δεν αλλάζει τίποτα');

  const aa = await adminAgent(app, db);
  const page = await aa.get('/admin/settings');
  assert.equal(page.status, 200);
  assert.match(page.text, /<h1>Ρυθμίσεις δοκιμών<\/h1>/);
  assert.match(page.text, /href="\/admin\/settings" class="active">Ρυθμίσεις δοκιμών/);
  assert.match(page.text, /myaccount\.google\.com\/apppasswords/);
  assert.match(page.text, /Developers → API keys/);
  assert.match(page.text, /τα emails δεν στέλνονται/);
  const system = await aa.get('/admin/system');
  assert.match(system.text, /href="\/admin\/settings">Ρύθμιση αποστολής email/);
  assert.match(system.text, /href="\/admin\/settings#stripe">Ρύθμιση δοκιμαστικών πληρωμών/);

  // Χωρίς CSRF token καμία αλλαγή.
  const noToken = await aa.post('/admin/settings/mail').type('form').send(gmail());
  assert.equal(noToken.status, 403);
  assert.equal(text(), EXAMPLE);
});

test('Gmail: αποθήκευση στο .env στη θέση των γραμμών, με τα σχόλια, χωρίς να εμφανίζεται ποτέ ο κωδικός', async (t) => {
  const { db, app, text, values } = setup(t);
  const aa = await adminAgent(app, db);
  const res = await post(aa, '/admin/settings/mail', gmail());
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/admin/settings#mail');

  const v = values();
  assert.equal(v.SMTP_HOST, 'smtp.gmail.com');
  assert.equal(v.SMTP_PORT, '465');
  assert.equal(v.SMTP_SECURE, 'true');
  assert.equal(v.SMTP_USER, 'owner@gmail.com');
  assert.equal(v.SMTP_PASS, 'qwertyuiopasdfgh', 'τα κενά του κωδικού της Google αφαιρούνται');
  assert.equal(v.MAIL_FROM, `${config.company.name} <owner@gmail.com>`);
  assert.equal(v.ADMIN_NOTIFY_EMAIL, 'office2@example.gr');
  assert.equal(v.NODE_ENV, 'development', 'οι άλλες ρυθμίσεις μένουν');
  // Ίδιες γραμμές στην ίδια θέση, σχόλια ανέγγιχτα, τίποτα στο τέλος.
  const before = EXAMPLE.split('\n');
  const after = text().split('\n');
  assert.equal(after.length, before.length);
  assert.equal(after[before.indexOf('SMTP_HOST=')], 'SMTP_HOST=smtp.gmail.com');
  assert.equal(after[before.indexOf('MAIL_FROM=')], `MAIL_FROM='${config.company.name} <owner@gmail.com>'`);
  for (const line of before.filter((l) => l.startsWith('#'))) assert.ok(after.includes(line), `κρατήθηκε το σχόλιο: ${line}`);
  assert.doesNotMatch(text(), /Από τη Διαχείριση/);

  const page = await aa.get('/admin/settings');
  assert.match(page.text, /Αποθηκεύτηκε — πατήστε Επανεκκίνηση για να ισχύσει/);
  assert.match(page.text, /Υπάρχουν αποθηκευμένες αλλαγές που δεν ισχύουν ακόμη/);
  assert.match(page.text, /Έχει οριστεί ••••dfgh/);
  assert.doesNotMatch(page.text, /qwertyuiopasdfgh|qwer tyui/, 'ο κωδικός δεν επιστρέφεται στη σελίδα');
  assert.match(page.text, /value="owner@gmail\.com"/);
  // Το ADMIN_NOTIFY_EMAIL των tests ορίζεται στο περιβάλλον και υπερισχύει του .env: η σελίδα το λέει.
  assert.match(page.text, /Η ρύθμιση <code>ADMIN_NOTIFY_EMAIL<\/code> έχει οριστεί και στις μεταβλητές συστήματος/);

  // Κενός κωδικός = μένει ο ίδιος (ίδιος λογαριασμός).
  const again = await post(aa, '/admin/settings/mail', gmail({ gmail_pass: '', mail_from: 'Γραφείο Κρατήσεων <owner@gmail.com>' }));
  assert.equal(again.status, 303);
  assert.equal(values().SMTP_PASS, 'qwertyuiopasdfgh');
  assert.equal(values().MAIL_FROM, 'Γραφείο Κρατήσεων <owner@gmail.com>');
  // Άλλος λογαριασμός χωρίς κωδικό: απορρίπτεται, το αρχείο δεν αλλάζει.
  const saved = text();
  const other = await post(aa, '/admin/settings/mail', gmail({ gmail_user: 'second@gmail.com', gmail_pass: '' }));
  assert.equal(other.status, 400);
  assert.match(other.text, /Γράψτε τον κωδικό εφαρμογής/);
  assert.equal(text(), saved);
  // Ο κανονικός κωδικός του Gmail δεν είναι κωδικός εφαρμογής· και δεν επιστρέφεται στη σελίδα.
  const wrong = await post(aa, '/admin/settings/mail', gmail({ gmail_pass: 'MyGmail2024!' }));
  assert.equal(wrong.status, 400);
  assert.match(wrong.text, /Ο κωδικός εφαρμογής έχει 16 γράμματα/);
  assert.doesNotMatch(wrong.text, /MyGmail2024/);
  assert.equal(text(), saved);
  // Σωστός κωδικός αλλά λάθος σε άλλο πεδίο: ο κωδικός δεν επιστρέφεται, η σελίδα ζητά να ξαναγραφτεί.
  const retype = await post(aa, '/admin/settings/mail', gmail({ mail_from: 'χωρίς email' }));
  assert.equal(retype.status, 400);
  assert.match(retype.text, /γράψτε τον ξανά πριν πατήσετε «Αποθήκευση»/);
  assert.doesNotMatch(retype.text, /qwertyuiopasdfgh|qwer tyui/);
  assert.equal(text(), saved);
});

test('άλλος πάροχος: έλεγχος πεδίων και ασφαλής αποθήκευση δύσκολων κωδικών', async (t) => {
  const { db, app, values, text } = setup(t);
  const aa = await adminAgent(app, db);
  const bad = await post(aa, '/admin/settings/mail', { preset: 'other', smtp_host: 'not a host', smtp_port: 'abc', smtp_secure: 'starttls', smtp_user: 'me@x.gr', smtp_pass: 'x', mail_from: 'χωρίς email', admin_notify: 'a@b.gr, λάθος' });
  assert.equal(bad.status, 400);
  assert.match(bad.text, /Γράψτε τη διεύθυνση του server/);
  assert.match(bad.text, /Η θύρα είναι αριθμός/);
  assert.match(bad.text, /Μορφή: Όνομα &lt;email&gt;/);
  assert.match(bad.text, /Μη έγκυρο email/);
  assert.equal(text(), EXAMPLE);

  const pass = `p#ss w"rd'x $HOME \\n`;
  const res = await post(aa, '/admin/settings/mail', { preset: 'other', smtp_host: 'SMTP-relay.Brevo.com', smtp_port: '587', smtp_secure: 'starttls', smtp_user: 'me@x.gr', smtp_pass: pass, mail_from: 'Rent a Car <info@x.gr>', admin_notify: 'a@b.gr, c@d.gr' });
  assert.equal(res.status, 303);
  const v = values();
  assert.equal(v.SMTP_HOST, 'smtp-relay.brevo.com');
  assert.equal(v.SMTP_PORT, '587');
  assert.equal(v.SMTP_SECURE, 'false');
  assert.equal(v.SMTP_PASS, pass.trim(), 'το dotenv διαβάζει ακριβώς τον κωδικό');
  assert.equal(v.ADMIN_NOTIFY_EMAIL, 'a@b.gr,c@d.gr');
  const page = await aa.get('/admin/settings');
  assert.match(page.text, /name="preset" value="other" checked/);
  assert.match(page.text, /value="smtp-relay\.brevo\.com"/);
  assert.doesNotMatch(page.text, /p#ss/);
});

test('δοκιμή σύνδεσης email: πραγματικός έλεγχος με τον server πριν την αποθήκευση, με το σφάλμα στα ελληνικά', async (t) => {
  const { db, app, text } = setup(t);
  const port = await fakeSmtp(t, { user: 'me@x.gr', pass: 'right-pass' });
  const aa = await adminAgent(app, db);
  const form = { preset: 'other', smtp_host: '127.0.0.1', smtp_port: String(port), smtp_secure: 'starttls', smtp_user: 'me@x.gr', mail_from: '', admin_notify: '' };

  let res = await postJson(aa, '/admin/settings/mail/test', { ...form, smtp_pass: 'wrong-pass' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, false);
  assert.match(res.body.lines[0], /δεν δέχτηκε το όνομα χρήστη ή τον κωδικό/);
  assert.match(res.body.lines[1], /Τεχνική λεπτομέρεια: .*535/);
  assert.doesNotMatch(JSON.stringify(res.body), /wrong-pass/);

  res = await postJson(aa, '/admin/settings/mail/test', { ...form, smtp_pass: 'right-pass' });
  assert.equal(res.body.ok, true);
  assert.match(res.body.lines[0], /πέτυχε/);
  assert.equal(text(), EXAMPLE, 'η δοκιμή δεν αποθηκεύει');

  res = await postJson(aa, '/admin/settings/mail/test', { ...form, smtp_port: '1', smtp_pass: 'right-pass' });
  assert.equal(res.body.ok, false);
  assert.match(res.body.lines[0], /δεν δέχεται συνδέσεις στη θύρα 1/);

  // Χωρίς JavaScript: ολόκληρη η σελίδα με το αποτέλεσμα, χωρίς τον κωδικό.
  const html = await post(aa, '/admin/settings/mail/test', { ...form, smtp_pass: 'wrong-pass' });
  assert.equal(html.status, 400);
  assert.match(html.text, /Δοκιμή σύνδεσης email: δεν πέτυχε/);
  assert.doesNotMatch(html.text, /wrong-pass/);
  assert.match(html.text, /value="127\.0\.0\.1"/);

  // Λάθη πεδίων: δεν γίνεται σύνδεση.
  res = await postJson(aa, '/admin/settings/mail/test', { preset: 'gmail', gmail_user: '', gmail_pass: '' });
  assert.equal(res.body.ok, false);
  assert.ok(res.body.lines.some((l) => /διεύθυνση Gmail/.test(l)));
});

test('εξηγήσεις σφαλμάτων email στα ελληνικά (Gmail, θύρα/κρυπτογράφηση, server που δεν υπάρχει)', () => {
  const ctx = { host: 'smtp.gmail.com', port: 465, pass: 'qwertyuiopasdfgh', gmail: true };
  const auth = settings.explainSmtpError({ code: 'EAUTH', message: 'Invalid login: 535-5.7.8 Username and Password not accepted', response: '535-5.7.8 Username and Password not accepted' }, ctx);
  assert.match(auth[0], /Η Google δεν δέχτηκε τη διεύθυνση Gmail ή τον κωδικό εφαρμογής/);
  const app = settings.explainSmtpError({ code: 'EAUTH', message: 'Invalid login: 534-5.7.9 Application-specific password required' }, ctx);
  assert.match(app[0], /ζητά κωδικό εφαρμογής/);
  const tls = settings.explainSmtpError({ code: 'ESOCKET', message: 'ssl3_get_record:wrong version number' }, { ...ctx, gmail: false });
  assert.match(tls[0], /θύρα 465 επιλέξτε «SSL\/TLS»/);
  const dns = settings.explainSmtpError({ code: 'EDNS', message: 'getaddrinfo ENOTFOUND smtp.gmal.com' }, { ...ctx, host: 'smtp.gmal.com' });
  assert.match(dns[0], /Δεν βρέθηκε ο server «smtp\.gmal\.com»/);
  const leak = settings.explainSmtpError({ code: 'EAUTH', message: 'rejected qwertyuiopasdfgh' }, ctx);
  assert.doesNotMatch(leak.join(' '), /qwertyuiopasdfgh/, 'ο κωδικός δεν εμφανίζεται ούτε στην τεχνική λεπτομέρεια');
});

test('Stripe: δεκτό μόνο sk_test_· το live κλειδί απορρίπτεται με σαφές μήνυμα', async (t) => {
  const { db, app, text, values } = setup(t);
  const aa = await adminAgent(app, db);
  const live = await post(aa, '/admin/settings/stripe', { stripe_key: 'sk_live_51AbCdEfGhIjKlMnOpQrSt' });
  assert.equal(live.status, 400);
  assert.match(live.text, /ΠΡΑΓΜΑΤΙΚΟ κλειδί \(live\)/);
  assert.match(live.text, /μόνο στον πραγματικό server/);
  assert.doesNotMatch(live.text, /sk_live_51AbCd/);
  assert.equal(text(), EXAMPLE);
  const liveTest = await postJson(aa, '/admin/settings/stripe/test', { stripe_key: 'rk_live_51AbCdEfGhIjKlMnOpQrSt' });
  assert.equal(liveTest.body.ok, false);
  assert.match(liveTest.body.lines[0], /ΠΡΑΓΜΑΤΙΚΟ κλειδί/);
  const publishable = await post(aa, '/admin/settings/stripe', { stripe_key: 'pk_test_51AbCdEfGhIjKlMnOp' });
  assert.match(publishable.text, /Publishable key/);
  assert.equal((await post(aa, '/admin/settings/stripe', {})).status, 400, 'χωρίς αλλαγή');

  const ok = await post(aa, '/admin/settings/stripe', { stripe_key: ` ${GOOD_KEY}\n`, stripe_webhook: 'whsec_abcdef123456' });
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.location, '/admin/settings#stripe');
  assert.equal(values().STRIPE_SECRET_KEY, GOOD_KEY);
  assert.equal(values().STRIPE_WEBHOOK_SECRET, 'whsec_abcdef123456');
  const page = await aa.get('/admin/settings');
  assert.match(page.text, /Έχει οριστεί ••••9876/);
  assert.doesNotMatch(page.text, new RegExp(GOOD_KEY));
  assert.doesNotMatch(page.text, /whsec_abcdef/);

  // «Αφαίρεση»: ξανά μόνο πληρωμή κατά την παραλαβή.
  await post(aa, '/admin/settings/stripe', { clear_stripe_key: '1' });
  assert.equal(values().STRIPE_SECRET_KEY, '');
  assert.equal(values().STRIPE_WEBHOOK_SECRET, 'whsec_abcdef123456');
});

test('Stripe: «Δοκιμή σύνδεσης» με τον έλεγχο του Συστήματος, για κλειδί που δεν έχει αποθηκευτεί', async (t) => {
  const { db, app, text } = setup(t);
  const fake = fakeStripe();
  const keys = [];
  stripe.setClientFactory((key) => {
    keys.push(key);
    if (key === GOOD_KEY) return fake.client;
    const err = new Error('Invalid API Key provided: sk_test_****1234');
    err.type = 'StripeAuthenticationError';
    return { accounts: { retrieve: async () => Promise.reject(err) }, balance: { retrieve: async () => Promise.reject(err) } };
  });
  t.after(() => stripe.setClientFactory(null));
  const aa = await adminAgent(app, db);

  let res = await postJson(aa, '/admin/settings/stripe/test', { stripe_key: 'sk_test_51WrongWrongWrong1234' });
  assert.equal(res.body.ok, false);
  assert.match(res.body.lines[0], /δεν αναγνώρισε το κλειδί/);

  fake.state.webhookEndpoints = [{ url: 'https://rent.example.gr/webhooks/stripe', status: 'enabled', enabled_events: ['*'] }];
  res = await postJson(aa, '/admin/settings/stripe/test', { stripe_key: GOOD_KEY });
  assert.equal(res.body.ok, true);
  assert.match(res.body.lines[0], /Το κλειδί ισχύει \(δοκιμαστική λειτουργία\)/);
  assert.equal(keys.at(-1), GOOD_KEY, 'δοκιμάστηκε το κλειδί της φόρμας');
  assert.equal(text(), EXAMPLE, 'η δοκιμή δεν αποθηκεύει');

  // Στον υπολογιστή (localhost) το webhook δεν είναι απαραίτητο.
  const baseUrl = config.baseUrl;
  t.after(() => {
    config.baseUrl = baseUrl;
  });
  config.baseUrl = 'http://localhost:3000';
  fake.state.webhookEndpoints = [];
  res = await postJson(aa, '/admin/settings/stripe/test', { stripe_key: GOOD_KEY, clear_stripe_webhook: '1' });
  assert.equal(res.body.ok, true);
  assert.ok(res.body.lines.some((l) => /είναι τοπική/.test(l)));

  // Χωρίς κλειδί: οδηγία.
  res = await postJson(aa, '/admin/settings/stripe/test', {});
  assert.equal(res.body.ok, false);
  assert.match(res.body.lines[0], /Επικολλήστε πρώτα το «Secret key»/);
});

test('επανεκκίνηση: σελίδα που ανανεώνεται μόνη της· στα tests η διεργασία δεν τερματίζεται', async (t) => {
  let restarts = 0;
  // Το .env ταιριάζει με όσα ισχύουν ήδη (κενό): μετά την επανεκκίνηση δεν εκκρεμεί τίποτα.
  const { db, app } = setup(t, { envText: '', onRestart: () => restarts++ });
  const aa = await adminAgent(app, db);
  const ping = await aa.get('/admin/settings/ping');
  assert.match(ping.body.boot, /^[a-f0-9]{16}$/);
  const res = await post(aa, '/admin/settings/restart', {});
  assert.equal(res.status, 200);
  assert.match(res.text, /data-restart-wait data-boot="[a-f0-9]{16}" data-target="\/admin\/settings\?restarted=1"/);
  assert.match(res.text, /<noscript><meta http-equiv="refresh" content="8;url=\/admin\/settings\?restarted=1"><\/noscript>/);
  assert.equal(restarts, 1);
  const after = await aa.get('/admin/settings?restarted=1');
  assert.match(after.text, /Η ιστοσελίδα ξεκίνησε ξανά: οι αποθηκευμένες ρυθμίσεις ισχύουν/);

  // Χωρίς onRestart: στα tests ποτέ process.exit. Οι αλλαγές εκκρεμούν, και η σελίδα το λέει.
  const plain = setup(t);
  const pa = await adminAgent(plain.app, plain.db);
  await post(pa, '/admin/settings/mail', gmail());
  assert.equal((await post(pa, '/admin/settings/restart', {})).status, 200);
  const pending = await pa.get('/admin/settings?restarted=1');
  assert.match(pending.text, /οι αποθηκευμένες αλλαγές δεν ισχύουν ακόμη/);
});

test('σε κανονική λειτουργία (production): μόνο οδηγίες, οι αλλαγές απορρίπτονται', async (t) => {
  let restarts = 0;
  const { db, app, text } = setup(t, { onRestart: () => restarts++ });
  const aa = await adminAgent(app, db);
  t.after(() => {
    config.isProduction = false;
  });
  config.isProduction = true;
  const page = await aa.get('/admin/settings');
  assert.equal(page.status, 200);
  assert.match(page.text, /Ποιες ρυθμίσεις χρειάζονται στον server/);
  assert.match(page.text, /<code>SMTP_HOST<\/code>/);
  assert.match(page.text, /<code>STRIPE_SECRET_KEY<\/code>/);
  assert.doesNotMatch(page.text, /action="\/admin\/settings/);
  assert.doesNotMatch(page.text, /whsec_test/, 'χωρίς μυστικά');
  for (const [url, data] of [['/admin/settings/mail', gmail()], ['/admin/settings/mail/test', gmail()], ['/admin/settings/stripe', { stripe_key: GOOD_KEY }], ['/admin/settings/restart', {}]]) {
    const res = await h.post(aa, url, data, '/admin/system');
    assert.equal(res.status, 403, url);
  }
  assert.equal(restarts, 0);
  assert.equal(text(), EXAMPLE);
  const system = await aa.get('/admin/system');
  assert.match(system.text, /Ποιες ρυθμίσεις χρειάζονται στον server/);
});

test('αρχείο .env: δημιουργείται αν λείπει, κρατά σχόλια και CRLF, γράφει τιμές που το dotenv διαβάζει ακριβώς', (t) => {
  const tricky = ['simple', 'with space', "it's", 'say "hi"', 'hash # inside', 'back\\slash', "both ' and \"", 'tab\there', '$HOME ${PATH}', 'ünïcödé ελληνικά', '=equals=', ''];
  for (const value of tricky) {
    const out = envFile.apply('# σχόλιο\nKEY=old\n', { KEY: value });
    assert.equal(dotenv.parse(out).KEY, value, JSON.stringify(value));
    assert.match(out, /^# σχόλιο\n/);
  }
  assert.throws(() => envFile.apply('', { KEY: 'a\'b"c`d' }), envFile.EnvValueError);
  assert.throws(() => envFile.apply('', { KEY: 'line\nbreak' }), envFile.EnvValueError);

  const crlf = envFile.apply('A=1\r\n# c\r\nexport SMTP_HOST=x\r\nSMTP_HOST=y\r\n', { SMTP_HOST: 'smtp.gmail.com', NEW_KEY: 'v' });
  assert.equal(crlf, 'A=1\r\n# c\r\nSMTP_HOST=smtp.gmail.com\r\nSMTP_HOST=smtp.gmail.com\r\n\r\n# Από τη Διαχείριση → Ρυθμίσεις δοκιμών\r\nNEW_KEY=v\r\n');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rental-envfile-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'sub', '.env');
  const created = envFile.update(file, { STRIPE_SECRET_KEY: GOOD_KEY }, { template: settings.TEMPLATE });
  assert.equal(created.created, true);
  const content = fs.readFileSync(file, 'utf8');
  assert.match(content, /^# Ρυθμίσεις για ΔΟΚΙΜΕΣ/, 'νέο αρχείο από το .env.local.example');
  assert.equal(dotenv.parse(content).STRIPE_SECRET_KEY, GOOD_KEY);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['.env'], 'χωρίς προσωρινά αρχεία');
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);

  // Στα tests, χωρίς ρητή διαδρομή, ποτέ το πραγματικό .env.
  assert.notEqual(settings.envPath(), path.resolve(process.cwd(), '.env'));
});
