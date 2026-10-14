'use strict';

// Tests για τα προβλήματα που εντόπισε ο έλεγχος κώδικα (ώστε να μην ξαναεμφανιστούν).

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb, transaction } = require('../src/db');
const { seasonPercentFor } = require('../src/lib/pricing');
const { isCarAvailable } = require('../src/lib/availability');
const bookingsLib = require('../src/lib/bookings');
const { upsertAdmin } = require('../src/db/create-admin');

test('CSRF: αίτημα multipart χωρίς token απορρίπτεται σε κάθε διαδρομή εκτός από το ανέβασμα φωτογραφιών', async () => {
  const { db, app } = h.setup();
  const res = await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver() });
  const ref = h.bookingRef(res);
  const customer = h.agent(app);
  await h.post(customer, '/manage', { reference: ref, email: 'giorgos@example.com' }, '/manage');
  const forged = await customer.post(`/booking/${ref}/cancel`).field('x', '1');
  assert.equal(forged.status, 403);
  assert.equal(bookingsLib.getByReference(db, ref).status, 'confirmed');
  const login = await h.request(app).post('/login').field('email', 'a@b.gr');
  assert.equal(login.status, 403, 'όχι 500');
});

test('CSRF: token με πολυβυτικούς χαρακτήρες δεν προκαλεί σφάλμα 500', async () => {
  const { app } = h.setup();
  const agent = h.agent(app);
  await h.csrf(agent);
  const res = await agent.post('/contact').type('form').send({ _csrf: 'é'.repeat(64), name: 'x' });
  assert.equal(res.status, 403);
});

test('επισκέψεις χωρίς cookie (healthcheck, API, σελίδες χωρίς φόρμα) δεν δημιουργούν sessions', async () => {
  const { db, app } = h.setup();
  const r1 = await h.request(app).get('/healthz');
  assert.equal(r1.text, 'ok');
  assert.equal(r1.headers['set-cookie'], undefined);
  await h.request(app).get('/api/quote').query(h.searchParams());
  await h.request(app).get('/cars');
  await h.request(app).get('/');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
});

test('/cars με κακόβουλη ταξινόμηση δεν «σπάει»', async () => {
  const { app } = h.setup();
  for (const sort of ['__proto__', 'hasOwnProperty', 'valueOf', 'constructor']) {
    const res = await h.request(app).get('/cars').query({ sort });
    assert.equal(res.status, 200, sort);
  }
});

test('εποχικές τιμές: ισχύει η υψηλότερη ανεξάρτητα από τη σειρά (και με περίοδο 100%)', () => {
  const winter = { start_md: '11-01', end_md: '04-30', percent: 80 };
  const easter = { start_md: '04-10', end_md: '04-20', percent: 100 };
  assert.equal(seasonPercentFor('2027-04-15', [winter, easter]), 100);
  assert.equal(seasonPercentFor('2027-04-15', [easter, winter]), 100);
  assert.equal(seasonPercentFor('2027-02-01', [easter, winter]), 80);
});

test('μια αποτυχημένη συναλλαγή κάνει πάντα rollback και δεν «κλειδώνει» τη βάση', () => {
  const db = openDb(':memory:');
  assert.throws(() =>
    transaction(db, () => {
      db.prepare(`INSERT INTO locations (name) VALUES ('x')`).run();
      throw new Error('boom');
    }),
  );
  assert.equal(db.prepare('SELECT COUNT(*) n FROM locations').get().n, 0);
  transaction(db, () => db.prepare(`INSERT INTO locations (name) VALUES ('y')`).run());
  assert.equal(db.prepare('SELECT COUNT(*) n FROM locations').get().n, 1);
});

test('εκπρόθεσμη ενοικίαση: το αυτοκίνητο δεν πουλιέται ενώ λείπει', () => {
  const { db } = h.setup();
  const now = h.time.nowLocal();
  db.prepare(
    `INSERT INTO bookings (reference, car_id, pickup_location_id, return_location_id, pickup_at, return_at, days,
      first_name, last_name, email, phone, birth_date, license_number, license_country, license_issued,
      base_cents, total_cents, vat_cents, status, payment_method, terms_accepted_at)
     VALUES ('OVERDUE1', 1, 1, 1, ?, ?, 2, 'A', 'B', 'a@b.gr', '6900000000', '1990-01-01', 'X', 'GR', '2010-01-01',
      5000, 5000, 968, 'active', 'pay_at_pickup', datetime('now'))`,
  ).run(h.time.addMinutes(now, -3 * 24 * 60), h.time.addMinutes(now, -24 * 60));
  const tomorrowStart = h.time.addMinutes(now, 6 * 60);
  assert.equal(isCarAvailable(db, 1, tomorrowStart, h.time.addMinutes(tomorrowStart, 24 * 60)), false);
  const nextWeek = h.time.addMinutes(now, 7 * 24 * 60);
  assert.equal(isCarAvailable(db, 1, nextWeek, h.time.addMinutes(nextWeek, 24 * 60)), true);
});

test('πινακίδες: λατινικά/ελληνικά, κενά και παύλες θεωρούνται ίδια πινακίδα', async () => {
  const { db, app } = h.setup();
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  for (const plate of ['NBA1001', 'ΝΒΑ 1001', 'nba-1001']) {
    const token = await h.csrf(aa, '/admin/cars/new');
    const res = await aa
      .post('/admin/cars')
      .field('_csrf', token)
      .field('make', 'X')
      .field('model', 'Y')
      .field('year', '2024')
      .field('plate', plate)
      .field('category', 'mini')
      .field('transmission', 'manual')
      .field('fuel', 'petrol')
      .field('seats', '4')
      .field('doors', '5')
      .field('luggage', '1')
      .field('daily_rate', '30')
      .field('min_driver_age', '21');
    assert.equal(res.status, 422, plate);
    assert.match(res.text, /Υπάρχει ήδη αυτοκίνητο/);
  }
});

test('αναζήτηση κρατήσεων στη διαχείριση με ελληνικά χωρίς τόνους / κεφαλαία', async () => {
  const { db, app } = h.setup();
  await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver() });
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  for (const q of ['παπαδοπουλος', 'ΠΑΠΑΔΟΠΟΥΛΟΣ', 'Γιώργος Παπαδ']) {
    const res = await aa.get('/admin/bookings').query({ q });
    assert.match(res.text, /\(1\)/, q);
  }
});

test('διαγραφή λογαριασμού: ανωνυμοποίηση απλήρωτων κρατήσεων, χωρίς επαναχρησιμοποίηση id', async () => {
  const { db, app } = h.setup();
  const agent = h.agent(app);
  await h.post(agent, '/register', { first_name: 'Α', last_name: 'Β', email: 'del@example.com', password: 'Password123', password_confirm: 'Password123', terms: '1' }, '/register');
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get('del@example.com');
  const res = await h.post(agent, '/booking', { ...h.searchParams(), ...h.driver({ email: 'del@example.com' }) });
  const ref = h.bookingRef(res);
  await h.post(agent, `/booking/${ref}/cancel`, {}, `/booking/${ref}`);
  await h.post(agent, '/account/delete', { current_password: 'Password123' }, '/account');
  const b = bookingsLib.getByReference(db, ref);
  assert.equal(b.user_id, null);
  assert.equal(b.license_number, '');
  assert.equal(b.email, 'deleted@invalid');
  await h.post(h.agent(app), '/register', { first_name: 'Ν', last_name: 'Ο', email: 'new@example.com', password: 'Password123', password_confirm: 'Password123', terms: '1' }, '/register');
  const newUser = db.prepare('SELECT id FROM users WHERE email = ?').get('new@example.com');
  assert.ok(newUser.id > user.id);
});

test('create-admin σε υπάρχοντα λογαριασμό τερματίζει όλες τις συνδέσεις του', async () => {
  const { db, app } = h.setup();
  const attacker = h.agent(app);
  await h.post(attacker, '/register', { first_name: 'Χ', last_name: 'Ψ', email: 'info@example.gr', password: 'Password123', password_confirm: 'Password123', terms: '1' }, '/register');
  assert.equal((await attacker.get('/admin')).status, 403);
  await upsertAdmin(db, 'info@example.gr', 'AnotherPass2026');
  const res = await attacker.get('/admin');
  assert.equal(res.status, 302, 'η παλιά σύνδεση δεν έχει πλέον πρόσβαση');
});

test('το link «Συνδεθείτε» στη φόρμα κράτησης επιστρέφει στην ίδια κράτηση', async () => {
  const { db, app } = h.setup();
  const user = await h.createUser(db, { email: 'c@example.com' });
  const agent = h.agent(app);
  const qs = new URLSearchParams({ car_id: '1', ...h.searchParams() }).toString();
  const form = await agent.get(`/booking/new?${qs}`);
  const loginUrl = /href="(\/login\?returnTo=[^"]+)"/.exec(form.text)[1].replace(/&amp;/g, '&');
  await agent.get(loginUrl);
  const res = await h.login(agent, user);
  assert.match(res.headers.location, /^\/booking\/new\?car_id=1/);
});
