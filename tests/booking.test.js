'use strict';

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const payments = require('../src/lib/payments');
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
  const res = await h.post(agent, '/booking', { ...h.searchParams({ returnLocation: 2 }), ...h.driver(), extra_1: '1', extra_3: '2', total_cents: '1' });
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

test('ακύρωση από πελάτη: επιτρέπεται πριν το όριο, όχι μέσα σε αυτό', async () => {
  const { db, app } = h.setup();
  const agent = h.agent(app);
  const res = await h.post(agent, '/booking', { ...h.searchParams({ from: 10 }), ...h.driver() });
  const b = bookingFromRedirect(db, res);
  const cancel = await h.post(agent, `/booking/${b.reference}/cancel`, {}, `/booking/${b.reference}`);
  assert.equal(cancel.status, 303);
  assert.equal(bookingsLib.getById(db, b.id).status, 'cancelled');
  assert.ok(h.mailer.outbox.some((m) => m.subject.startsWith('Ακύρωση κράτησης')));

  // Το αυτοκίνητο είναι πάλι διαθέσιμο
  const again = await h.post(h.agent(app), '/booking', { ...h.searchParams({ from: 10 }), ...h.driver() });
  assert.equal(again.status, 303);

  // Κράτηση σε 1 ημέρα: όχι online ακύρωση (όριο 48 ώρες)
  const soon = await h.post(agent, '/booking', { ...h.searchParams({ car: 2, from: 1 }), ...h.driver() });
  const sb = bookingFromRedirect(db, soon);
  const page = await agent.get(`/booking/${sb.reference}`);
  assert.match(page.text, /Η δωρεάν ακύρωση είναι δυνατή έως 48 ώρες/);
  await h.post(agent, `/booking/${sb.reference}/cancel`, {});
  assert.equal(bookingsLib.getById(db, sb.id).status, 'confirmed');
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

test('πληρωμή με κάρτα (Stripe): δέσμευση, επιβεβαίωση από webhook, επιστροφή χρημάτων στην ακύρωση', async (t) => {
  const { db, app } = h.setup();
  const sessions = {};
  const refunds = [];
  payments.setClient({
    checkout: {
      sessions: {
        create: async (params) => {
          const s = { id: `cs_test_${Object.keys(sessions).length}`, url: 'https://checkout.stripe.com/pay/test', ...params };
          sessions[s.id] = s;
          return s;
        },
        retrieve: async (id) => sessions[id],
      },
    },
    refunds: { create: async (p) => (refunds.push(p), { id: 're_1' }) },
    webhooks: {
      constructEvent: (raw, sig) => {
        if (sig !== 'valid') throw new Error('bad signature');
        return JSON.parse(raw.toString());
      },
    },
  });
  t.after(() => payments.setClient(null));

  const agent = h.agent(app);
  const res = await h.post(agent, '/booking', { ...h.searchParams({ from: 15 }), ...h.driver({ payment_method: 'card' }) });
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, 'https://checkout.stripe.com/pay/test');
  const b = db.prepare('SELECT * FROM bookings ORDER BY id DESC LIMIT 1').get();
  assert.equal(b.status, 'pending_payment');
  const session = sessions[b.stripe_session_id];
  assert.equal(session.line_items[0].price_data.unit_amount, b.total_cents);

  // Το αυτοκίνητο είναι δεσμευμένο όσο περιμένουμε την πληρωμή
  const other = await h.post(h.agent(app), '/booking', { ...h.searchParams({ from: 15 }), ...h.driver() });
  assert.equal(other.status, 409);

  // Webhook με λάθος υπογραφή απορρίπτεται
  const event = {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { id: session.id, payment_status: 'paid', amount_total: b.total_cents, payment_intent: 'pi_1', metadata: { booking_reference: b.reference } } },
  };
  const bad = await h.request(app).post('/webhooks/stripe').set('stripe-signature', 'nope').set('content-type', 'application/json').send(JSON.stringify(event));
  assert.equal(bad.status, 400);

  const ok = await h.request(app).post('/webhooks/stripe').set('stripe-signature', 'valid').set('content-type', 'application/json').send(JSON.stringify(event));
  assert.equal(ok.status, 200);
  let paid = bookingsLib.getById(db, b.id);
  assert.equal(paid.status, 'confirmed');
  assert.equal(paid.payment_status, 'paid');
  assert.equal(paid.paid_cents, b.total_cents);
  const confirmations = h.mailer.outbox.filter((m) => m.subject === `Επιβεβαίωση κράτησης ${b.reference}`).length;

  // Το ίδιο γεγονός ξανά (ή επιστροφή από τη σελίδα επιτυχίας) δεν διπλοκαταγράφει
  await h.request(app).post('/webhooks/stripe').set('stripe-signature', 'valid').set('content-type', 'application/json').send(JSON.stringify(event));
  session.payment_status = 'paid';
  session.amount_total = b.total_cents;
  session.payment_intent = 'pi_1';
  await agent.get(`/booking/${b.reference}/payment/success?session_id=${session.id}`);
  assert.equal(h.mailer.outbox.filter((m) => m.subject === `Επιβεβαίωση κράτησης ${b.reference}`).length, confirmations);

  // Ακύρωση από τον πελάτη => αυτόματη επιστροφή χρημάτων
  await h.post(agent, `/booking/${b.reference}/cancel`, {}, `/booking/${b.reference}`);
  paid = bookingsLib.getById(db, b.id);
  assert.equal(paid.status, 'cancelled');
  assert.equal(paid.payment_status, 'refunded');
  assert.deepEqual(refunds, [{ payment_intent: 'pi_1', amount: b.total_cents }]);
});

test('απλήρωτες κρατήσεις λήγουν και αποδεσμεύουν το αυτοκίνητο', async (t) => {
  const { db, app } = h.setup();
  payments.setClient({ checkout: { sessions: { create: async () => ({ id: 'cs_x', url: 'https://checkout.stripe.com/x' }) } } });
  t.after(() => payments.setClient(null));
  await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver({ payment_method: 'card' }) });
  const b = db.prepare('SELECT * FROM bookings').get();
  assert.equal(bookingsLib.expireStaleHolds(db, Date.now()), 0);
  assert.equal(bookingsLib.expireStaleHolds(db, b.hold_expires_at + 1), 1);
  assert.equal(bookingsLib.getById(db, b.id).status, 'expired');
  // Λήξη του hold => άλλος μπορεί να κλείσει το αυτοκίνητο
  db.prepare('UPDATE bookings SET hold_expires_at = 0 WHERE id = ?').run(b.id);
  const res = await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver() });
  assert.equal(res.status, 303);
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
