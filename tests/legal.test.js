'use strict';

// Νομικές απαιτήσεις: προσυμβατική ενημέρωση, όροι, στοιχεία επιχείρησης, παράπονα,
// δικαιώματα ΓΚΠΔ, διατήρηση δεδομένων, υπενθυμίσεις παραστατικών.

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const bookingsLib = require('../src/lib/bookings');
const fiscal = require('../src/lib/fiscal');
const { purgeExpiredPersonalData } = require('../src/lib/maintenance');

function carPage(params) {
  return `/booking/new?${new URLSearchParams(params)}`;
}

test('φόρμα κράτησης: κουμπί «με υποχρέωση πληρωμής» και προσυμβατική ενημέρωση', async () => {
  const { app } = h.setup();
  const res = await h.agent(app).get(carPage(h.searchParams()));
  assert.equal(res.status, 200);
  assert.match(res.text, /Κράτηση με υποχρέωση πληρωμής/);
  assert.match(res.text, /δικαίωμα υπαναχώρησης/);
  assert.match(res.text, /Απαλλαγή/);
  assert.match(res.text, /πιστωτική κάρτα/);
  assert.match(res.text, /έκδοση 2026-10/i);
});

test('τιμολόγιο: έλεγχος ΑΦΜ και αποθήκευση στοιχείων', async () => {
  const { db, app } = h.setup();
  const invoice = { invoice: '1', invoice_name: 'Δοκιμή ΑΕ', invoice_address: 'Οδός 1', invoice_tax_office: 'Α Θεσσαλονίκης', invoice_activity: 'Εμπόριο' };
  const bad = await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver({ ...invoice, invoice_vat: '090000046' }) }, carPage(h.searchParams()));
  assert.equal(bad.status, 422);
  assert.match(bad.text, /Μη έγκυρος ΑΦΜ/);
  const ok = await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver({ ...invoice, invoice_vat: 'EL 090000045' }) }, carPage(h.searchParams()));
  assert.equal(ok.status, 303);
  const b = bookingsLib.getByReference(db, h.bookingRef(ok));
  assert.equal(b.invoice_requested, 1);
  assert.equal(b.invoice_vat, '090000045');
  assert.equal(b.terms_version, '2026-10');
  assert.ok(b.excess_cents > 0);
});

test('email επιβεβαίωσης: αναλυτικό, με τους όρους συνημμένους και ενημέρωση ακύρωσης', async () => {
  const { app } = h.setup();
  await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver() }, carPage(h.searchParams()));
  await h.mailer.flush();
  const mail = h.mailer.outbox.find((m) => m.subject.startsWith('Επιβεβαίωση κράτησης'));
  assert.ok(mail);
  assert.match(mail.html, /υπαναχώρησης/);
  assert.match(mail.html, /ΦΠΑ/);
  assert.match(mail.html, /Συνήγορος του Καταναλωτή/);
  assert.equal(mail.attachments.length, 1);
  assert.match(mail.attachments[0].filename, /^oroi-enoikiasis-2026-10\.html$/);
  assert.match(mail.attachments[0].content, /Όροι ενοικίασης/);
  // Στο γραφείο δεν στέλνονται στοιχεία διπλώματος/γέννησης με email.
  const admin = h.mailer.outbox.find((m) => m.to === 'office@example.gr');
  assert.ok(admin);
  assert.doesNotMatch(admin.html, /AB123456/);
});

test('σελίδες στοιχείων επιχείρησης, παραπόνων και όρων', async () => {
  const { app } = h.setup();
  for (const [url, re] of [
    ['/company', /ΜΗΤΕ[\s\S]*0933E60000123400/],
    ['/complaints', /Συνήγορο του Καταναλωτή/],
    ['/terms', /Τιμοκατάλογος|τιμοκατάλογος/],
    ['/privacy', /άρθρο 21/],
  ]) {
    const res = await h.request(app).get(url);
    assert.equal(res.status, 200, url);
    assert.match(res.text, re, url);
  }
  const terms = await h.request(app).get('/terms');
  assert.doesNotMatch(terms.text, /ec\.europa\.eu\/consumers\/odr/, 'η πλατφόρμα ΗΕΔ καταργήθηκε');
});

test('παράπονο: καταγράφεται με είδος και κωδικό κράτησης, ο πελάτης λαμβάνει επιβεβαίωση', async () => {
  const { db, app } = h.setup();
  const res = await h.post(h.agent(app), '/contact', {
    name: 'Μαρία',
    email: 'maria@example.com',
    subject: 'Καθυστέρηση παράδοσης',
    body: 'Περιμέναμε 40 λεπτά στο αεροδρόμιο.',
    kind: 'complaint',
    booking_reference: 'ab12-cd34',
  });
  assert.ok([302, 303].includes(res.status));
  const msg = db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 1').get();
  assert.equal(msg.kind, 'complaint');
  assert.equal(msg.booking_reference, 'AB12CD34');
  await h.mailer.flush();
  assert.ok(h.mailer.outbox.some((m) => m.to === 'maria@example.com' && m.subject.startsWith('Λάβαμε το μήνυμά σας')));
});

test('λογαριασμός: λήψη δεδομένων, εγγραφή χωρίς «συγκατάθεση», διαγραφή μόνο χωρίς ενεργή κράτηση', async () => {
  const { db, app } = h.setup();
  const agent = h.agent(app);
  const reg = await h.post(agent, '/register', { first_name: 'Νίκος', last_name: 'Π', email: 'nikos@example.com', password: 'Password123', password_confirm: 'Password123' }, '/register');
  assert.equal(reg.status, 303);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get('nikos@example.com');
  await h.post(agent, '/booking', { ...h.searchParams(), ...h.driver({ email: 'nikos@example.com' }) }, carPage(h.searchParams()));

  const exp = await agent.get('/account/export');
  assert.equal(exp.status, 200);
  assert.match(exp.headers['content-disposition'], /attachment/);
  const data = JSON.parse(exp.text);
  assert.equal(data.account.email, 'nikos@example.com');
  assert.equal(data.bookings.length, 1);
  assert.equal(data.bookings[0].license_number, 'AB123456');
  assert.ok(!('password_hash' in data.account));

  await h.post(agent, '/account/delete', { current_password: 'Password123' }, '/account');
  assert.ok(db.prepare('SELECT 1 FROM users WHERE id = ?').get(user.id), 'ενεργή κράτηση: δεν διαγράφεται');
  db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE user_id = ?`).run(user.id);
  await h.post(agent, '/account/delete', { current_password: 'Password123' }, '/account');
  assert.ok(!db.prepare('SELECT 1 FROM users WHERE id = ?').get(user.id));
});

test('cookie σύνδεσης: λήγει με το κλείσιμο του browser, εκτός αν επιλεγεί «Να με θυμάσαι»', async () => {
  const { db, app } = h.setup();
  const user = await h.createUser(db);
  const plain = await h.login(h.agent(app), user);
  const cookie = plain.headers['set-cookie'].find((c) => c.startsWith('sid='));
  assert.doesNotMatch(cookie, /Expires=/i);
  const remembered = await h.post(h.agent(app), '/login', { email: user.email, password: user.password, remember: '1' }, '/login');
  const cookie2 = remembered.headers['set-cookie'].find((c) => c.startsWith('sid='));
  assert.match(cookie2, /Expires=/i);
  const expires = new Date(/Expires=([^;]+)/i.exec(cookie2)[1]).getTime();
  assert.ok(expires > Date.now() + 29 * 24 * 3600 * 1000);
});

test('διατήρηση δεδομένων: διαγραφή στοιχείων διπλώματος μετά την περίοδο, όχι αν εκκρεμεί χρέωση', async () => {
  const { db, app } = h.setup();
  await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver() }, carPage(h.searchParams()));
  await h.post(h.agent(app), '/booking', { ...h.searchParams({ car: 2 }), ...h.driver({ email: 'b@example.com' }) }, carPage(h.searchParams({ car: 2 })));
  const [b1, b2] = db.prepare('SELECT id FROM bookings ORDER BY id').all().map((r) => r.id);
  const old = '2024-01-10T10:00';
  db.prepare(`UPDATE bookings SET status = 'completed', pickup_at = '2024-01-05T10:00', return_at = ? WHERE id IN (?, ?)`).run(old, b1, b2);
  db.prepare(
    `INSERT INTO booking_charges (booking_id, category, description, amount_cents, status, created_by) VALUES (?, 'damage', 'Ζημιά', 10000, 'disputed', 'test')`,
  ).run(b2);
  db.prepare(`INSERT INTO messages (name, email, subject, body, created_at) VALUES ('Α', 'a@example.com', 'Θέμα', 'Παλιό μήνυμα', datetime('now', '-2 years'))`).run();
  const result = purgeExpiredPersonalData(db);
  assert.equal(result.purged, 1);
  assert.equal(result.messages, 1);
  const purged = bookingsLib.getById(db, b1);
  assert.equal(purged.license_number, '');
  assert.equal(purged.birth_date, '');
  assert.ok(purged.personal_data_purged_at);
  assert.equal(purged.email, 'giorgos@example.com', 'τα στοιχεία των φορολογικών βιβλίων μένουν');
  assert.equal(bookingsLib.getById(db, b2).license_number, 'AB123456');
});

test('παραστατικά: υπενθύμιση στην είσπραξη και καταχώρηση ΜΑΡΚ', async () => {
  const { db, app } = h.setup();
  const res = await h.post(h.agent(app), '/booking', { ...h.searchParams({ from: 3 }), ...h.driver() }, carPage(h.searchParams({ from: 3 })));
  const b = bookingsLib.getByReference(db, h.bookingRef(res));
  db.prepare('UPDATE bookings SET pickup_at = ? WHERE id = ?').run(h.time.addMinutes(h.time.nowLocal(), 60), b.id);
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  const page = `/admin/bookings/${b.id}`;
  await h.post(aa, `${page}/pickup`, { pickup_km: '10', collected_payment: '1', no_deposit: '1' }, page);
  const [doc] = fiscal.pending(db);
  assert.equal(doc.kind, 'receipt');
  assert.equal(doc.amount_cents, b.total_cents);
  const dash = await aa.get('/admin');
  assert.match(dash.text, /Παραστατικά προς έκδοση/);
  await h.post(aa, `/admin/fiscal/${doc.id}`, { mark: '400001234567890' }, '/admin');
  assert.equal(fiscal.pending(db).length, 0);
  assert.equal(fiscal.forBooking(db, b.id)[0].mark, '400001234567890');
});
