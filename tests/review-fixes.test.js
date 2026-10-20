'use strict';

// Σενάρια από τον έλεγχο του κώδικα πληρωμών/εγγυήσεων: κάθε test αναπαράγει ένα πρόβλημα
// που βρέθηκε και επιβεβαιώνει τη διόρθωση.

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const bookingsLib = require('../src/lib/bookings');
const deposits = require('../src/lib/deposits');
const payments = require('../src/lib/payments');
const { runMaintenance } = require('../src/lib/maintenance');

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

// Online εγγύηση Revolut δεσμευμένη, αυτοκίνητο παραδόθηκε και επιστράφηκε.
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

test('σύλληψη που έγινε αλλά χάθηκε η απάντηση: εφαρμόζεται στις χρεώσεις, όχι διπλή πληρωμή', async (t) => {
  const { db, fake, orderId, dep, b, act } = await returnedWithHold(t, {
    charge: { category: 'fuel', description: 'Καύσιμο', amount: '50' },
  });
  const original = fake.client.captureOrder;
  fake.client.captureOrder = async (...args) => {
    await original(...args);
    throw new Error('socket hang up');
  };
  await act(`/deposit/${dep.id}/settle`, {});
  const settled = deposits.getDeposit(db, dep.id);
  assert.equal(settled.status, 'captured');
  assert.equal(settled.captured_cents, 5000);
  assert.equal(fake.orders[orderId].captured, 5000);
  assert.equal(deposits.outstandingCents(db, b.id), 0, 'ο πελάτης δεν καλείται να πληρώσει ξανά');
  assert.equal(deposits.chargesForBooking(db, b.id)[0].status, 'charged');
});

test('σύλληψη που βλέπει μόνο ο συγχρονισμός (webhook/maintenance) εφαρμόζεται μία φορά', async (t) => {
  const { db, fake, orderId, dep, b } = await returnedWithHold(t, {
    charge: { category: 'fuel', description: 'Καύσιμο', amount: '50' },
  });
  // Η εκκαθάριση ξεκίνησε (καταγράφηκε το ποσό) αλλά ο server έπεσε πριν την απάντηση.
  db.prepare(`UPDATE deposits SET settling_at = datetime('now'), capture_requested_cents = 5000 WHERE id = ?`).run(dep.id);
  await fake.client.captureOrder(orderId, 5000);
  await deposits.syncHold(db, dep.id);
  await deposits.syncHold(db, dep.id);
  assert.equal(deposits.getDeposit(db, dep.id).status, 'captured');
  assert.equal(deposits.outstandingCents(db, b.id), 0);
  assert.equal(deposits.chargesForBooking(db, b.id)[0].paid_cents, 5000);
});

test('διπλή ταυτόχρονη εκκαθάριση: μία σύλληψη, σωστά ποσά', async (t) => {
  const { db, fake, orderId, dep, b } = await returnedWithHold(t, {
    charge: { category: 'damage', description: 'Ζημιά', amount: '200', evidence: 'Πρακτικό 5', customer_consent: 'Υπέγραψε το πρακτικό 5' },
  });
  await deposits.addCharge(db, b.id, { category: 'fuel', description: 'Καύσιμο', amountCents: 12000, actor: 'test' });
  const results = await Promise.allSettled([
    deposits.settleDeposit(db, dep.id, { actor: 'a' }),
    deposits.settleDeposit(db, dep.id, { actor: 'b' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(results.find((r) => r.status === 'rejected').reason.message, /εκκαθαρίζεται ήδη|έχει κλείσει/);
  assert.equal(fake.orders[orderId].captured, 25000);
  // 320€ χρεώσεις, 250€ από την εγγύηση: μένουν 70€.
  assert.equal(deposits.outstandingCents(db, b.id), 7000);
  const paid = deposits.chargesForBooking(db, b.id).reduce((s, c) => s + c.paid_cents, 0);
  assert.equal(paid, 25000);
});

test('ακύρωση με αποτυχία αποδέσμευσης: ειδοποίηση, εμφάνιση στον πίνακα, αυτόματη επανάληψη', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useRevolut(t);
  const { b, act } = await scenario(app, db);
  const link = await deposits.createOnlineLink(db, b.id, { amountCents: 25000, actor: 'test' });
  const orderId = /payment-link\/(ord_\d+)/.exec(await deposits.startOnlineHold(db, link.token))[1];
  fake.pay(orderId);
  await payments.reconcileCheckout(db, orderId);
  const dep = deposits.heldDeposit(db, b.id);

  const original = fake.client.cancelOrder;
  fake.client.cancelOrder = async () => {
    throw new Error('Revolut 503');
  };
  await act('/cancel', { reason: 'Αλλαγή σχεδίων' });
  assert.equal(bookingsLib.getById(db, b.id).status, 'cancelled');
  assert.equal(deposits.getDeposit(db, dep.id).status, 'held');
  await h.mailer.flush();
  assert.ok(h.mailer.outbox.some((m) => m.subject === 'Αποτυχία αποδέσμευσης εγγύησης'));
  const attention = deposits.attentionList(db).deposits.find((d) => d.id === dep.id);
  assert.ok(attention && attention.notes.some((n) => /ακυρώθηκε/.test(n)));

  fake.client.cancelOrder = original;
  await runMaintenance(db, { force: true });
  assert.equal(deposits.getDeposit(db, dep.id).status, 'released');
  assert.equal(fake.orders[orderId].state, 'cancelled');
});

test('αποδέσμευση που έγινε αλλά χάθηκε η απάντηση καταγράφεται ως αποδέσμευση (όχι «έληξε»)', async (t) => {
  const { db, fake, dep } = await returnedWithHold(t);
  const original = fake.client.cancelOrder;
  fake.client.cancelOrder = async (...args) => {
    await original(...args);
    throw new Error('timeout');
  };
  await deposits.releaseDeposit(db, dep.id, { actor: 'test' });
  const after = deposits.getDeposit(db, dep.id);
  assert.equal(after.status, 'released');
  await h.mailer.flush();
  assert.ok(!h.mailer.outbox.some((m) => m.subject === 'Η δέσμευση εγγύησης έληξε'));
});

test('«άλλη» χρέωση χρειάζεται αποδοχή, ο τιμοκατάλογος έχει όριο, ο πελάτης ενημερώνεται', async (t) => {
  const { db, b, act } = await returnedWithHold(t);
  await act('/charges', { category: 'other', description: 'Χαμένο καλώδιο φόρτισης', amount: '30' });
  const [other] = deposits.chargesForBooking(db, b.id);
  assert.equal(other.status, 'proposed');
  await act('/charges', { category: 'cleaning', description: 'Καθαρισμός', amount: '80' });
  assert.equal(deposits.chargesForBooking(db, b.id).length, 1, 'πάνω από τον τιμοκατάλογο (50€) απορρίπτεται');
  await act('/charges', { category: 'cleaning', description: 'Καθαρισμός άμμου', amount: '50' });
  assert.equal(deposits.chargesForBooking(db, b.id)[1].status, 'accepted');
  await h.mailer.flush();
  assert.ok(h.mailer.outbox.some((m) => m.subject.startsWith('Χρέωση μετά την επιστροφή')));
});

test('ο διαχειριστής δεν μπορεί να δώσει «online αποδοχή» για λογαριασμό του πελάτη', async (t) => {
  const { db, b, aa, act } = await returnedWithHold(t);
  await act('/charges', { category: 'damage', description: 'Γρατζουνιά', amount: '100', evidence: 'Πρακτικό 9' });
  const [charge] = deposits.chargesForBooking(db, b.id);
  await h.post(aa, `/booking/${b.reference}/charges/${charge.id}/respond`, { decision: 'accept', confirm: '1' }, `/booking/${b.reference}`);
  assert.equal(deposits.getCharge(db, b.id, charge.id).status, 'proposed');
});

test('αχρησιμοποίητος σύνδεσμος εγγύησης δεν εμποδίζει την πληρωμή χρεώσεων μετά την επιστροφή', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useRevolut(t);
  const { b, act } = await scenario(app, db);
  await deposits.createOnlineLink(db, b.id, { amountCents: 25000, actor: 'test' });
  await act('/pickup', { pickup_km: '100', collected_payment: '1', no_deposit: '1' });
  await act('/return', { return_km: '300' });
  assert.equal(deposits.activeDeposit(db, b.id), null, 'ο σύνδεσμος ακυρώθηκε στην επιστροφή');
  await act('/charges', { category: 'fuel', description: 'Καύσιμο', amount: '40' });
  const customer = h.agent(app);
  await h.post(customer, '/manage', { reference: b.reference, email: b.email }, '/manage');
  const pay = await h.post(customer, `/booking/${b.reference}/charges/pay`, {}, `/booking/${b.reference}`);
  const orderId = /payment-link\/(ord_\d+)/.exec(pay.headers.location)[1];
  assert.equal(fake.orders[orderId].amount, 4000);
});

test('σελίδα εγγύησης μετά από απόρριψη κάρτας: η νέα προσπάθεια στέλνεται στη σωστή διεύθυνση', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const { b } = await scenario(app, db);
  const link = await deposits.createOnlineLink(db, b.id, { amountCents: 25000, actor: 'test' });
  const url = await deposits.startOnlineHold(db, link.token);
  fake.pay(/\/pay\/(cs_\d+)/.exec(url)[1], { funding: 'debit' });
  const customer = h.agent(app);
  const back = await customer.get(`/deposit/${link.token}/return`);
  assert.match(back.text, new RegExp(`action="/deposit/${link.token}"`));
  const retry = await h.post(customer, `/deposit/${link.token}`, { consent: '1' }, `/deposit/${link.token}/return`);
  assert.equal(retry.status, 303);
});

test('CSP επιτρέπει την ανακατεύθυνση στο Revolut· άγνωστος πάροχος webhook => 404', async () => {
  const { app } = h.setup();
  const res = await h.request(app).get('/');
  assert.match(res.headers['content-security-policy'], /form-action[^;]*https:\/\/checkout\.revolut\.com/);
  for (const name of ['constructor', 'toString', '__proto__', 'paypal']) {
    const r = await h.request(app).post(`/webhooks/${name}`).send('{}');
    assert.equal(r.status, 404, name);
  }
});

test('επιστροφή χρημάτων που έγινε αλλά χάθηκε η απάντηση: δεν επαναλαμβάνεται', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const agent = h.agent(app);
  await h.post(agent, '/booking', { ...h.searchParams({ from: 20 }), ...h.driver({ payment_method: 'card' }) });
  const booking = bookingsLib.getById(db, db.prepare('SELECT id FROM bookings ORDER BY id DESC LIMIT 1').get().id);
  fake.pay(booking.checkout_id);
  await agent.get(`/booking/${booking.reference}/payment/return?session_id=${booking.checkout_id}`);

  const original = fake.client.refunds.create;
  let calls = 0;
  fake.client.refunds.create = async (...args) => {
    calls += 1;
    await original(...args);
    if (calls === 1) throw new Error('ECONNRESET');
    throw new Error('δεν έπρεπε να ξανακληθεί');
  };
  await h.post(agent, `/booking/${booking.reference}/cancel`, {}, `/booking/${booking.reference}`);
  await runMaintenance(db, { force: true });
  const b = bookingsLib.getById(db, booking.id);
  assert.equal(fake.refunds.length, 1);
  assert.equal(calls, 1);
  assert.equal(b.refunded_cents, b.paid_cents);
});

test('επιστροφή που ο πάροχος δέχτηκε αλλά απέτυχε αργότερα: αναιρείται και ειδοποιείται το γραφείο', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const agent = h.agent(app);
  await h.post(agent, '/booking', { ...h.searchParams({ from: 20 }), ...h.driver({ payment_method: 'card' }) });
  const booking = bookingsLib.getById(db, db.prepare('SELECT id FROM bookings ORDER BY id DESC LIMIT 1').get().id);
  fake.pay(booking.checkout_id);
  await agent.get(`/booking/${booking.reference}/payment/return?session_id=${booking.checkout_id}`);
  const original = fake.client.refunds.create;
  fake.client.refunds.create = async (...args) => ({ ...(await original(...args)), status: 'pending' });
  await h.post(agent, `/booking/${booking.reference}/cancel`, {}, `/booking/${booking.reference}`);
  assert.equal(bookingsLib.getById(db, booking.id).refunded_cents, booking.total_cents);

  fake.refunds[0].status = 'failed';
  fake.refunds[0].failure_reason = 'expired_or_canceled_card';
  await payments.checkProviderRefunds(db);
  const b = bookingsLib.getById(db, booking.id);
  assert.equal(b.refunded_cents, 0);
  assert.equal(db.prepare('SELECT status FROM refunds WHERE booking_id = ?').get(b.id).status, 'failed');
  await h.mailer.flush();
  assert.ok(h.mailer.outbox.some((m) => m.subject.startsWith('ΑΠΟΤΥΧΙΑ επιστροφής')));
});

test('παραλαβή μετά από μερική επιστροφή: δεν ζητείται ξανά πληρωμή', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const agent = h.agent(app);
  await h.post(agent, '/booking', { ...h.searchParams({ from: 3 }), ...h.driver({ payment_method: 'card' }) });
  const booking = bookingsLib.getById(db, db.prepare('SELECT id FROM bookings ORDER BY id DESC LIMIT 1').get().id);
  fake.pay(booking.checkout_id);
  await agent.get(`/booking/${booking.reference}/payment/return?session_id=${booking.checkout_id}`);
  await payments.refundBookingAmount(db, booking.id, 1000, { actor: 'test', reason: 'Έκπτωση' });
  db.prepare('UPDATE bookings SET pickup_at = ? WHERE id = ?').run(h.time.addMinutes(h.time.nowLocal(), 60), booking.id);
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  const page = `/admin/bookings/${booking.id}`;
  await h.post(aa, `${page}/pickup`, { pickup_km: '10', no_deposit: '1' }, page);
  const b = bookingsLib.getById(db, booking.id);
  assert.equal(b.status, 'active');
  assert.equal(b.payment_status, 'partially_refunded');
  assert.equal(b.paid_cents, booking.total_cents);
});
