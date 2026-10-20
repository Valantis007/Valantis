'use strict';

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const bookingsLib = require('../src/lib/bookings');

function bookingFromRedirect(db, res) {
  const m = /\/booking\/([A-Z0-9]{8})/.exec(res.headers.location || '');
  assert.ok(m, `αναμενόταν ανακατεύθυνση σε κράτηση, ήρθε ${res.status} ${res.headers.location}`);
  return bookingsLib.getByReference(db, m[1]);
}

test('αναζήτηση: εμφανίζει διαθέσιμα αυτοκίνητα με τελική τιμή', async () => {
  const { app } = h.setup();
  const res = await h.request(app).get('/cars').query(h.searchParams());
  assert.equal(res.status, 200);
  assert.match(res.text, /διαθέσιμα αυτοκίνητα για <strong>3 ημέρες/);
  assert.match(res.text, /\/booking\/new\?car_id=1/);
});

test('αναζήτηση: απορρίπτει παρελθοντικές ημερομηνίες και επιστροφή πριν την παραλαβή', async () => {
  const { app } = h.setup();
  let res = await h.request(app).get('/cars').query(h.searchParams({ from: -2 }));
  assert.match(res.text, /τουλάχιστον 2 ώρες από τώρα/);
  res = await h.request(app).get('/cars').query({ ...h.searchParams(), return_date: h.daysFromNow(29) });
  assert.match(res.text, /Η επιστροφή πρέπει να είναι μετά την παραλαβή/);
  res = await h.request(app).get('/cars').query(h.searchParams({ pickupTime: '03:00' }));
  assert.match(res.text, /Οι παραλαβές γίνονται/);
});

test('κράτηση με πληρωμή στην παραλαβή: επιβεβαίωση, email, σωστή τιμή από τον server', async () => {
  const { db, app } = h.setup();
  const agent = h.agent(app);
  const res = await h.post(agent, '/booking', { ...h.searchParams({ returnLocation: 2 }), ...h.driver({ child_info: '3 ετών, 15 κιλά' }), extra_1: '1', extra_3: '2', total_cents: '1' });
  assert.equal(res.status, 303);
  const b = bookingFromRedirect(db, res);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.payment_method, 'pay_at_pickup');
  assert.equal(b.days, 3);
  const extras = db.prepare('SELECT * FROM booking_extras WHERE booking_id = ?').all(b.id);
  assert.equal(extras.length, 2);
  // Το σύνολο υπολογίζεται στον server (αγνοείται οτιδήποτε στέλνει ο browser).
  assert.equal(b.total_cents, b.base_cents - b.discount_cents + b.extras_cents + b.fees_cents);
  assert.equal(b.fees_cents, 2000 + 3000); // αεροδρόμιο + διαφορετική επιστροφή
  await h.mailer.flush();
  assert.ok(h.mailer.outbox.some((m) => m.to === 'giorgos@example.com' && m.subject.includes(b.reference)));

  const page = await agent.get(`/booking/${b.reference}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /επιβεβαιωμένη/);
});

test('έλεγχος στοιχείων οδηγού: ηλικία, δίπλωμα, όροι', async () => {
  const { app } = h.setup();
  const agent = h.agent(app);
  const res = await h.post(agent, '/booking', {
    ...h.searchParams({ car: 10 }), // Mercedes: ελάχιστη ηλικία 27
    ...h.driver({ birth_date: '2004-01-01', license_issued: h.daysFromNow(0), terms: '' }),
  });
  assert.equal(res.status, 422);
  assert.match(res.text, /τουλάχιστον 27 ετών/);
  assert.match(res.text, /δίπλωμα τουλάχιστον 1 έτους/);
  assert.match(res.text, /αποδεχθείτε τους όρους/);
});

test('δεν επιτρέπεται διπλή κράτηση του ίδιου αυτοκινήτου (και με χρόνο προετοιμασίας)', async () => {
  const { db, app } = h.setup();
  const a = h.agent(app);
  const first = await h.post(a, '/booking', { ...h.searchParams({ from: 20, days: 3 }), ...h.driver() });
  assert.equal(first.status, 303);

  // Επικαλυπτόμενες ημερομηνίες
  const b = h.agent(app);
  const second = await h.post(b, '/booking', { ...h.searchParams({ from: 21, days: 3 }), ...h.driver({ email: 'other@example.com' }) });
  assert.equal(second.status, 409);
  assert.match(second.text, /μόλις κρατήθηκε/);

  // Παραλαβή την ίδια ώρα που επιστρέφεται: μπλοκάρεται λόγω χρόνου προετοιμασίας (60')
  const third = await h.post(b, '/booking', { ...h.searchParams({ from: 23, days: 2, pickupTime: '10:30' }), ...h.driver({ email: 'x@example.com' }) });
  assert.equal(third.status, 409);

  // Μετά τον χρόνο προετοιμασίας επιτρέπεται
  const fourth = await h.post(b, '/booking', { ...h.searchParams({ from: 23, days: 2, pickupTime: '11:00' }), ...h.driver({ email: 'y@example.com' }) });
  assert.equal(fourth.status, 303);

  // Δεν εμφανίζεται πλέον στα διαθέσιμα
  const list = await h.request(app).get('/cars').query(h.searchParams({ from: 21, days: 1 }));
  assert.doesNotMatch(list.text, /\/booking\/new\?car_id=1&/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings').get().n, 2);
});

test('ακύρωση από πελάτη: δωρεάν πριν το όριο, με τη γνωστοποιημένη χρέωση μέσα σε αυτό', async () => {
  const { db, app } = h.setup();
  const agent = h.agent(app);
  const res = await h.post(agent, '/booking', { ...h.searchParams({ from: 10 }), ...h.driver() });
  const b = bookingFromRedirect(db, res);
  const cancel = await h.post(agent, `/booking/${b.reference}/cancel`, {}, `/booking/${b.reference}`);
  assert.equal(cancel.status, 303);
  assert.equal(bookingsLib.getById(db, b.id).status, 'cancelled');
  await h.mailer.flush();
  assert.ok(h.mailer.outbox.some((m) => m.subject.startsWith('Ακύρωση κράτησης')));

  // Το αυτοκίνητο είναι πάλι διαθέσιμο
  const again = await h.post(h.agent(app), '/booking', { ...h.searchParams({ from: 10 }), ...h.driver() });
  assert.equal(again.status, 303);

  // Κράτηση σε 1 ημέρα με προπληρωμή: η ακύρωση γίνεται online με τη χρέωση που γνωστοποιήθηκε.
  const soon = await h.post(agent, '/booking', { ...h.searchParams({ car: 2, from: 1 }), ...h.driver() });
  const sb = bookingFromRedirect(db, soon);
  db.prepare(`UPDATE bookings SET payment_status = 'paid', paid_cents = total_cents WHERE id = ?`).run(sb.id);
  const page = await agent.get(`/booking/${sb.reference}`);
  assert.match(page.text, /χρέωση ακύρωσης/);
  // Χωρίς ρητή αποδοχή της χρέωσης δεν ακυρώνεται.
  await h.post(agent, `/booking/${sb.reference}/cancel`, {});
  assert.equal(bookingsLib.getById(db, sb.id).status, 'confirmed');
  await h.post(agent, `/booking/${sb.reference}/cancel`, { accept_fee: '1' });
  const after = bookingsLib.getById(db, sb.id);
  assert.equal(after.status, 'cancelled');
  // Πληρωμή εκτός συστήματος: οφειλόμενη επιστροφή = σύνολο - χρέωση ακύρωσης
  const due = db.prepare(`SELECT note FROM booking_events WHERE booking_id = ? AND action = 'refund_due'`).get(sb.id);
  assert.ok(due, 'καταγράφεται η οφειλόμενη επιστροφή');
  assert.ok(after.late_cancel_fee_cents > 0 && after.late_cancel_fee_cents < after.total_cents);
});

test('πρόσβαση σε κράτηση: μόνο με κωδικό + email', async () => {
  const { db, app } = h.setup();
  const res = await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver() });
  const b = bookingFromRedirect(db, res);

  const stranger = h.agent(app);
  const denied = await stranger.get(`/booking/${b.reference}`);
  assert.equal(denied.status, 302);
  assert.equal(denied.headers.location, '/manage');

  const wrong = await h.post(stranger, '/manage', { reference: b.reference, email: 'wrong@example.com' }, '/manage');
  assert.equal(wrong.status, 404);

  const ok = await h.post(stranger, '/manage', { reference: b.reference.toLowerCase(), email: 'GIORGOS@example.com' }, '/manage');
  assert.equal(ok.status, 302);
  assert.equal((await stranger.get(`/booking/${b.reference}`)).status, 200);
});

test('φόρμες χωρίς CSRF token απορρίπτονται', async () => {
  const { app } = h.setup();
  const res = await h.request(app).post('/booking').type('form').send({ ...h.searchParams(), ...h.driver() });
  assert.equal(res.status, 403);
});

test('ζωντανός υπολογισμός τιμής (API)', async () => {
  const { app } = h.setup();
  const res = await h.request(app).get('/api/quote').query({ ...h.searchParams({ days: 7 }), extra_1: '1' });
  assert.equal(res.status, 200);
  assert.equal(res.body.days, 7);
  assert.equal(res.body.discountPercent, 5);
  assert.ok(res.body.extrasCents > 0);
});
