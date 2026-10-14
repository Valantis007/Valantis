'use strict';

// Σελίδα «Έλεγχος συστήματος» και ένδειξη δοκιμαστικής λειτουργίας πληρωμών.

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');

async function adminAgent(app, db) {
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  return aa;
}

test('έλεγχος συστήματος: μόνο για διαχειριστές, δείχνει τι λείπει χωρίς να εμφανίζει μυστικά', async () => {
  const { db, app } = h.setup();
  const customer = h.agent(app);
  await h.login(customer, await h.createUser(db));
  const denied = await customer.get('/admin/system');
  assert.notEqual(denied.status, 200);
  const aa = await adminAgent(app, db);
  const page = await aa.get('/admin/system');
  assert.equal(page.status, 200);
  assert.match(page.text, /Στοιχεία επιχείρησης|Λείπουν στοιχεία επιχείρησης/);
  assert.match(page.text, /δεν έχει ρυθμιστεί SMTP/);
  assert.doesNotMatch(page.text, /whsec_test|wsk_test_secret/, 'δεν εμφανίζονται μυστικά');
});

test('δοκιμαστικό email: στέλνεται και εμφανίζεται στα τελευταία emails', async () => {
  const { db, app } = h.setup();
  const aa = await adminAgent(app, db);
  const res = await h.post(aa, '/admin/system/test-email', { to: 'me@example.gr' }, '/admin/system');
  assert.equal(res.status, 200);
  assert.ok(h.mailer.outbox.some((m) => m.to === 'me@example.gr' && m.subject.startsWith('Δοκιμαστικό email')));
  assert.match(res.text, /me@example\.gr/);
});

test('έλεγχος πληρωμών: εντοπίζει webhook που λείπει ή του λείπουν γεγονότα', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const aa = await adminAgent(app, db);
  let res = await h.post(aa, '/admin/system/check-payments', {}, '/admin/system');
  assert.match(res.text, /Δεν βρέθηκε webhook/);
  fake.state.webhookEndpoints = [{ url: 'https://rent.example.gr/webhooks/stripe', status: 'enabled', enabled_events: ['checkout.session.completed'] }];
  res = await h.post(aa, '/admin/system/check-payments', {}, '/admin/system');
  assert.match(res.text, /λείπουν τα γεγονότα/);
  fake.state.webhookEndpoints = [{ url: 'https://rent.example.gr/webhooks/stripe', status: 'enabled', enabled_events: ['*'] }];
  res = await h.post(aa, '/admin/system/check-payments', {}, '/admin/system');
  assert.match(res.text, /όλα εντάξει/);
});

test('έλεγχος Revolut και ένδειξη «δοκιμαστική λειτουργία» με Sandbox', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useRevolut(t);
  const before = config.revolut.sandbox;
  t.after(() => {
    config.revolut.sandbox = before;
  });
  config.revolut.sandbox = true;
  const home = await h.request(app).get('/');
  assert.match(home.text, /ΔΟΚΙΜΑΣΤΙΚΗ ΛΕΙΤΟΥΡΓΙΑ/);
  const aa = await adminAgent(app, db);
  let res = await h.post(aa, '/admin/system/check-payments', {}, '/admin/system');
  assert.match(res.text, /npm run revolut:webhook/);
  fake.webhooks.push({ url: 'https://rent.example.gr/webhooks/revolut', events: ['ORDER_COMPLETED', 'ORDER_AUTHORISED', 'ORDER_CANCELLED', 'ORDER_FAILED'] });
  res = await h.post(aa, '/admin/system/check-payments', {}, '/admin/system');
  assert.match(res.text, /όλα εντάξει/);
  config.revolut.sandbox = false;
  const live = await h.request(app).get('/');
  assert.doesNotMatch(live.text, /ΔΟΚΙΜΑΣΤΙΚΗ ΛΕΙΤΟΥΡΓΙΑ/);
});

test('διαγραφή δοκιμαστικών δεδομένων: φεύγουν κρατήσεις/πελάτες, μένουν στόλος και διαχειριστές', async () => {
  const { db, app } = h.setup();
  const { clearTestData } = require('../src/db/clear-test-data');
  await adminAgent(app, db);
  const agent = h.agent(app);
  await h.post(agent, '/register', { first_name: 'Α', last_name: 'Β', email: 'test@example.com', password: 'Password123', password_confirm: 'Password123' }, '/register');
  await h.post(agent, '/booking', { ...h.searchParams(), ...h.driver() });
  const cars = db.prepare('SELECT COUNT(*) n FROM cars').get().n;
  clearTestData(db);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings').get().n, 0);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM users WHERE role = 'customer'`).get().n, 0);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM users WHERE role = 'admin'`).get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cars').get().n, cars);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
});
