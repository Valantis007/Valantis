'use strict';

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bookingsLib = require('../src/lib/bookings');
const payments = require('../src/lib/payments');
const { runMaintenance } = require('../src/lib/maintenance');

async function cardBooking(app, db, opts = {}) {
  const agent = h.agent(app);
  const res = await h.post(agent, '/booking', { ...h.searchParams(opts), ...h.driver({ payment_method: 'card', ...(opts.driver || {}) }) });
  assert.equal(res.status, 303, res.text && res.text.slice(0, 300));
  const b = db.prepare('SELECT * FROM bookings ORDER BY id DESC LIMIT 1').get();
  return { agent, res, booking: bookingsLib.getById(db, b.id) };
}

function stripeWebhook(app, fake, type, object) {
  return h.request(app).post('/webhooks/stripe').set('stripe-signature', fake.webhookSecret).set('content-type', 'application/json').send(fake.event(type, object));
}

test('Stripe: πληρωμή, επιβεβαίωση από webhook, idempotent, επιστροφή στην ακύρωση', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const { agent, res, booking } = await cardBooking(app, db, { from: 15 });
  assert.match(res.headers.location, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal(booking.status, 'pending_payment');
  const sessionId = booking.checkout_id;
  assert.equal(fake.sessions[sessionId].amount_total, booking.total_cents);

  // Το αυτοκίνητο είναι δεσμευμένο όσο περιμένουμε την πληρωμή.
  const other = await h.post(h.agent(app), '/booking', { ...h.searchParams({ from: 15 }), ...h.driver() });
  assert.equal(other.status, 409);

  // Λάθος υπογραφή => 400
  const bad = await h.request(app).post('/webhooks/stripe').set('stripe-signature', 'nope').set('content-type', 'application/json').send('{}');
  assert.equal(bad.status, 400);

  fake.pay(sessionId);
  const ok = await stripeWebhook(app, fake, 'checkout.session.completed', { id: sessionId });
  assert.equal(ok.status, 204);
  let b = bookingsLib.getById(db, booking.id);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.payment_status, 'paid');
  assert.equal(b.paid_cents, booking.total_cents);
  assert.equal(b.payment_provider, 'stripe');
  await h.mailer.flush();
  const confirmations = h.mailer.outbox.filter((m) => m.subject === `Επιβεβαίωση κράτησης ${b.reference}`).length;
  assert.equal(confirmations, 1);

  // Επανάληψη webhook + επιστροφή από τη σελίδα πληρωμής: καμία διπλή καταγραφή.
  await stripeWebhook(app, fake, 'checkout.session.completed', { id: sessionId });
  const ret = await agent.get(`/booking/${b.reference}/payment/return?session_id=${sessionId}`);
  assert.equal(ret.status, 303);
  await h.mailer.flush();
  assert.equal(h.mailer.outbox.filter((m) => m.subject === `Επιβεβαίωση κράτησης ${b.reference}`).length, 1);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM booking_events WHERE booking_id = ? AND action = 'paid'`).get(b.id).n, 1);

  // Ακύρωση από τον πελάτη => αυτόματη επιστροφή
  await h.post(agent, `/booking/${b.reference}/cancel`, {}, `/booking/${b.reference}`);
  b = bookingsLib.getById(db, b.id);
  assert.equal(b.status, 'cancelled');
  assert.equal(b.payment_status, 'refunded');
  assert.equal(b.refunded_cents, b.paid_cents);
  assert.equal(fake.refunds.length, 1);
  assert.equal(fake.refunds[0].amount, b.paid_cents);
});

test('επίσκεψη ξανά στη σελίδα επιτυχίας μετά από μερική επιστροφή ΔΕΝ επιστρέφει το υπόλοιπο', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const { agent, booking } = await cardBooking(app, db);
  fake.pay(booking.checkout_id);
  await agent.get(`/booking/${booking.reference}/payment/return?session_id=${booking.checkout_id}`);
  assert.equal(bookingsLib.getById(db, booking.id).payment_status, 'paid');

  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  await h.post(aa, `/admin/bookings/${booking.id}/cancel`, { refund: '1', refund_amount: '10.00', reason: 'Χρέωση ακύρωσης' }, `/admin/bookings/${booking.id}`);
  let b = bookingsLib.getById(db, booking.id);
  assert.equal(b.status, 'cancelled');
  assert.equal(b.refunded_cents, 1000);
  assert.equal(b.payment_status, 'partially_refunded');

  await agent.get(`/booking/${booking.reference}/payment/return?session_id=${booking.checkout_id}`);
  await stripeWebhook(app, fake, 'checkout.session.completed', { id: booking.checkout_id });
  b = bookingsLib.getById(db, booking.id);
  assert.equal(b.refunded_cents, 1000);
  assert.equal(fake.refunds.length, 1);
});

test('νέα προσπάθεια πληρωμής: ξαναχρησιμοποιεί την ανοιχτή σελίδα και ανανεώνει τη δέσμευση', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const { agent, booking, res } = await cardBooking(app, db);
  const first = res.headers.location;
  const again = await h.post(agent, `/booking/${booking.reference}/pay`, {}, `/booking/${booking.reference}`);
  assert.equal(again.headers.location, first);

  // 10 λεπτά αργότερα, η παλιά σελίδα έχει λήξει: νέα σελίδα με ισχύ >= 30' και νέα δέσμευση.
  fake.sessions[booking.checkout_id].status = 'expired';
  db.prepare('UPDATE bookings SET hold_expires_at = ? WHERE id = ?').run(Date.now() + 25 * 60 * 1000, booking.id);
  const retry = await h.post(agent, `/booking/${booking.reference}/pay`, {}, `/booking/${booking.reference}`);
  assert.equal(retry.status, 303);
  assert.notEqual(retry.headers.location, first);
  const b = bookingsLib.getById(db, booking.id);
  assert.ok(b.hold_expires_at >= Date.now() + 34 * 60 * 1000);
});

test('πληρωμή σε παλιά σελίδα μετά από νέα προσπάθεια: η κράτηση επιβεβαιώνεται· δεύτερη πληρωμή επιστρέφεται αυτόματα', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const { agent, booking } = await cardBooking(app, db);
  const oldSession = booking.checkout_id;
  // Ο πελάτης πληρώνει την παλιά σελίδα σε άλλη καρτέλα πριν κλείσει.
  fake.pay(oldSession);
  // ...και ταυτόχρονα ανοίγει νέα (πριν φτάσει το webhook).
  const row = db.prepare('SELECT * FROM checkouts WHERE id = ?').get(oldSession);
  assert.equal(row.status, 'open');
  await stripeWebhook(app, fake, 'checkout.session.completed', { id: oldSession });
  let b = bookingsLib.getById(db, booking.id);
  assert.equal(b.status, 'confirmed');

  // Μια δεύτερη πληρωμή για την ίδια κράτηση (π.χ. τρίτη καρτέλα) επιστρέφεται.
  const second = await fake.client.checkout.sessions.create({
    ...fake.sessions[oldSession].params,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  payments.insertCheckout(db, { id: second.id, provider: 'stripe', bookingId: b.id, kind: 'rental', amountCents: b.total_cents, url: second.url });
  fake.pay(second.id);
  await stripeWebhook(app, fake, 'checkout.session.completed', { id: second.id });
  b = bookingsLib.getById(db, booking.id);
  assert.equal(b.paid_cents, b.total_cents);
  assert.equal(b.refunded_cents, 0, 'η επιστροφή της διπλής πληρωμής δεν αφορά την κράτηση');
  assert.equal(fake.refunds.length, 1);
  assert.equal(db.prepare('SELECT status FROM checkouts WHERE id = ?').get(second.id).status, 'refunded');
  await h.mailer.flush();
  assert.ok(h.mailer.outbox.some((m) => m.subject.startsWith('Επιστροφή πληρωμής')));
});

test('πληρωμή αφού ακυρώθηκε η κράτηση: επιστρέφεται αυτόματα και η σελίδα πληρωμής κλείνει', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const { agent, booking } = await cardBooking(app, db);
  await h.post(agent, `/booking/${booking.reference}/cancel`, {}, `/booking/${booking.reference}`);
  assert.equal(fake.sessions[booking.checkout_id].status, 'expired', 'η σελίδα πληρωμής πρέπει να κλείσει');
  // Ακόμη κι αν ο πελάτης προλάβει να πληρώσει, τα χρήματα επιστρέφονται.
  fake.sessions[booking.checkout_id].status = 'open';
  fake.pay(booking.checkout_id);
  await stripeWebhook(app, fake, 'checkout.session.completed', { id: booking.checkout_id });
  assert.equal(fake.refunds.length, 1);
  assert.equal(bookingsLib.getById(db, booking.id).status, 'cancelled');
});

test('καθυστερημένη πληρωμή όταν το αυτοκίνητο δόθηκε σε άλλον: επιστροφή, χωρίς διπλοκράτηση', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const { booking } = await cardBooking(app, db);
  db.prepare('UPDATE bookings SET hold_expires_at = ? WHERE id = ?').run(Date.now() - 1000, booking.id);
  // Άλλος πελάτης κλείνει το ίδιο αυτοκίνητο (η δέσμευση έληξε, η εργασία λήξης δεν έτρεξε ακόμη).
  const other = await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver({ email: 'b@example.com' }) });
  assert.equal(other.status, 303);
  fake.pay(booking.checkout_id);
  await stripeWebhook(app, fake, 'checkout.session.completed', { id: booking.checkout_id });
  const confirmed = db.prepare(`SELECT COUNT(*) n FROM bookings WHERE status = 'confirmed' AND car_id = ?`).get(booking.car_id).n;
  assert.equal(confirmed, 1);
  assert.equal(fake.refunds.length, 1);
});

test('αποτυχία επιστροφής: ξαναδοκιμάζεται αυτόματα και δεν γίνεται ποτέ διπλή', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const { agent, booking } = await cardBooking(app, db, { from: 20 });
  fake.pay(booking.checkout_id);
  await agent.get(`/booking/${booking.reference}/payment/return?session_id=${booking.checkout_id}`);
  fake.state.failRefunds = 1;
  const res = await h.post(agent, `/booking/${booking.reference}/cancel`, {}, `/booking/${booking.reference}`);
  assert.equal(res.status, 303);
  let b = bookingsLib.getById(db, booking.id);
  assert.equal(b.status, 'cancelled');
  assert.equal(b.refunded_cents, 0);
  assert.equal(payments.pendingRefundCents(db, b.id), b.paid_cents);
  await runMaintenance(db, { force: true });
  await runMaintenance(db, { force: true });
  b = bookingsLib.getById(db, booking.id);
  assert.equal(b.refunded_cents, b.paid_cents);
  assert.equal(b.payment_status, 'refunded');
  assert.equal(fake.refunds.length, 1);
});

test('αν η υπηρεσία πληρωμών δεν απαντά: σαφές μήνυμα, χωρίς email ακύρωσης', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  fake.state.failCreate = true;
  const res = await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver({ payment_method: 'card' }) });
  assert.equal(res.status, 502);
  await h.mailer.flush();
  assert.ok(!h.mailer.outbox.some((m) => m.subject.startsWith('Ακύρωση')));
  // Το αυτοκίνητο είναι πάλι διαθέσιμο.
  const again = await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver() });
  assert.equal(again.status, 303);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM bookings WHERE status = 'confirmed'`).get().n, 1);
});

test('ο πελάτης γυρίζει πίσω από τη σελίδα πληρωμής και αλλάζει σε πληρωμή στην παραλαβή', async (t) => {
  const { db, app } = h.setup();
  h.useStripe(t);
  const { agent, booking } = await cardBooking(app, db);
  const form = await agent.get(`/booking/new?${new URLSearchParams(h.searchParams())}`);
  assert.equal(form.status, 200);
  const res = await h.post(agent, '/booking', { ...h.searchParams(), ...h.driver({ payment_method: 'pay_at_pickup' }) });
  assert.equal(res.status, 303);
  assert.equal(bookingsLib.getById(db, booking.id).status, 'cancelled');
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM bookings WHERE status = 'confirmed'`).get().n, 1);
});

test('απλήρωτες κρατήσεις λήγουν, αποδεσμεύουν το αυτοκίνητο και κλείνει η σελίδα πληρωμής', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const { booking } = await cardBooking(app, db);
  db.prepare('UPDATE bookings SET hold_expires_at = ? WHERE id = ?').run(Date.now() - 1, booking.id);
  await runMaintenance(db);
  assert.equal(bookingsLib.getById(db, booking.id).status, 'expired');
  assert.equal(fake.sessions[booking.checkout_id].status, 'expired');
  const res = await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver() });
  assert.equal(res.status, 303);
});

test('ακύρωση κράτησης που πληρώθηκε εκτός συστήματος: καταγράφεται οφειλόμενη επιστροφή', async () => {
  const { db, app } = h.setup();
  const agent = h.agent(app);
  const res = await h.post(agent, '/booking', { ...h.searchParams({ from: 20 }), ...h.driver() });
  const b0 = bookingsLib.getByReference(db, h.bookingRef(res));
  db.prepare(`UPDATE bookings SET payment_status = 'paid', paid_cents = total_cents WHERE id = ?`).run(b0.id);
  const cancel = await h.post(agent, `/booking/${b0.reference}/cancel`, {}, `/booking/${b0.reference}`);
  const page = await agent.get(cancel.headers.location);
  assert.match(page.text, /Θα επικοινωνήσουμε μαζί σας για την επιστροφή/);
  assert.doesNotMatch(page.text, /στην κάρτα σας ξεκίνησε/);
  await h.mailer.flush();
  assert.ok(h.mailer.outbox.some((m) => m.subject.startsWith('Οφείλεται επιστροφή χρημάτων')));
  assert.ok(db.prepare(`SELECT 1 FROM booking_events WHERE booking_id = ? AND action = 'refund_due'`).get(b0.id));

  // Το γραφείο καταγράφει την επιστροφή όταν γίνει.
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  await h.post(aa, `/admin/bookings/${b0.id}/refund-manual`, { amount: (b0.total_cents / 100).toFixed(2), note: 'Τραπεζική μεταφορά' }, `/admin/bookings/${b0.id}`);
  const b = bookingsLib.getById(db, b0.id);
  assert.equal(b.payment_status, 'refunded');
});

test('Revolut: πληρωμή ενοικίασης, έλεγχος υπογραφής webhook και επιστροφή χρημάτων', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useRevolut(t);
  const { agent, res, booking } = await cardBooking(app, db, { from: 25 });
  assert.match(res.headers.location, /^https:\/\/checkout\.revolut\.com\//);
  const order = fake.orders[booking.checkout_id];
  assert.equal(order.body.capture_mode, 'automatic');
  assert.equal(order.body.industry_data.car_rental.booking_id, booking.reference);
  assert.match(order.body.industry_data.car_rental.drop_off_date, /Z$/);

  fake.pay(order.id);
  const body = JSON.stringify({ event: 'ORDER_COMPLETED', order_id: order.id });
  const ts = String(Date.now());
  const sig = `v1=${crypto.createHmac('sha256', 'wsk_test_secret').update(`v1.${ts}.${body}`).digest('hex')}`;
  const badSig = await h.request(app).post('/webhooks/revolut').set('Revolut-Request-Timestamp', ts).set('Revolut-Signature', 'v1=00').set('content-type', 'application/json').send(body);
  assert.equal(badSig.status, 400);
  const ok = await h.request(app).post('/webhooks/revolut').set('Revolut-Request-Timestamp', ts).set('Revolut-Signature', sig).set('content-type', 'application/json').send(body);
  assert.equal(ok.status, 204);
  let b = bookingsLib.getById(db, booking.id);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.payment_provider, 'revolut');

  await h.post(agent, `/booking/${b.reference}/cancel`, {}, `/booking/${b.reference}`);
  b = bookingsLib.getById(db, booking.id);
  assert.equal(b.payment_status, 'refunded');
  assert.deepEqual(fake.refunds.map((r) => r.amount), [b.paid_cents]);
});
