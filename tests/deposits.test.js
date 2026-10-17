'use strict';

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const bookingsLib = require('../src/lib/bookings');
const deposits = require('../src/lib/deposits');
const payments = require('../src/lib/payments');

// Κράτηση με παραλαβή σε 1 ώρα (ώστε να επιτρέπεται η παράδοση) και διαχειριστής.
async function scenario(app, db) {
  const res = await h.post(h.agent(app), '/booking', { ...h.searchParams({ from: 3, days: 3 }), ...h.driver() });
  const ref = h.bookingRef(res);
  const b = bookingsLib.getByReference(db, ref);
  db.prepare('UPDATE bookings SET pickup_at = ? WHERE id = ?').run(h.time.addMinutes(h.time.nowLocal(), 60), b.id);
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  const page = `/admin/bookings/${b.id}`;
  const act = (path, data) => h.post(aa, `${page}${path}`, data, page);
  return { b, aa, page, act };
}

test('εγγύηση μέσω POS: μόνο πιστωτική, απαιτείται για παράδοση, εκκαθάριση με χρεώσεις', async () => {
  const { db, app } = h.setup();
  const { b, act } = await scenario(app, db);

  await act('/deposit/pos', { amount: '300', approval_code: 'A1B2C3' });
  assert.equal(deposits.listForBooking(db, b.id).length, 0, 'χωρίς επιβεβαίωση πιστωτικής κάρτας απορρίπτεται');
  await act('/deposit/pos', { amount: '300', approval_code: 'A1B2C3', last4: '1234', credit_confirmed: '1' });
  assert.equal(deposits.listForBooking(db, b.id).length, 0, 'ποσό μεγαλύτερο από την εγγύηση της κράτησης χωρίς συναίνεση απορρίπτεται');
  await act('/deposit/pos', { amount: '300', approval_code: 'A1B2C3', last4: '1234', credit_confirmed: '1', over_note: 'Υπέγραψε για 300 €' });
  const dep = deposits.heldDeposit(db, b.id);
  assert.equal(dep.method, 'pos');
  assert.equal(dep.amount_cents, 30000);

  await act('/pickup', { pickup_km: '1000', collected_payment: '1' });
  assert.equal(bookingsLib.getById(db, b.id).status, 'active');

  // Χρέωση πριν την επιστροφή δεν επιτρέπεται να εκκαθαριστεί.
  await act(`/deposit/${dep.id}/settle`, { pos_confirmed: '1' });
  assert.equal(deposits.getDeposit(db, dep.id).status, 'held');

  await act('/return', { return_km: '1450' });
  await act('/charges', { category: 'fuel', description: 'Έλλειψη καυσίμου 1/4', amount: '35' });
  const charges = deposits.chargesForBooking(db, b.id);
  assert.equal(charges[0].status, 'accepted');

  // Για POS απαιτείται επιβεβαίωση ότι έγινε η ενέργεια στο τερματικό.
  await act(`/deposit/${dep.id}/settle`, {});
  assert.equal(deposits.getDeposit(db, dep.id).status, 'held');
  await act(`/deposit/${dep.id}/settle`, { pos_confirmed: '1' });
  const settled = deposits.getDeposit(db, dep.id);
  assert.equal(settled.status, 'captured');
  assert.equal(settled.captured_cents, 3500);
  assert.equal(deposits.chargesForBooking(db, b.id)[0].status, 'charged');
  await h.mailer.flush();
  assert.ok(h.mailer.outbox.some((m) => m.subject.includes('εκκαθάριση')));
});

test('online εγγύηση (Stripe): σύνδεσμος/QR, συναίνεση, μόνο πιστωτική, μερική παρακράτηση', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const { b, aa, page, act } = await scenario(app, db);

  await act('/deposit/link', { amount: '250' });
  const adminPage = await aa.get(page);
  assert.match(adminPage.text, /<svg/, 'εμφανίζεται QR code');
  const url = /https:\/\/rent\.example\.gr\/deposit\/([a-f0-9]{64})/.exec(adminPage.text);
  assert.ok(url, 'εμφανίζεται ο σύνδεσμος');
  const token = url[1];

  const customer = h.agent(app);
  const landing = await customer.get(`/deposit/${token}`);
  assert.equal(landing.status, 200);
  assert.match(landing.text, /250,00/);
  // Χωρίς συναίνεση δεν προχωρά.
  const noConsent = await h.post(customer, `/deposit/${token}`, {}, `/deposit/${token}`);
  assert.equal(noConsent.status, 422);
  const go = await h.post(customer, `/deposit/${token}`, { consent: '1' }, `/deposit/${token}`);
  assert.equal(go.status, 303);
  const sessionId = /\/pay\/(cs_\d+)/.exec(go.headers.location)[1];
  const session = fake.sessions[sessionId];
  assert.equal(session.payment_intent_data.capture_method, 'manual');
  assert.deepEqual(session.params.payment_method_types, ['card'], 'μόνο κάρτα, όχι άλλοι τρόποι πληρωμής');
  assert.deepEqual(session.payment_method_options.card.restrictions.funding_types_blocked, ['debit', 'prepaid']);

  // Χρεωστική κάρτα => αυτόματη ακύρωση της δέσμευσης και νέα προσπάθεια.
  const debitPi = fake.pay(sessionId, { funding: 'debit' });
  const back = await customer.get(`/deposit/${token}/return`);
  assert.match(back.text, /δεν είναι πιστωτική/);
  assert.equal(fake.intents[debitPi.id].status, 'canceled');
  assert.equal(deposits.activeDeposit(db, b.id).status, 'awaiting');

  // Πιστωτική κάρτα => δέσμευση.
  const go2 = await h.post(customer, `/deposit/${token}`, { consent: '1' }, `/deposit/${token}`);
  const session2 = /\/pay\/(cs_\d+)/.exec(go2.headers.location)[1];
  const creditPi = fake.pay(session2, { funding: 'credit' });
  await h.request(app).post('/webhooks/stripe').set('stripe-signature', fake.webhookSecret).set('content-type', 'application/json').send(fake.event('checkout.session.completed', { id: session2 }));
  const dep = deposits.heldDeposit(db, b.id);
  assert.ok(dep);
  assert.equal(dep.hold_ref, creditPi.id);
  assert.equal(dep.funding, 'credit');
  assert.ok(dep.capture_deadline_ms > Date.now());

  await act('/pickup', { pickup_km: '500', collected_payment: '1' });
  await act('/return', { return_km: '800' });
  await act('/charges', { category: 'late_return', description: 'Καθυστέρηση 3 ωρών (1 επιπλέον ημέρα)', amount: '45' });
  await act(`/deposit/${dep.id}/settle`, {});
  const settled = deposits.getDeposit(db, dep.id);
  assert.equal(settled.status, 'captured');
  assert.equal(fake.intents[creditPi.id].amount_received, 4500);
  assert.equal(fake.intents[creditPi.id].status, 'succeeded');
});

test('ζημιά: χρέωση μόνο με συναίνεση του πελάτη, δυνατότητα αμφισβήτησης', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useRevolut(t);
  const { b, act } = await scenario(app, db);

  // Online εγγύηση μέσω Revolut (προέγκριση).
  const link = await deposits.createOnlineLink(db, b.id, { amountCents: 25000, actor: 'test' });
  const url = await deposits.startOnlineHold(db, link.token);
  const orderId = /payment-link\/(ord_\d+)/.exec(url)[1];
  const order = fake.orders[orderId];
  assert.equal(order.body.authorisation_type, 'pre_authorisation');
  assert.equal(order.body.capture_mode, 'manual');
  assert.match(order.body.cancel_authorised_after, /^P\d+D$/);
  fake.pay(orderId, { funding: 'credit' });
  await payments.reconcileCheckout(db, orderId);
  const dep = deposits.heldDeposit(db, b.id);
  assert.ok(dep);

  await act('/pickup', { pickup_km: '100', collected_payment: '1' });
  await act('/return', { return_km: '300' });
  // Ζημιά χωρίς τεκμηρίωση απορρίπτεται.
  await act('/charges', { category: 'damage', description: 'Γρατζουνιά πίσω προφυλακτήρα', amount: '180' });
  assert.equal(deposits.chargesForBooking(db, b.id).length, 0);
  await act('/charges', { category: 'damage', description: 'Γρατζουνιά πίσω προφυλακτήρα', amount: '180', evidence: 'Πρακτικό επιστροφής 77, 3 φωτογραφίες, εκτίμηση συνεργείου' });
  const charge = deposits.chargesForBooking(db, b.id)[0];
  assert.equal(charge.status, 'proposed');
  await h.mailer.flush();
  assert.ok(h.mailer.outbox.some((m) => m.subject.startsWith('Χρέωση για αποδοχή')));

  // Εκκαθάριση με εκκρεμή ζημιά: δεν επιτρέπεται χωρίς ρητή επιλογή.
  await act(`/deposit/${dep.id}/settle`, {});
  assert.equal(deposits.getDeposit(db, dep.id).status, 'held');

  // Ο πελάτης την αμφισβητεί από τη σελίδα της κράτησης.
  const customer = h.agent(app);
  await h.post(customer, '/manage', { reference: b.reference, email: b.email }, '/manage');
  await h.post(customer, `/booking/${b.reference}/charges/${charge.id}/respond`, { decision: 'dispute', note: 'Η γρατζουνιά υπήρχε στην παραλαβή' }, `/booking/${b.reference}`);
  assert.equal(deposits.getCharge(db, b.id, charge.id).status, 'disputed');

  // Το γραφείο κλείνει την εγγύηση χωρίς την αμφισβητούμενη χρέωση => πλήρης αποδέσμευση.
  await act(`/deposit/${dep.id}/settle`, { force: '1' });
  assert.equal(deposits.getDeposit(db, dep.id).status, 'released');
  assert.equal(fake.orders[orderId].state, 'cancelled');
});

test('ζημιά που αποδέχεται ο πελάτης online αφαιρείται από την εγγύηση', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useRevolut(t);
  const { b, act } = await scenario(app, db);
  const link = await deposits.createOnlineLink(db, b.id, { amountCents: 25000, actor: 'test' });
  const orderId = /payment-link\/(ord_\d+)/.exec(await deposits.startOnlineHold(db, link.token))[1];
  fake.pay(orderId);
  await payments.reconcileCheckout(db, orderId);
  const dep = deposits.heldDeposit(db, b.id);
  await act('/pickup', { pickup_km: '100', collected_payment: '1' });
  await act('/return', { return_km: '300' });
  // Πάνω από την απαλλαγή (250€) μόνο με αναφορά σε εξαίρεση των όρων.
  await act('/charges', { category: 'damage', description: 'Σπασμένος καθρέπτης', amount: '420', evidence: 'Πρακτικό 12, τιμολόγιο ανταλλακτικού' });
  assert.equal(deposits.chargesForBooking(db, b.id).length, 0);
  await act('/charges', {
    category: 'damage',
    description: 'Σπασμένος καθρέπτης',
    amount: '420',
    evidence: 'Πρακτικό 12, τιμολόγιο ανταλλακτικού',
    beyond_excess: 'Οδήγηση υπό την επήρεια αλκοόλ (§7)',
  });
  const charge = deposits.chargesForBooking(db, b.id)[0];
  assert.match(charge.evidence, /Πέραν της απαλλαγής/);

  const customer = h.agent(app);
  await h.post(customer, '/manage', { reference: b.reference, email: b.email }, '/manage');
  // Χωρίς ρητή επιβεβαίωση δεν καταγράφεται αποδοχή.
  await h.post(customer, `/booking/${b.reference}/charges/${charge.id}/respond`, { decision: 'accept' }, `/booking/${b.reference}`);
  assert.equal(deposits.getCharge(db, b.id, charge.id).status, 'proposed');
  await h.post(customer, `/booking/${b.reference}/charges/${charge.id}/respond`, { decision: 'accept', confirm: '1' }, `/booking/${b.reference}`);
  assert.equal(deposits.getCharge(db, b.id, charge.id).status, 'accepted');

  // Η ζημιά (420€) ξεπερνά την εγγύηση (250€): παρακρατούνται 250€, μένουν 170€ προς πληρωμή.
  await act(`/deposit/${dep.id}/settle`, {});
  assert.equal(fake.orders[orderId].captured, 25000);
  assert.equal(deposits.outstandingCents(db, b.id), 17000);
  const page = await customer.get(`/booking/${b.reference}`);
  assert.match(page.text, /Πληρωμή 170,00/);
  const pay = await h.post(customer, `/booking/${b.reference}/charges/pay`, {}, `/booking/${b.reference}`);
  const payOrder = /payment-link\/(ord_\d+)/.exec(pay.headers.location)[1];
  assert.equal(fake.orders[payOrder].amount, 17000);
  fake.pay(payOrder);
  await customer.get(`/booking/${b.reference}/payment/return`);
  assert.equal(deposits.outstandingCents(db, b.id), 0);
  assert.equal(deposits.getCharge(db, b.id, charge.id).status, 'charged');
});

test('ακύρωση κράτησης αποδεσμεύει αυτόματα την online εγγύηση', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useRevolut(t);
  const { b, act } = await scenario(app, db);
  const link = await deposits.createOnlineLink(db, b.id, { amountCents: 25000, actor: 'test' });
  const orderId = /payment-link\/(ord_\d+)/.exec(await deposits.startOnlineHold(db, link.token))[1];
  fake.pay(orderId);
  await payments.reconcileCheckout(db, orderId);
  await act('/cancel', { reason: 'Ο πελάτης δεν ήρθε' });
  assert.equal(bookingsLib.getById(db, b.id).status, 'cancelled');
  assert.equal(fake.orders[orderId].state, 'cancelled');
  assert.equal(deposits.listForBooking(db, b.id)[0].status, 'released');
});

test('αυτόματη αποδέσμευση online εγγύησης μετά την επιστροφή χωρίς χρεώσεις', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useRevolut(t);
  const { b, act } = await scenario(app, db);
  const link = await deposits.createOnlineLink(db, b.id, { amountCents: 25000, actor: 'test' });
  const orderId = /payment-link\/(ord_\d+)/.exec(await deposits.startOnlineHold(db, link.token))[1];
  fake.pay(orderId);
  await payments.reconcileCheckout(db, orderId);
  await act('/pickup', { pickup_km: '100', collected_payment: '1' });
  await act('/return', { return_km: '300' });
  assert.equal(await deposits.autoRelease(db), 0, 'όχι αμέσως');
  db.prepare(`UPDATE booking_events SET created_at = datetime('now', '-3 days') WHERE booking_id = ? AND action = 'returned'`).run(b.id);
  assert.equal(await deposits.autoRelease(db), 1);
  assert.equal(fake.orders[orderId].state, 'cancelled');
});
