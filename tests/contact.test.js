'use strict';

// WhatsApp (COMPANY_WHATSAPP), «Η κράτησή μου» με ένα πάτημα από το email (/b/<token>) και
// «Χρειάζεστε αλλαγή;» → αίτημα αλλαγής κράτησης (είδος change_request στη φόρμα επικοινωνίας).

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dotenv = require('dotenv');
const config = require('../src/config');
const bookingsLib = require('../src/lib/bookings');
const mailer = require('../src/lib/mailer');
const time = require('../src/lib/time');
const whatsapp = require('../src/lib/whatsapp');
const bookingAccess = require('../src/lib/booking-access');
const { internationalDigits } = require('../src/lib/phone');
const { purgeExpiredPersonalData } = require('../src/lib/maintenance');
const { openDb } = require('../src/db');
const { seedIfEmpty } = require('../src/db/seed-data');
const { createApp } = require('../src/app');

const NUMBER = '306941234567';
const LATIN_DRIVER = { first_name: 'John', last_name: 'Smith', email: 'john@example.com', license_country: 'United Kingdom' };
const formUrl = (params, prefix = '') => `${prefix}/booking/new?${new URLSearchParams(params)}`;

// Ο αριθμός WhatsApp της επιχείρησης μόνο για ένα test.
function useWhatsapp(t, number = NUMBER) {
  const before = config.company.whatsapp;
  config.company.whatsapp = number;
  t.after(() => {
    config.company.whatsapp = before;
  });
}

async function book(app, { params = h.searchParams(), driver = {}, prefix = '', agent = h.agent(app) } = {}) {
  const res = await h.post(agent, `${prefix}/booking`, { ...params, ...h.driver(driver) }, formUrl(params, prefix));
  assert.equal(res.status, 303, `κράτηση: ${res.status}`);
  return { agent, ref: h.bookingRef(res) };
}

async function adminAgent(db, app) {
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  return aa;
}

// Το token του κουμπιού «Η κράτησή μου» σε ένα email.
function tokenIn(html) {
  const m = /href="(https:\/\/rent\.example\.gr(?:\/(?:en|es))?\/b\/([A-Za-z0-9_-]{43}))"/.exec(html);
  return m ? { url: m[1], token: m[2] } : null;
}

const confirmationFor = (ref) => h.mailer.outbox.find((m) => m.subject.includes(ref) && m.to !== 'office@example.gr');
const waTexts = (html) => [...String(html).matchAll(/https:\/\/wa\.me\/(\d+)\?text=([^"&]+)/g)].map((m) => ({ number: m[1], text: decodeURIComponent(m[2]) }));

test('τηλέφωνο σε διεθνή μορφή για το WhatsApp (ελληνικά κινητά 69… → 30…)', () => {
  assert.equal(internationalDigits('+30 694 123 4567'), NUMBER);
  assert.equal(internationalDigits('6941234567'), NUMBER);
  assert.equal(internationalDigits('694 123 4567'), NUMBER);
  assert.equal(internationalDigits('0030 694 123 4567'), NUMBER);
  assert.equal(internationalDigits('306941234567'), NUMBER);
  assert.equal(internationalDigits('2310 000000'), '302310000000');
  assert.equal(internationalDigits('+44 7700 900123'), '447700900123');
  assert.equal(internationalDigits('+1 (555) 123-4567'), '15551234567');
  assert.equal(internationalDigits('07700 900123'), null, 'εθνική μορφή άλλης χώρας: άγνωστη χώρα');
  assert.equal(internationalDigits('12345'), null);
  assert.equal(internationalDigits(''), null);
  assert.equal(internationalDigits('abc'), null);
});

test('σύνδεσμος WhatsApp: το έτοιμο μήνυμα κωδικοποιείται σωστά (ελληνικά, κενά, &, ?, #)', () => {
  const text = 'Γεια σας, έχω μια ερώτηση για την κράτηση AB12CD34 & άλλο; 50% #1?';
  const url = whatsapp.chatUrl('+30 694 123 4567', text);
  assert.ok(url.startsWith(`https://wa.me/${NUMBER}?text=`));
  const encoded = url.slice(url.indexOf('?text=') + 6);
  assert.doesNotMatch(encoded, /[\s&#?]/, 'κανένας χαρακτήρας που θα έσπαγε τον σύνδεσμο');
  assert.equal(decodeURIComponent(encoded), text);
  assert.equal(whatsapp.chatUrl(NUMBER), `https://wa.me/${NUMBER}`);
  assert.equal(whatsapp.chatUrl('07700 900123', 'x'), null);
  // Στη γλώσσα της σελίδας, με τον κωδικό της κράτησης· ώρες απάντησης από το ωράριο.
  const en = whatsapp.forLocale('en', NUMBER);
  assert.equal(decodeURIComponent(en.url('AB12CD34').split('?text=')[1]), 'Hello, I have a question about booking AB12CD34.');
  assert.equal(decodeURIComponent(en.url().split('?text=')[1]), 'Hello, I have a question.');
  assert.equal(en.hours, `We reply ${String(config.rules.openingHour).padStart(2, '0')}:00–${config.rules.closingHour}:00`);
  assert.equal(decodeURIComponent(whatsapp.forLocale('es', NUMBER).url('AB12CD34').split('?text=')[1]), 'Hola, tengo una pregunta sobre la reserva AB12CD34.');
  assert.equal(whatsapp.forLocale('el', ''), null);
});

test('χωρίς COMPANY_WHATSAPP: κανένας σύνδεσμος ή κουμπί WhatsApp, ούτε στην πολιτική απορρήτου', async (t) => {
  useWhatsapp(t, '');
  const { app } = h.setup();
  const { agent, ref } = await book(app);
  for (const url of ['/', '/contact', '/cars/1', `/booking/${ref}`, `/booking/${ref}/print`, '/privacy', '/en/privacy', '/es/privacy']) {
    const res = await agent.get(url);
    assert.equal(res.status, 200, url);
    assert.doesNotMatch(res.text, /wa\.me|wa-float|has-wa-float|WhatsApp/, url);
  }
  // Η σελίδα κράτησης έχει το «Χρειάζεστε αλλαγή;» και χωρίς WhatsApp.
  assert.match((await agent.get(`/booking/${ref}`)).text, /Χρειάζεστε αλλαγή;/);
  await h.mailer.flush();
  assert.doesNotMatch(confirmationFor(ref).html, /wa\.me|WhatsApp/);
});

test('με COMPANY_WHATSAPP: footer, «Επικοινωνία», σελίδα κράτησης, εκτύπωση, email, στρογγυλό κουμπί (όχι στη διαχείριση)', async (t) => {
  useWhatsapp(t);
  const { db, app } = h.setup();
  const { agent, ref } = await book(app);
  const general = 'Γεια σας, έχω μια ερώτηση.';
  const forBooking = `Γεια σας, έχω μια ερώτηση για την κράτηση ${ref}.`;

  const home = await agent.get('/');
  assert.match(home.text, /<body class="has-wa-float">/);
  assert.match(home.text, /class="wa-float" data-wa-float/);
  assert.match(home.text, /Απαντάμε 08:00–22:00/);
  assert.ok(waTexts(home.text).length >= 2 && waTexts(home.text).every((w) => w.number === NUMBER && w.text === general));

  const contact = await agent.get('/contact');
  assert.match(contact.text, /<strong>WhatsApp:<\/strong>/);
  assert.match(contact.text, /Συνομιλία στο WhatsApp/);

  // Σελίδα κράτησης: footer, κουμπί και «Χρειάζεστε αλλαγή;» με τον κωδικό στο έτοιμο μήνυμα.
  const show = await agent.get(`/booking/${ref}`);
  const texts = waTexts(show.text);
  assert.ok(texts.length >= 3, 'footer, στρογγυλό κουμπί, κάρτα αλλαγής');
  assert.ok(texts.every((w) => w.text === forBooking), JSON.stringify(texts));
  assert.match(show.text, /class="btn btn-wa"/);

  const print = await agent.get(`/booking/${ref}/print`);
  assert.match(print.text, new RegExp(`WhatsApp \\+${NUMBER}`));
  assert.equal(waTexts(print.text)[0].text, forBooking);

  // Στα αγγλικά το μήνυμα είναι αγγλικό.
  const en = await agent.get(`/en/booking/${ref}`);
  assert.ok(waTexts(en.text).every((w) => w.text === `Hello, I have a question about booking ${ref}.`));
  assert.match(en.text, /We reply 08:00–22:00/);

  // Email: δίπλα στο τηλέφωνο, με τον κωδικό της κράτησης.
  await h.mailer.flush();
  const mail = confirmationFor(ref);
  assert.ok(waTexts(mail.html).some((w) => w.text === forBooking));
  const office = h.mailer.outbox.find((m) => m.to === 'office@example.gr');
  assert.doesNotMatch(office.html, /wa\.me/, 'όχι στα emails του γραφείου');

  // Πολιτική απορρήτου: προαιρετικό κανάλι, δεδομένα, νομική βάση, Meta — σε όλες τις γλώσσες.
  const privacy = await agent.get('/privacy');
  assert.match(privacy.text, /Επικοινωνία μέσω WhatsApp \(προαιρετική\)/);
  assert.match(privacy.text, /είναι προαιρετική και την επιλέγετε εσείς/);
  assert.match(privacy.text, /WhatsApp Ireland Limited \(όμιλος Meta\)/);
  assert.match(privacy.text, /Εκτέλεση σύμβασης \(άρθ\. 6 παρ\. 1β\) για μηνύματα σχετικά με την κράτησή σας/);
  assert.match((await agent.get('/en/privacy')).text, /Contact via WhatsApp \(optional\)[\s\S]*is optional and is your choice[\s\S]*WhatsApp Ireland Limited \(Meta group\)/);
  assert.match((await agent.get('/es/privacy')).text, /Comunicación por WhatsApp \(opcional\)[\s\S]*es opcional y la elige usted[\s\S]*WhatsApp Ireland Limited \(grupo Meta\)/);

  // Διαχείριση: χωρίς στρογγυλό κουμπί και χωρίς σύνδεσμο στο footer.
  const aa = await adminAgent(db, app);
  const adminPage = await aa.get('/admin');
  assert.doesNotMatch(adminPage.text, /wa-float|has-wa-float|wa\.me/);
});

test('Διαχείριση → κράτηση: «WhatsApp στον πελάτη» με έτοιμα μηνύματα στη γλώσσα του', async (t) => {
  const { db, app } = h.setup();
  const aa = await adminAgent(db, app);
  const { ref } = await book(app, { prefix: '/en', driver: { ...LATIN_DRIVER, phone: '6912345678' } });
  const b = bookingsLib.getByReference(db, ref);

  // Χωρίς αριθμό της επιχείρησης: οδηγία (η πολιτική απορρήτου αναφέρει το WhatsApp μόνο τότε).
  useWhatsapp(t, '');
  let page = await aa.get(`/admin/bookings/${b.id}`);
  assert.match(page.text, /WhatsApp στον πελάτη/);
  assert.match(page.text, /COMPANY_WHATSAPP/);
  assert.doesNotMatch(page.text, /wa\.me/);

  config.company.whatsapp = NUMBER;
  page = await aa.get(`/admin/bookings/${b.id}`);
  const links = waTexts(page.text);
  assert.equal(links.length, 3, 'έτοιμο / αριθμός πτήσης / γενικό');
  assert.ok(links.every((l) => l.number === '306912345678'), 'ελληνικό κινητό 69… → 30…');
  assert.match(links[0].text, new RegExp(`^Hello John, this is Rent a Car\\. The car for booking ${ref} is ready for pick-up on \\d{2}/\\d{2}/\\d{4} 10:00 \\(`));
  assert.match(links[1].text, /could you send us your flight number\?/);
  assert.equal(links[2].text, `Hello John, this is Rent a Car, about your booking ${ref}.`);
  for (const l of links) assert.doesNotMatch(l.text, /[Α-Ωα-ω]/, 'χωρίς ελληνικά για πελάτη στα αγγλικά');
  assert.match(page.text, /Το αυτοκίνητο είναι έτοιμο/);
  assert.match(page.text, /Ζητήστε τον αριθμό πτήσης/);

  // Τηλέφωνο χωρίς κωδικό χώρας (ξένο): δεν μαντεύουμε τη χώρα.
  db.prepare('UPDATE bookings SET phone = ? WHERE id = ?').run('07700 900123', b.id);
  page = await aa.get(`/admin/bookings/${b.id}`);
  assert.doesNotMatch(page.text, /wa\.me\/\d+\?text=Hello/);
  assert.match(page.text, /δεν έχει κωδικό χώρας/);
});

test('«Η κράτησή μου» στο email: token μόνο ως sha256, πρόσβαση μόνο στη δική του κράτηση, στη γλώσσα της κράτησης', async () => {
  const { db, app } = h.setup();
  const mine = await book(app, { prefix: '/en', driver: LATIN_DRIVER });
  const other = await book(app, { params: h.searchParams({ car: 2 }), driver: { email: 'other@example.com' } });
  await h.mailer.flush();
  const mail = confirmationFor(mine.ref);
  const link = tokenIn(mail.html);
  assert.ok(link, 'κουμπί «Η κράτησή μου» στο email');
  assert.match(link.url, /^https:\/\/rent\.example\.gr\/en\/b\//, 'στη γλώσσα της κράτησης');
  assert.match(mail.html, /My booking · /);
  assert.ok(mail.html.indexOf(link.url) < mail.html.indexOf('Dear John'), 'στην αρχή του email');

  // Στη βάση μόνο το hash.
  const b = bookingsLib.getByReference(db, mine.ref);
  const rows = db.prepare('SELECT * FROM booking_access_tokens WHERE booking_id = ?').all(b.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, bookingAccess.sha256(link.token));
  assert.notEqual(rows[0].token_hash, link.token);
  const dump = JSON.stringify(db.prepare('SELECT * FROM booking_access_tokens').all());
  assert.ok(!dump.includes(link.token), 'το token δεν υπάρχει πουθενά στη βάση');

  // Νέος browser (χωρίς session): ένα πάτημα → η κράτηση.
  const fresh = h.agent(app);
  assert.equal((await fresh.get(`/booking/${mine.ref}`)).status, 302, 'πριν: χωρίς πρόσβαση');
  const tap = await fresh.get(`/en/b/${link.token}`);
  assert.equal(tap.status, 303);
  assert.equal(tap.headers.location, `/en/booking/${mine.ref}`);
  assert.equal(tap.headers['cache-control'], 'no-store');
  const page = await fresh.get(tap.headers.location);
  assert.equal(page.status, 200);
  assert.match(page.text, new RegExp(mine.ref));
  // Μόνο αυτή η κράτηση.
  const denied = await fresh.get(`/booking/${other.ref}`);
  assert.equal(denied.status, 302);
  assert.match(denied.headers.location, /\/manage$/);

  // Ελληνικό ή ισπανικό πρόθεμα στον σύνδεσμο: πάντα στη γλώσσα της κράτησης.
  assert.equal((await h.agent(app).get(`/b/${link.token}`)).headers.location, `/en/booking/${mine.ref}`);
  assert.equal((await h.agent(app).get(`/es/b/${link.token}`)).headers.location, `/en/booking/${mine.ref}`);

  // Λάθος token: στην αναζήτηση με κωδικό και email, χωρίς πρόσβαση.
  const wrong = h.agent(app);
  for (const bad of [link.token.slice(0, -1) + (link.token.endsWith('A') ? 'B' : 'A'), 'short', `${'a'.repeat(64)}`]) {
    const res = await wrong.get(`/en/b/${bad}`);
    assert.equal(res.status, 303, bad);
    assert.equal(res.headers.location, '/en/manage');
  }
  const after = await wrong.get('/en/manage');
  assert.match(after.text, /The booking link is no longer valid/);
  assert.equal((await wrong.get(`/booking/${mine.ref}`)).status, 302);
});

test('«Η κράτησή μου»: ισχύει έως 60 ημέρες μετά την επιστροφή, και οι ληγμένοι σύνδεσμοι διαγράφονται', async () => {
  const { db, app } = h.setup();
  const { ref } = await book(app);
  const b = bookingsLib.getByReference(db, ref);
  const token = bookingAccess.issueToken(db, b.id);
  const setReturn = (daysAgo) => {
    const ret = time.addMinutes(time.nowLocal(), -daysAgo * 24 * 60);
    db.prepare('UPDATE bookings SET pickup_at = ?, return_at = ? WHERE id = ?').run(time.addMinutes(ret, -3 * 24 * 60), ret, b.id);
  };
  setReturn(59);
  const ok = await h.agent(app).get(`/b/${token}`);
  assert.equal(ok.headers.location, `/booking/${ref}`, '59 ημέρες μετά: ισχύει');
  setReturn(61);
  const expired = h.agent(app);
  const res = await expired.get(`/b/${token}`);
  assert.equal(res.headers.location, '/manage', '61 ημέρες μετά: έληξε');
  assert.equal((await expired.get(`/booking/${ref}`)).status, 302);
  // Email για κράτηση που έληξε ο σύνδεσμός της: χωρίς κουμπί.
  assert.equal(bookingAccess.linkFor(db, bookingsLib.getById(db, b.id)), null);
  // Ο περιοδικός καθαρισμός σβήνει τα tokens που δεν ισχύουν.
  assert.ok(purgeExpiredPersonalData(db).accessTokens >= 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM booking_access_tokens WHERE booking_id = ?').get(b.id).n, 0);
});

test('«Η κράτησή μου» σε κάθε email κράτησης (και σε παλιές κρατήσεις, όταν σταλεί email), ποτέ στο γραφείο', async () => {
  const { db, app } = h.setup();
  const { ref } = await book(app, { prefix: '/es', driver: LATIN_DRIVER });
  const b = bookingsLib.getByReference(db, ref);
  // Παλιά κράτηση χωρίς token (π.χ. από πριν υπάρξει η λειτουργία).
  db.prepare('DELETE FROM booking_access_tokens').run();
  h.mailer.outbox.length = 0;
  const aa = await adminAgent(db, app);
  await h.post(aa, `/admin/bookings/${b.id}/resend`, {}, `/admin/bookings/${b.id}`);
  await h.mailer.flush();
  const resent = confirmationFor(ref);
  const link = tokenIn(resent.html);
  assert.ok(link, 'νέο token στην επαναποστολή');
  assert.match(link.url, /\/es\/b\//);
  assert.match(resent.html, /Mi reserva · /);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM booking_access_tokens WHERE booking_id = ?').get(b.id).n, 1);

  // Ακύρωση: email με κουμπί· το παλιό token (επιβεβαίωση) εξακολουθεί να λειτουργεί.
  await h.post(aa, `/admin/bookings/${b.id}/cancel`, { reason_code: 'office' }, `/admin/bookings/${b.id}`);
  await h.mailer.flush();
  const cancelled = h.mailer.outbox.find((m) => m.to === b.email && /Cancel|Cancelaci/i.test(m.subject));
  assert.ok(cancelled, 'email ακύρωσης');
  const second = tokenIn(cancelled.html);
  assert.ok(second && second.token !== link.token);
  assert.equal((await h.agent(app).get(`/b/${link.token}`)).headers.location, `/es/booking/${ref}`);
  assert.equal((await h.agent(app).get(`/b/${second.token}`)).headers.location, `/es/booking/${ref}`);

  // Τα emails του γραφείου και η επιβεβαίωση λήψης μηνύματος δεν έχουν σύνδεσμο πρόσβασης.
  for (const m of h.mailer.outbox.filter((x) => x.to === 'office@example.gr')) assert.equal(tokenIn(m.html), null, m.subject);

  // Τα υπόλοιπα emails κράτησης: το κουμπί εμφανίζεται όταν υπάρχει σύνδεσμος (bookingUrl).
  const data = {
    booking: b,
    bookingUrl: 'https://rent.example.gr/es/b/x',
    extras: [],
    deposit: { amount_cents: 25000, card_last4: '4242' },
    url: 'https://rent.example.gr/es/deposit/abc',
    window: { opensAt: b.pickup_at },
    charge: { category: 'fuel', description: 'Missing fuel', amount_cents: 5000, respond_by: '2026-12-01' },
    capturedCents: 0,
    releasedCents: 25000,
    charges: [],
    outstandingCents: 0,
    unresolved: [],
    refundedCents: 0,
    amountCents: 100,
    reason: 'Ακύρωση από τον πελάτη',
  };
  for (const template of ['booking-confirmed', 'booking-cancelled', 'payment-returned', 'deposit-link', 'deposit-held', 'deposit-settled', 'charge-added', 'charge-notice']) {
    const html = await mailer.render(template, data, 'es');
    assert.match(html, /href="https:\/\/rent\.example\.gr\/es\/b\/x"[^>]*>Mi reserva · /, template);
  }
});

test('αίτημα αλλαγής: κάρτα στη σελίδα κράτησης → φόρμα με τον κωδικό → μήνυμα change_request στη διαχείριση', async () => {
  const { db, app } = h.setup();
  const { agent, ref } = await book(app);
  const show = await agent.get(`/booking/${ref}`);
  assert.match(show.text, /Χρειάζεστε αλλαγή;/);
  assert.match(show.text, /Η αλλαγή ισχύει μόνο αφού σας την επιβεβαιώσουμε· η τιμή μπορεί να αλλάξει\./);
  assert.match(show.text, new RegExp(`href="/contact\\?kind=change_request&amp;ref=${ref}"[^>]*>Αίτημα αλλαγής<`));
  assert.match((await agent.get(`/en/booking/${ref}`)).text, new RegExp(`href="/en/contact\\?kind=change_request&amp;ref=${ref}"[^>]*>Request a change<`));

  // Ο πελάτης (με πρόσβαση στην κράτηση): τα στοιχεία συμπληρώνονται.
  const form = await agent.get(`/contact?kind=change_request&ref=${ref.toLowerCase()}`);
  assert.match(form.text, /<option value="change_request" selected>Αίτημα αλλαγής κράτησης<\/option>/);
  assert.match(form.text, new RegExp(`id="booking_reference" name="booking_reference" value="${ref}"`));
  assert.match(form.text, /id="name" name="name" value="Γιώργος Παπαδόπουλος"/);
  assert.match(form.text, /id="email" name="email" type="email" value="giorgos@example.com"/);
  assert.match(form.text, new RegExp(`id="subject" name="subject" value="Αίτημα αλλαγής κράτησης ${ref}"`));
  assert.match(form.text, /data-kind-only="change_request" >/, 'οδηγία ορατή χωρίς JavaScript');
  // Ξένος επισκέπτης με τον ίδιο σύνδεσμο: μόνο ο κωδικός, κανένα προσωπικό στοιχείο.
  const stranger = await h.agent(app).get(`/contact?kind=change_request&ref=${ref}`);
  assert.doesNotMatch(stranger.text, /giorgos@example\.com|Παπαδόπουλος/);
  assert.match(stranger.text, new RegExp(`value="${ref}"`));
  // Άλλο είδος: η οδηγία κρυμμένη.
  assert.match((await h.agent(app).get('/contact')).text, /data-kind-only="change_request" hidden/);

  // Χωρίς κωδικό κράτησης δεν γίνεται δεκτό.
  const missing = await h.post(h.agent(app), '/contact', { name: 'Μαρία', email: 'maria@example.com', subject: 'Αλλαγή', body: 'Θέλω άλλη ημερομηνία παραλαβής.', kind: 'change_request' });
  assert.equal(missing.status, 422);
  assert.match(missing.text, /Συμπληρώστε τον κωδικό κράτησης\./);

  h.mailer.outbox.length = 0;
  const sent = await h.post(agent, '/contact', {
    name: 'Γιώργος Παπαδόπουλος',
    email: 'giorgos@example.com',
    subject: `Αίτημα αλλαγής κράτησης ${ref}`,
    body: 'Μπορούμε να μεταφέρουμε την παραλαβή στις 12:00;',
    kind: 'change_request',
    booking_reference: ref,
  });
  assert.equal(sent.status, 302);
  assert.equal(sent.headers.location, `/booking/${ref}`, 'πίσω στην κράτηση');
  assert.match((await agent.get(`/booking/${ref}`)).text, /Λάβαμε το αίτημα αλλαγής/);
  const row = db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 1').get();
  assert.equal(row.kind, 'change_request');
  assert.equal(row.booking_reference, ref);
  // Κάποιος χωρίς πρόσβαση: επιστρέφει στη φόρμα.
  const other = await h.post(h.agent(app), '/contact', { name: 'Άλλος', email: 'x@example.com', subject: 'Αλλαγή', body: 'Θέλω άλλη ημερομηνία παραλαβής.', kind: 'change_request', booking_reference: ref });
  assert.equal(other.headers.location, '/contact');

  await h.mailer.flush();
  const ack = h.mailer.outbox.find((m) => m.to === 'giorgos@example.com');
  assert.match(ack.html, /Θα σας απαντήσουμε το συντομότερο\./);
  assert.match(ack.html, /Η αλλαγή ισχύει μόνο αφού σας την επιβεβαιώσουμε/);
  assert.doesNotMatch(ack.html, /15 ημερών|Συνήγορο/, 'δεν είναι παράπονο');
  assert.equal(tokenIn(ack.html), null, 'η επιβεβαίωση λήψης δεν δίνει πρόσβαση στην κράτηση');
  const office = h.mailer.outbox.find((m) => m.to === 'office@example.gr' && m.html.includes('12:00'));
  assert.match(office.html, /Είδος: <strong>Αίτημα αλλαγής κράτησης<\/strong>/);
  assert.match(office.html, new RegExp(`Κράτηση: ${ref}`));

  // Διαχείριση: λίστα μηνυμάτων με το είδος και σύνδεσμο στην κράτηση· και στη σελίδα της κράτησης.
  const aa = await adminAgent(db, app);
  const b = bookingsLib.getByReference(db, ref);
  const list = await aa.get('/admin/messages');
  assert.match(list.text, /<span class="status status-active">Αίτημα αλλαγής κράτησης<\/span>/);
  assert.match(list.text, new RegExp(`<a class="ref" href="/admin/bookings/${b.id}">${ref}</a>`));
  const adminBooking = await aa.get(`/admin/bookings/${b.id}`);
  assert.match(adminBooking.text, /Μηνύματα για την κράτηση[\s\S]*Αίτημα αλλαγής κράτησης:/);
});

test('Ρυθμίσεις δοκιμών → WhatsApp: αποθήκευση στο .env σε διεθνή μορφή, έλεγχος αριθμού', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rental-wa-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, fs.readFileSync(path.join(__dirname, '..', '.env.local.example'), 'utf8'));
  const db = openDb(':memory:');
  seedIfEmpty(db);
  const app = createApp({ db, uploadDir: path.join(dir, 'uploads'), settingsEnvPath: envPath });
  const aa = await adminAgent(db, app);
  const page = await aa.get('/admin/settings');
  assert.match(page.text, /id="whatsapp"[\s\S]*3\. WhatsApp \(προαιρετικό\)/);
  assert.match(page.text, /4\. Επανεκκίνηση/);

  const bad = await h.post(aa, '/admin/settings/whatsapp', { company_whatsapp: '07700 900123' }, '/admin/settings');
  assert.equal(bad.status, 400);
  assert.match(bad.text, /με τον κωδικό χώρας, μόνο ψηφία/);
  assert.equal(dotenv.parse(fs.readFileSync(envPath, 'utf8')).COMPANY_WHATSAPP, '');

  const ok = await h.post(aa, '/admin/settings/whatsapp', { company_whatsapp: '694 123 4567' }, '/admin/settings');
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.location, '/admin/settings#whatsapp');
  assert.equal(dotenv.parse(fs.readFileSync(envPath, 'utf8')).COMPANY_WHATSAPP, NUMBER);
  const after = await aa.get('/admin/settings');
  assert.match(after.text, /Υπάρχουν αποθηκευμένες αλλαγές που δεν ισχύουν ακόμη/);
  assert.match(after.text, new RegExp(`id="company_whatsapp"[^>]*value="${NUMBER}"`));

  // Κενό = χωρίς WhatsApp.
  await h.post(aa, '/admin/settings/whatsapp', { company_whatsapp: '' }, '/admin/settings');
  assert.equal(dotenv.parse(fs.readFileSync(envPath, 'utf8')).COMPANY_WHATSAPP, '');
  // Ο πελάτης δεν αλλάζει τίποτα.
  const customer = h.agent(app);
  await h.login(customer, await h.createUser(db));
  assert.equal((await h.post(customer, '/admin/settings/whatsapp', { company_whatsapp: NUMBER })).status, 403);
});
