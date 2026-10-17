'use strict';

// Δεύτερος γύρος ελέγχου: κάθε test αναπαράγει ένα πρόβλημα που βρέθηκε και επιβεβαιώνει τη διόρθωση.

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const bookingsLib = require('../src/lib/bookings');
const deposits = require('../src/lib/deposits');
const payments = require('../src/lib/payments');
const fiscal = require('../src/lib/fiscal');
const format = require('../src/lib/format');

async function scenario(app, db) {
  const res = await h.post(h.agent(app), '/booking', { ...h.searchParams({ from: 3, days: 3 }), ...h.driver() });
  const b = bookingsLib.getByReference(db, h.bookingRef(res));
  db.prepare('UPDATE bookings SET pickup_at = ? WHERE id = ?').run(h.time.addMinutes(h.time.nowLocal(), 60), b.id);
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  const page = `/admin/bookings/${b.id}`;
  const act = (path, data) => h.post(aa, `${page}${path}`, data, page);
  return { b, aa, page, act };
}

async function returnedWithHold(t, { charge = null } = {}) {
  const { db, app } = h.setup();
  const fake = h.useRevolut(t);
  const ctx = await scenario(app, db);
  const link = await deposits.createOnlineLink(db, ctx.b.id, { amountCents: 25000, actor: 'test' });
  const orderId = /payment-link\/(ord_\d+)/.exec(await deposits.startOnlineHold(db, link.token))[1];
  fake.pay(orderId);
  await payments.reconcileCheckout(db, orderId);
  const dep = deposits.heldDeposit(db, ctx.b.id);
  await ctx.act('/pickup', { pickup_km: '100', collected_payment: '1' });
  await ctx.act('/return', { return_km: '300' });
  if (charge) await ctx.act('/charges', charge);
  return { db, app, fake, orderId, dep, ...ctx };
}

async function paidCardBooking(t, app, db, opts = {}) {
  const fake = h.useStripe(t);
  const agent = h.agent(app);
  await h.post(agent, '/booking', { ...h.searchParams({ from: 20, ...opts }), ...h.driver({ payment_method: 'card' }) });
  const created = db.prepare('SELECT * FROM bookings ORDER BY id DESC LIMIT 1').get();
  fake.pay(created.checkout_id);
  await agent.get(`/booking/${created.reference}/payment/return?session_id=${created.checkout_id}`);
  return { fake, agent, booking: bookingsLib.getById(db, created.id) };
}

const FUEL = { category: 'fuel', description: 'Καύσιμο', amount: '50' };

test('σύλληψη εγγύησης με άγνωστο ποσό (π.χ. από τον πίνακα του παρόχου): ποτέ «αποδέσμευση», ο πελάτης δεν πληρώνει ξανά', async (t) => {
  const { db, app, fake, orderId, dep, b } = await returnedWithHold(t, { charge: FUEL });
  await fake.client.captureOrder(orderId, 5000);
  await deposits.syncHold(db, dep.id);
  const d = deposits.getDeposit(db, dep.id);
  assert.equal(d.status, 'captured');
  const attention = deposits.attentionList(db).deposits.find((x) => x.id === dep.id);
  assert.ok(attention && attention.notes.some((n) => /άγνωστο ποσό/.test(n)));
  const customer = h.agent(app);
  await h.post(customer, '/manage', { reference: b.reference, email: b.email }, '/manage');
  const page = await customer.get(`/booking/${b.reference}`);
  assert.doesNotMatch(page.text, /charges\/pay/, 'δεν εμφανίζεται κουμπί πληρωμής');
  const pay = await h.post(customer, `/booking/${b.reference}/charges/pay`, {}, '/contact');
  assert.doesNotMatch(pay.headers.location || '', /revolut/, 'δεν ανοίγει σελίδα πληρωμής');
});

test('συγχρονισμός που ξεκίνησε πριν από εκκαθάριση δεν καταγράφει τη σύλληψη ως αποδέσμευση', async (t) => {
  const { db, fake, orderId, dep, b } = await returnedWithHold(t, { charge: FUEL });
  let openGetOrder;
  const getOrderGate = new Promise((r) => (openGetOrder = r));
  let openCapture;
  const captureGate = new Promise((r) => (openCapture = r));
  const getOrder = fake.client.getOrder;
  let first = true;
  fake.client.getOrder = async (id) => {
    if (first) {
      first = false;
      await getOrderGate;
    }
    return getOrder(id);
  };
  const capture = fake.client.captureOrder;
  fake.client.captureOrder = async (...args) => {
    const r = await capture(...args);
    await captureGate;
    return r;
  };
  const sync = deposits.syncHold(db, dep.id);
  const settle = deposits.settleDeposit(db, dep.id, { actor: 'admin' });
  await new Promise((r) => setImmediate(r));
  openGetOrder();
  await sync;
  openCapture();
  await settle;
  const d = deposits.getDeposit(db, dep.id);
  assert.equal(fake.orders[orderId].captured, 5000);
  assert.equal(d.status, 'captured');
  assert.equal(d.captured_cents, 5000);
  assert.equal(deposits.outstandingCents(db, b.id), 0);
});

test('επιστροφή που αποτυγχάνει αργότερα: το πιστωτικό αναιρείται, νέα προσπάθεια => ένα πιστωτικό', async (t) => {
  const { db, app } = h.setup();
  const { fake, agent, booking } = await paidCardBooking(t, app, db);
  const create = fake.client.refunds.create;
  fake.client.refunds.create = async (...args) => ({ ...(await create(...args)), status: 'pending' });
  await h.post(agent, `/booking/${booking.reference}/cancel`, {}, `/booking/${booking.reference}`);
  assert.equal(fiscal.forBooking(db, booking.id).filter((d) => d.kind === 'credit').length, 1);
  fake.refunds[0].status = 'failed';
  fake.refunds[0].amount = 0; // ο ψεύτικος πάροχος επιτρέπει νέα επιστροφή
  await payments.checkProviderRefunds(db);
  assert.equal(fiscal.forBooking(db, booking.id).filter((d) => d.kind === 'credit').length, 0);
  fake.client.refunds.create = create;
  const rid = db.prepare('SELECT id FROM refunds WHERE booking_id = ?').get(booking.id).id;
  db.prepare(`UPDATE refunds SET status = 'pending' WHERE id = ?`).run(rid);
  assert.equal(await payments.processRefund(db, rid), true);
  assert.equal(fiscal.forBooking(db, booking.id).filter((d) => d.kind === 'credit').length, 1);
});

test('επιστροφή που ο πάροχος απορρίπτει αμέσως δεν καταγράφεται ως επιτυχής', async (t) => {
  const { db, app } = h.setup();
  const { fake, booking } = await paidCardBooking(t, app, db);
  const create = fake.client.refunds.create;
  fake.client.refunds.create = async (...args) => ({ ...(await create(...args)), status: 'failed' });
  await payments.refundBookingAmount(db, booking.id, 1000, { actor: 'test', reason: 'Έκπτωση' }).catch(() => null);
  const b = bookingsLib.getById(db, booking.id);
  assert.equal(b.refunded_cents, 0);
  const row = db.prepare('SELECT * FROM refunds WHERE booking_id = ?').get(booking.id);
  assert.equal(row.status, 'pending');
  assert.equal(row.attempts, 1);
});

test('καθυστερημένη ακύρωση με επιστροφή σε εκκρεμότητα: η χρέωση ακύρωσης παρακρατείται', async (t) => {
  const { db, app } = h.setup();
  const { fake, agent, booking } = await paidCardBooking(t, app, db, { from: 1 });
  // Μια επιστροφή 20€ κολλάει (προσωρινό σφάλμα του παρόχου).
  fake.state.failRefunds = 1;
  await payments.refundBookingAmount(db, booking.id, 2000, { actor: 'test', reason: 'Έκπτωση' }).catch(() => null);
  assert.equal(payments.pendingRefundCents(db, booking.id), 2000);
  const fee = booking.late_cancel_fee_cents;
  assert.ok(fee > 0);
  const page = await agent.get(`/booking/${booking.reference}`);
  assert.match(page.text, new RegExp(format.money(fee).replace(/\s/g, '\\s')));
  await h.post(agent, `/booking/${booking.reference}/cancel`, { accept_fee: '1' }, `/booking/${booking.reference}`);
  const { runMaintenance } = require('../src/lib/maintenance');
  await runMaintenance(db, { force: true });
  const b = bookingsLib.getById(db, booking.id);
  assert.equal(b.status, 'cancelled');
  assert.equal(b.paid_cents - b.refunded_cents, fee, 'κρατήθηκε ακριβώς η χρέωση ακύρωσης');
});

test('λήψη δεδομένων: δεν περιλαμβάνει μηνύματα άλλων με το ίδιο email', async () => {
  const { db, app } = h.setup();
  await h.post(h.agent(app), '/contact', { name: 'Θύμα', email: 'victim@example.com', phone: '6900000001', subject: 'Παράπονο', body: 'Προσωπικό μήνυμα με στοιχεία.', kind: 'complaint' });
  const agent = h.agent(app);
  await h.post(agent, '/register', { first_name: 'Χ', last_name: 'Ψ', email: 'victim@example.com', password: 'Password123', password_confirm: 'Password123' }, '/register');
  await h.post(agent, '/contact', { name: 'Χ', email: 'victim@example.com', subject: 'Δικό μου', body: 'Μήνυμα από τον λογαριασμό μου.' });
  const data = JSON.parse((await agent.get('/account/export')).text);
  assert.deepEqual(data.messages.map((m) => m.subject), ['Δικό μου']);
  assert.ok(db.prepare('SELECT 1 FROM messages WHERE subject = ?').get('Παράπονο'));
});

test('πληρωμή στην παραλαβή: καμία χρέωση ακύρωσης στην εκτύπωση και στο email· επαναποστολή με τους όρους', async () => {
  const { db, app } = h.setup();
  const res = await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver() });
  const b = bookingsLib.getByReference(db, h.bookingRef(res));
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  const print = await aa.get(`/booking/${b.reference}/print`);
  assert.match(print.text, /δεν οφείλεται χρέωση/);
  await h.mailer.flush();
  h.mailer.outbox.length = 0;
  await h.post(aa, `/admin/bookings/${b.id}/resend`, {}, `/admin/bookings/${b.id}`);
  await new Promise((r) => setTimeout(r, 50));
  await h.mailer.flush();
  const mail = h.mailer.outbox.find((m) => m.subject.startsWith('Επιβεβαίωση κράτησης'));
  assert.ok(mail);
  assert.equal(mail.attachments.length, 1);
  assert.match(mail.html, /Επισυνάπτονται οι όροι/);
  assert.match(mail.html, /δεν οφείλεται χρέωση/);
});

test('διαγραφή λογαριασμού: διαγράφονται και τα στοιχεία παιδιού· μη εμφάνιση δεν μπλοκάρει τη διαγραφή', async () => {
  const { db, app } = h.setup();
  const agent = h.agent(app);
  await h.post(agent, '/register', { first_name: 'Α', last_name: 'Β', email: 'parent@example.com', password: 'Password123', password_confirm: 'Password123' }, '/register');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get('parent@example.com');
  const seat = db.prepare(`SELECT id FROM extras WHERE kind = 'child_seat' LIMIT 1`).get().id;
  await h.post(agent, '/booking', { ...h.searchParams(), ...h.driver({ email: 'parent@example.com', [`extra_${seat}`]: '1', child_info: 'Μαρία 3 ετών 15 κιλά' }) });
  await h.post(agent, '/booking', { ...h.searchParams({ car: 2 }), ...h.driver({ email: 'parent@example.com' }) });
  const [b1, b2] = db.prepare('SELECT id FROM bookings WHERE user_id = ? ORDER BY id').all(user.id).map((r) => r.id);
  assert.equal(bookingsLib.getById(db, b1).child_info, 'Μαρία 3 ετών 15 κιλά');
  db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(b1);
  // Η δεύτερη: επιβεβαιωμένη αλλά δεν παραλήφθηκε ποτέ και η ημερομηνία επιστροφής πέρασε.
  db.prepare(`UPDATE bookings SET pickup_at = '2025-01-01T10:00', return_at = '2025-01-04T10:00' WHERE id = ?`).run(b2);
  await h.post(agent, '/account/delete', { current_password: 'Password123' }, '/account');
  assert.ok(!db.prepare('SELECT 1 FROM users WHERE id = ?').get(user.id));
  assert.equal(bookingsLib.getById(db, b1).child_info, null);
});
