'use strict';

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const bookingsLib = require('../src/lib/bookings');

test('εγγραφή, αποσύνδεση, σύνδεση, κρατήσεις στον λογαριασμό', async () => {
  const { db, app } = h.setup();
  const agent = h.agent(app);
  const weak = await h.post(agent, '/register', { first_name: 'Α', last_name: 'Β', email: 'a@example.com', password: 'short', password_confirm: 'short' }, '/register');
  assert.equal(weak.status, 422);

  const reg = await h.post(agent, '/register', { first_name: 'Μαρία', last_name: 'Κ', email: 'Maria@Example.com', password: 'Kalimera2026', password_confirm: 'Kalimera2026' }, '/register');
  assert.equal(reg.status, 303);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get('maria@example.com');
  assert.ok(user);
  assert.notEqual(user.password_hash, 'Kalimera2026');

  // Διπλό email
  const dup = await h.post(h.agent(app), '/register', { first_name: 'Χ', last_name: 'Υ', email: 'maria@example.com', password: 'Kalimera2026', password_confirm: 'Kalimera2026' }, '/register');
  assert.equal(dup.status, 422);

  // Η κράτηση συνδέεται με τον λογαριασμό
  await h.post(agent, '/booking', { ...h.searchParams(), ...h.driver({ email: 'maria@example.com' }) });
  const acc = await agent.get('/account');
  assert.match(acc.text, /Οι κρατήσεις μου/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings WHERE user_id = ?').get(user.id).n, 1);

  await h.post(agent, '/logout', {});
  assert.equal((await agent.get('/account')).status, 302);

  const bad = await h.login(agent, { email: 'maria@example.com', password: 'wrongpass1' });
  assert.equal(bad.status, 401);
  const good = await h.login(agent, { email: 'maria@example.com', password: 'Kalimera2026' });
  assert.equal(good.status, 303);
  assert.equal((await agent.get('/account')).status, 200);
});

test('επαναφορά κωδικού με σύνδεσμο μίας χρήσης', async () => {
  const { app, db } = h.setup();
  const u = await h.createUser(db, { email: 'reset@example.com' });
  const agent = h.agent(app);
  await h.post(agent, '/forgot-password', { email: 'reset@example.com' }, '/forgot-password');
  await h.mailer.flush();
  const mail = h.mailer.outbox.find((m) => m.to === 'reset@example.com');
  const token = /reset-password\/([a-f0-9]{64})/.exec(mail.html)[1];

  // Άγνωστο email: ίδια απάντηση, χωρίς email
  const before = h.mailer.outbox.length;
  const unknown = await h.post(agent, '/forgot-password', { email: 'nobody@example.com' }, '/forgot-password');
  assert.match(unknown.text, /Αν υπάρχει λογαριασμός/);
  assert.equal(h.mailer.outbox.length, before);

  const res = await h.post(agent, `/reset-password/${token}`, { password: 'NewPassword99', password_confirm: 'NewPassword99' }, `/reset-password/${token}`);
  assert.equal(res.status, 303);
  const fresh = h.agent(app);
  assert.equal((await h.login(fresh, { email: u.email, password: 'NewPassword99' })).status, 303);
  // Ο σύνδεσμος δεν ξαναχρησιμοποιείται
  const reuse = await h.agent(app).get(`/reset-password/${token}`);
  assert.match(reuse.text, /δεν είναι έγκυρος/);
});

test('η διαχείριση είναι προσβάσιμη μόνο σε διαχειριστές', async () => {
  const { app, db } = h.setup();
  assert.equal((await h.request(app).get('/admin')).status, 302);
  const customer = await h.createUser(db, { email: 'c@example.com' });
  const ca = h.agent(app);
  await h.login(ca, customer);
  assert.equal((await ca.get('/admin')).status, 403);
  assert.equal((await ca.get('/admin/bookings')).status, 403);

  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  for (const url of ['/admin', '/admin/bookings', '/admin/cars', '/admin/cars/new', '/admin/cars/1', '/admin/locations', '/admin/extras', '/admin/seasons', '/admin/users', '/admin/messages']) {
    const r = await aa.get(url);
    assert.equal(r.status, 200, url);
  }
});

test('διαχειριστής: παράδοση, επιστροφή, είσπραξη, ακύρωση', async () => {
  const { app, db } = h.setup();
  // Παραλαβή σε 2 ημέρες: η παράδοση επιτρέπεται έως 12 ώρες νωρίτερα, οπότε τη μεταφέρουμε στο «τώρα».
  const res = await h.post(h.agent(app), '/booking', { ...h.searchParams({ from: 2 }), ...h.driver() });
  const ref = /\/booking\/([A-Z0-9]{8})/.exec(res.headers.location)[1];
  const b = bookingsLib.getByReference(db, ref);

  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  const page = `/admin/bookings/${b.id}`;

  // Παράδοση πολύ νωρίτερα από την προγραμματισμένη ώρα => άρνηση
  await h.post(aa, `${page}/pickup`, { pickup_km: '12000', collected_payment: '1' }, page);
  assert.equal(bookingsLib.getById(db, b.id).status, 'confirmed');
  db.prepare('UPDATE bookings SET pickup_at = ? WHERE id = ?').run(h.time.addMinutes(h.time.nowLocal(), 60), b.id);

  // Παράδοση χωρίς είσπραξη => άρνηση
  await h.post(aa, `${page}/pickup`, { pickup_km: '12000' }, page);
  assert.equal(bookingsLib.getById(db, b.id).status, 'confirmed');
  await h.post(aa, `${page}/pickup`, { pickup_km: '12000', collected_payment: '1' }, page);
  assert.equal(bookingsLib.getById(db, b.id).status, 'confirmed', 'χωρίς εγγύηση η παράδοση απορρίπτεται');
  await h.post(aa, `${page}/pickup`, { pickup_km: '12000', collected_payment: '1', no_deposit: '1' }, page);
  let cur = bookingsLib.getById(db, b.id);
  assert.equal(cur.status, 'active');
  assert.equal(cur.payment_status, 'paid');

  // Χιλιόμετρα επιστροφής μικρότερα => άρνηση
  await h.post(aa, `${page}/return`, { return_km: '11000' }, page);
  assert.equal(bookingsLib.getById(db, b.id).status, 'active');
  await h.post(aa, `${page}/return`, { return_km: '12450' }, page);
  cur = bookingsLib.getById(db, b.id);
  assert.equal(cur.status, 'completed');
  assert.equal(cur.return_km, 12450);
  assert.ok(bookingsLib.getEvents(db, b.id).length >= 4);

  // Ακύρωση από διαχειριστή άλλης κράτησης
  const res2 = await h.post(h.agent(app), '/booking', { ...h.searchParams({ car: 3 }), ...h.driver() });
  const b2 = bookingsLib.getByReference(db, /\/booking\/([A-Z0-9]{8})/.exec(res2.headers.location)[1]);
  await h.post(aa, `/admin/bookings/${b2.id}/cancel`, { reason: 'Βλάβη αυτοκινήτου' }, `/admin/bookings/${b2.id}`);
  assert.equal(bookingsLib.getById(db, b2.id).status, 'cancelled');
});

test('διαχειριστής: προσθήκη αυτοκινήτου με φωτογραφία, μη διαθεσιμότητα για σέρβις', async () => {
  const { app, db } = h.setup();
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  const token = await h.csrf(aa, '/admin/cars/new');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const res = await aa
    .post('/admin/cars')
    .field('_csrf', token)
    .field('make', 'Skoda')
    .field('model', 'Octavia')
    .field('year', '2024')
    .field('plate', 'ΝΒΧ9999')
    .field('category', 'family')
    .field('transmission', 'automatic')
    .field('fuel', 'diesel')
    .field('seats', '5')
    .field('doors', '5')
    .field('luggage', '4')
    .field('daily_rate', '49,90')
    .field('deposit', '400')
    .field('min_driver_age', '23')
    .field('active', '1')
    .attach('image', png, { filename: 'car.png', contentType: 'image/png' });
  assert.equal(res.status, 303);
  const car = db.prepare('SELECT * FROM cars WHERE plate = ?').get('ΝΒΧ9999');
  assert.equal(car.daily_rate_cents, 4990);
  assert.match(car.image, /^\/uploads\/[a-f0-9]+\.png$/);
  assert.equal((await aa.get(car.image)).status, 200);

  // Multipart χωρίς CSRF => άρνηση
  const noCsrf = await aa.post('/admin/cars').field('make', 'X');
  assert.equal(noCsrf.status, 403);

  // Δέσμευση για σέρβις => δεν εμφανίζεται διαθέσιμο
  const s = h.searchParams({ car: car.id });
  await h.post(aa, `/admin/cars/${car.id}/blocks`, { start_at: `${s.pickup_date}T08:00`, end_at: `${s.return_date}T20:00`, reason: 'Service' }, `/admin/cars/${car.id}`);
  const list = await h.request(app).get('/cars').query(s);
  assert.doesNotMatch(list.text, new RegExp(`/booking/new\\?car_id=${car.id}&`));
  const book = await h.post(h.agent(app), '/booking', { ...s, ...h.driver() });
  assert.equal(book.status, 409);
});

test('φόρμα επικοινωνίας: αποθήκευση και ειδοποίηση', async () => {
  const { app, db } = h.setup();
  const agent = h.agent(app);
  const bad = await h.post(agent, '/contact', { name: '', email: 'x', subject: '', body: 'σύντομο' });
  assert.equal(bad.status, 422);
  const ok = await h.post(agent, '/contact', { name: 'Νίκος', email: 'nikos@example.com', subject: 'Ερώτηση', body: 'Μπορώ να πάρω το αυτοκίνητο στη Θάσο;' });
  assert.equal(ok.status, 302);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM messages').get().n, 1);
});
