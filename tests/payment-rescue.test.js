'use strict';

// Διάσωση πληρωμών με κάρτα που δεν ολοκληρώθηκαν (src/lib/payment-rescue.js):
//  - «Πληρωμή κατά την παραλαβή» σε κράτηση που περιμένει πληρωμή, και πληρωμή με κάρτα που
//    ολοκληρώνεται αργότερα (webhook ή περιοδικός συγχρονισμός): καταγράφεται, δεν επιστρέφεται.
//  - Email «Η κράτησή σας δεν έχει ολοκληρωθεί» μία φορά.
//  - «Κάντε νέα αναζήτηση» με την ίδια αναζήτηση.

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const config = require('../src/config');
const format = require('../src/lib/format');
const bookingsLib = require('../src/lib/bookings');
const rescue = require('../src/lib/payment-rescue');
const { runMaintenance } = require('../src/lib/maintenance');

async function cardBooking(app, db, opts = {}) {
  const agent = h.agent(app);
  const res = await h.post(agent, '/booking', { ...h.searchParams(opts), ...h.driver({ payment_method: 'card', ...(opts.driver || {}) }) });
  assert.equal(res.status, 303, res.text && res.text.slice(0, 300));
  const b = db.prepare('SELECT id FROM bookings ORDER BY id DESC LIMIT 1').get();
  return { agent, res, booking: bookingsLib.getById(db, b.id) };
}

function stripeWebhook(app, fake, type, object) {
  return h.request(app).post('/webhooks/stripe').set('stripe-signature', fake.webhookSecret).set('content-type', 'application/json').send(fake.event(type, object));
}

// Τα emails επιβεβαίωσης στέλνονται αφού δημιουργηθούν τα συνημμένα των όρων: περιμένουμε να «φτάσουν».
async function settleMail() {
  for (let i = 0; i < 5; i += 1) {
    await h.mailer.flush();
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await h.mailer.flush();
}

const mails = (prefix) => h.mailer.outbox.filter((m) => m.subject.startsWith(prefix));

// Η κράτηση «δημιουργήθηκε» πριν από `minutes` λεπτά (για την υπενθύμιση).
function ageBooking(db, id, minutes) {
  db.prepare(`UPDATE bookings SET created_at = datetime('now', ?) WHERE id = ?`).run(`-${minutes} minutes`, id);
}

test('«Πληρωμή κατά την παραλαβή» σε κράτηση που περιμένει πληρωμή: κλείνει τη σελίδα πληρωμής και επιβεβαιώνει την κράτηση', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const { agent, booking } = await cardBooking(app, db);
  const session = booking.checkout_id;

  // Η πληρωμή δεν ολοκληρώθηκε (π.χ. η κάρτα απορρίφθηκε): ο πελάτης γυρίζει από τη σελίδα του παρόχου.
  const back = await agent.get(`/booking/${booking.reference}/payment/cancel`);
  assert.equal(back.status, 303);
  const page = await agent.get(`/booking/${booking.reference}`);
  assert.match(page.text, /να επιλέξετε πληρωμή κατά την παραλαβή/);
  assert.match(page.text, new RegExp(`action="/booking/${booking.reference}/pay"`));
  assert.match(page.text, new RegExp(`action="/booking/${booking.reference}/pay-at-pickup"[\\s\\S]*Πληρωμή κατά την παραλαβή`));
  assert.match(page.text, /η κράτησή σας επιβεβαιώνεται αμέσως/);

  const res = await h.post(agent, `/booking/${booking.reference}/pay-at-pickup`, {}, `/booking/${booking.reference}`);
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, `/booking/${booking.reference}`);
  const b = bookingsLib.getById(db, booking.id);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.payment_method, 'pay_at_pickup');
  assert.equal(b.payment_status, 'unpaid');
  assert.equal(b.hold_expires_at, null);
  assert.ok(b.switched_to_pickup_at);
  // Η σελίδα πληρωμής έκλεισε στον πάροχο (και στη βάση).
  assert.equal(fake.sessions[session].status, 'expired');
  assert.equal(db.prepare('SELECT status FROM checkouts WHERE id = ?').get(session).status, 'expired');
  assert.ok(db.prepare(`SELECT 1 FROM booking_events WHERE booking_id = ? AND action = 'switched_to_pickup'`).get(b.id));

  const shown = await agent.get(`/booking/${booking.reference}`);
  assert.match(shown.text, /Η κράτησή σας επιβεβαιώθηκε με πληρωμή κατά την παραλαβή/);
  assert.match(shown.text, /Η κράτησή σας είναι επιβεβαιωμένη/);
  assert.doesNotMatch(shown.text, /pay-at-pickup"/);

  // Ίδια emails με μια κράτηση με πληρωμή κατά την παραλαβή: επιβεβαίωση με τους όρους, ειδοποίηση του γραφείου.
  await settleMail();
  const confirmation = mails(`Επιβεβαίωση κράτησης ${b.reference}`);
  assert.equal(confirmation.length, 1);
  assert.equal(confirmation[0].to, 'giorgos@example.com');
  assert.equal(confirmation[0].attachments.length, 1);
  assert.match(confirmation[0].attachments[0].filename, /^oroi-enoikiasis-/);
  assert.match(confirmation[0].html, /κατά την παραλαβή/);
  assert.match(confirmation[0].html, /\/b\/[A-Za-z0-9_-]{43}/);
  const office = mails(`Νέα κράτηση ${b.reference}`);
  assert.equal(office.length, 1);
  assert.equal(office[0].to, 'office@example.gr');

  // Διπλό πάτημα: τίποτα δεν αλλάζει, καμία δεύτερη επιβεβαίωση.
  const again = await h.post(agent, `/booking/${booking.reference}/pay-at-pickup`, {}, `/booking/${booking.reference}`);
  assert.equal(again.status, 303);
  const after = await agent.get(`/booking/${booking.reference}`);
  assert.doesNotMatch(after.text, /alert-error/);
  await settleMail();
  assert.equal(mails(`Επιβεβαίωση κράτησης ${b.reference}`).length, 1);

  // Το αυτοκίνητο μένει κλεισμένο για τον πελάτη.
  const other = await h.post(h.agent(app), '/booking', { ...h.searchParams(), ...h.driver({ email: 'other@example.com' }) });
  assert.equal(other.status, 409);
});

test('πληρωμή με κάρτα που ολοκληρώνεται μετά την αλλαγή (webhook): καταγράφεται στην κράτηση, χωρίς επιστροφή και χωρίς δεύτερη επιβεβαίωση', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const { agent, booking } = await cardBooking(app, db);
  const session = booking.checkout_id;
  await h.post(agent, `/booking/${booking.reference}/pay-at-pickup`, {}, `/booking/${booking.reference}`);
  assert.equal(bookingsLib.getById(db, booking.id).payment_method, 'pay_at_pickup');

  // Η πληρωμή ήταν ήδη σε εξέλιξη στην τράπεζα και ολοκληρώθηκε (το webhook φτάνει μετά την αλλαγή).
  fake.sessions[session].status = 'open';
  fake.pay(session);
  const hook = await stripeWebhook(app, fake, 'checkout.session.completed', { id: session });
  assert.equal(hook.status, 204);
  let b = bookingsLib.getById(db, booking.id);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.payment_status, 'paid');
  assert.equal(b.payment_method, 'card');
  assert.equal(b.paid_cents, b.total_cents);
  assert.equal(b.payment_provider, 'stripe');
  assert.ok(b.payment_ref);
  assert.equal(fake.refunds.length, 0, 'η πληρωμή δεν επιστρέφεται');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM refunds').get().n, 0);
  assert.equal(db.prepare('SELECT status FROM checkouts WHERE id = ?').get(session).status, 'paid');
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM fiscal_docs WHERE booking_id = ? AND kind = 'receipt'`).get(b.id).n, 1);

  // Επανάληψη του webhook και επιστροφή από τη σελίδα πληρωμής: καμία διπλή καταγραφή.
  await stripeWebhook(app, fake, 'checkout.session.completed', { id: session });
  await agent.get(`/booking/${b.reference}/payment/return?session_id=${session}`);
  await runMaintenance(db, { force: true });
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM booking_events WHERE booking_id = ? AND action = 'paid'`).get(b.id).n, 1);

  await settleMail();
  assert.equal(mails(`Επιβεβαίωση κράτησης ${b.reference}`).length, 1, 'μία μόνο επιβεβαίωση');
  assert.equal(mails('Επιστροφή πληρωμής').length, 0);
  const received = mails(`Λάβαμε την πληρωμή σας - κράτηση ${b.reference}`);
  assert.equal(received.length, 1);
  assert.match(received[0].html, /Δεν χρειάζεται να πληρώσετε το ποσό της ενοικίασης κατά την παραλαβή/);
  assert.match(received[0].html, /Κάρτα \(online\) — Εξοφλημένη/);
  const office = mails(`Πληρωμή με κάρτα μετά την αλλαγή σε πληρωμή κατά την παραλαβή - κράτηση ${b.reference}`);
  assert.equal(office.length, 1);
  assert.equal(office[0].to, 'office@example.gr');
  assert.match(office[0].html, /Μην εισπράξετε ξανά το ποσό της ενοικίασης/);

  // Από εδώ και πέρα είναι μια κανονική κράτηση με online πληρωμή: η ακύρωση επιστρέφει τα χρήματα.
  await h.post(agent, `/booking/${b.reference}/cancel`, {}, `/booking/${b.reference}`);
  b = bookingsLib.getById(db, booking.id);
  assert.equal(b.status, 'cancelled');
  assert.equal(b.payment_status, 'refunded');
  assert.deepEqual(fake.refunds.map((r) => r.amount), [b.paid_cents]);
});

test('Revolut: πληρωμή σε εξέλιξη κατά την αλλαγή, ολοκληρώνεται αργότερα (περιοδικός συγχρονισμός): καταγράφεται ως πληρωμή', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useRevolut(t);
  const { agent, booking } = await cardBooking(app, db);
  const order = booking.checkout_id;
  // Η τράπεζα επεξεργάζεται ακόμη την πληρωμή: η παραγγελία δεν μπορεί να ακυρωθεί.
  fake.orders[order].state = 'processing';
  await h.post(agent, `/booking/${booking.reference}/pay-at-pickup`, {}, `/booking/${booking.reference}`);
  let b = bookingsLib.getById(db, booking.id);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.payment_method, 'pay_at_pickup');
  assert.equal(db.prepare('SELECT status FROM checkouts WHERE id = ?').get(order).status, 'open', 'ο συγχρονισμός συνεχίζει να την ελέγχει');

  fake.pay(order);
  db.prepare('UPDATE checkouts SET created_at = ? WHERE id = ?').run(Date.now() - 2 * 60 * 1000, order);
  await runMaintenance(db, { force: true });
  b = bookingsLib.getById(db, booking.id);
  assert.equal(b.payment_status, 'paid');
  assert.equal(b.payment_method, 'card');
  assert.equal(b.payment_provider, 'revolut');
  assert.equal(b.paid_cents, b.total_cents);
  assert.equal(fake.refunds.length, 0);
  await settleMail();
  assert.equal(mails(`Επιβεβαίωση κράτησης ${b.reference}`).length, 1);
  assert.equal(mails(`Λάβαμε την πληρωμή σας - κράτηση ${b.reference}`).length, 1);
});

test('πληρωμή που είχε ήδη ολοκληρωθεί όταν ο πελάτης πατά «Πληρωμή κατά την παραλαβή»: μένει πληρωμή με κάρτα, μία επιβεβαίωση', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const { agent, booking } = await cardBooking(app, db);
  // Πλήρωσε σε άλλη καρτέλα· το webhook δεν έχει φτάσει ακόμη.
  fake.pay(booking.checkout_id);
  await h.post(agent, `/booking/${booking.reference}/pay-at-pickup`, {}, `/booking/${booking.reference}`);
  const b = bookingsLib.getById(db, booking.id);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.payment_status, 'paid');
  assert.equal(b.payment_method, 'card');
  assert.equal(b.switched_to_pickup_at, null);
  const page = await agent.get(`/booking/${b.reference}`);
  assert.match(page.text, /Η πληρωμή σας με κάρτα είχε ήδη ολοκληρωθεί/);
  await stripeWebhook(app, fake, 'checkout.session.completed', { id: booking.checkout_id });
  await settleMail();
  assert.equal(mails(`Επιβεβαίωση κράτησης ${b.reference}`).length, 1);
  assert.equal(mails('Λάβαμε την πληρωμή σας').length, 0);
  assert.equal(fake.refunds.length, 0);
});

test('«Πληρωμή κατά την παραλαβή» μόνο όσο η κράτηση περιμένει πληρωμή και το αυτοκίνητο είναι δεσμευμένο', async (t) => {
  const { db, app } = h.setup();
  h.useStripe(t);
  // Κράτηση που πληρώθηκε στην παραλαβή από την αρχή: δεν υπάρχει κουμπί, η αλλαγή απορρίπτεται.
  const agent = h.agent(app);
  const plain = await h.post(agent, '/booking', { ...h.searchParams({ car: 2 }), ...h.driver() });
  const ref = h.bookingRef(plain);
  assert.doesNotMatch((await agent.get(`/booking/${ref}`)).text, /pay-at-pickup/);
  await h.post(agent, `/booking/${ref}/pay-at-pickup`, {}, `/booking/${ref}`);
  assert.match((await agent.get(`/booking/${ref}`)).text, /Η πληρωμή κατά την παραλαβή δεν είναι πλέον δυνατή για αυτή την κράτηση/);
  assert.equal(bookingsLib.getByReference(db, ref).switched_to_pickup_at, null);

  // Η δέσμευση έληξε (η περιοδική εργασία δεν έτρεξε ακόμη): ούτε κουμπί ούτε αλλαγή.
  const { agent: a2, booking } = await cardBooking(app, db);
  db.prepare('UPDATE bookings SET hold_expires_at = ? WHERE id = ?').run(Date.now() - 1000, booking.id);
  assert.doesNotMatch((await a2.get(`/booking/${booking.reference}`)).text, /pay-at-pickup/);
  await h.post(a2, `/booking/${booking.reference}/pay-at-pickup`, {}, `/booking/${booking.reference}`);
  assert.equal(bookingsLib.getById(db, booking.id).status, 'pending_payment');
  await assert.rejects(rescue.switchToPayAtPickup(db, booking.id), (err) => err.code === 'not_switchable');

  // Ξένος browser δεν μπορεί να αλλάξει την κράτηση κάποιου άλλου.
  const { booking: third } = await cardBooking(app, db, { car: 3 });
  const stranger = h.agent(app);
  const res = await h.post(stranger, `/booking/${third.reference}/pay-at-pickup`, {});
  assert.equal(res.headers.location, '/manage');
  assert.equal(bookingsLib.getById(db, third.id).status, 'pending_payment');
});

test('email «Η κράτησή σας δεν έχει ολοκληρωθεί»: μία φορά, με τον σύνδεσμο «Η κράτησή μου», τη λήξη της δέσμευσης και τους δύο τρόπους πληρωμής', async (t) => {
  const { db, app } = h.setup();
  h.useStripe(t);
  // Η προεπιλογή (10 λεπτά), ανεξάρτητα από ένα .env στον υπολογιστή.
  const minutes = config.rules.paymentReminderMinutes;
  config.rules.paymentReminderMinutes = 10;
  t.after(() => {
    config.rules.paymentReminderMinutes = minutes;
  });
  const { booking } = await cardBooking(app, db);

  // Πριν από τα 10 λεπτά: τίποτα.
  ageBooking(db, booking.id, 5);
  await runMaintenance(db, { force: true });
  await settleMail();
  assert.equal(mails('Η κράτησή σας δεν έχει ολοκληρωθεί').length, 0);

  ageBooking(db, booking.id, 11);
  await runMaintenance(db, { force: true });
  await runMaintenance(db, { force: true });
  await settleMail();
  const reminders = mails('Η κράτησή σας δεν έχει ολοκληρωθεί');
  assert.equal(reminders.length, 1, 'στέλνεται μία φορά');
  const mail = reminders[0];
  assert.equal(mail.subject, `Η κράτησή σας δεν έχει ολοκληρωθεί - κράτηση ${booking.reference}`);
  assert.equal(mail.to, 'giorgos@example.com');
  const b = bookingsLib.getById(db, booking.id);
  assert.ok(b.payment_reminder_sent_at);
  const holdTime = format.msTime(b.hold_expires_at, config.rules.timezone);
  assert.ok(mail.html.includes(`έως τις <strong>${holdTime}</strong> (ώρα Ελλάδας)`), 'η ώρα λήξης της δέσμευσης');
  assert.match(mail.html, /«Πληρωμή [^»]+»<\/strong>: πληρώνετε τώρα online με κάρτα/);
  assert.match(mail.html, /«Πληρωμή κατά την παραλαβή»<\/strong>: η κράτησή σας επιβεβαιώνεται αμέσως/);
  assert.ok(mail.html.includes(format.money(b.total_cents)));
  assert.match(mail.html, /Αν δεν θέλετε πλέον την κράτηση, δεν χρειάζεται να κάνετε τίποτα/);
  // Ο σύνδεσμος «Η κράτησή μου» (με ένα πάτημα) ανοίγει την κράτηση με τα δύο κουμπιά.
  const token = /https:\/\/rent\.example\.gr\/b\/([A-Za-z0-9_-]{43})/.exec(mail.html);
  assert.ok(token, 'σύνδεσμος /b/<token>');
  const visitor = h.agent(app);
  const tap = await visitor.get(`/b/${token[1]}`);
  assert.equal(tap.headers.location, `/booking/${b.reference}`);
  const page = await visitor.get(`/booking/${b.reference}`);
  assert.match(page.text, /pay-at-pickup/);
  assert.ok(db.prepare(`SELECT 1 FROM booking_events WHERE booking_id = ? AND action = 'payment_reminder'`).get(b.id));
  // Από το email ο πελάτης επιλέγει πληρωμή κατά την παραλαβή.
  await h.post(visitor, `/booking/${b.reference}/pay-at-pickup`, {}, `/booking/${b.reference}`);
  assert.equal(bookingsLib.getById(db, b.id).status, 'confirmed');
});

test('υπενθύμιση πληρωμής: όχι για επιβεβαιωμένες, πληρωμένες ή ληγμένες κρατήσεις, ούτε όταν η δέσμευση λήγει σε λίγα λεπτά', async (t) => {
  const { db, app } = h.setup();
  const fake = h.useStripe(t);
  const minutes = config.rules.paymentReminderMinutes;
  config.rules.paymentReminderMinutes = 10;
  t.after(() => {
    config.rules.paymentReminderMinutes = minutes;
  });
  // Επιβεβαιωμένη με πληρωμή κατά την παραλαβή.
  const plain = await h.post(h.agent(app), '/booking', { ...h.searchParams({ car: 1 }), ...h.driver() });
  const confirmed = bookingsLib.getByReference(db, h.bookingRef(plain));
  // Πληρώθηκε στον πάροχο αλλά το webhook δεν έφτασε: ελέγχεται πρώτα ο πάροχος.
  const { booking: paid } = await cardBooking(app, db, { car: 2 });
  fake.pay(paid.checkout_id);
  // Ληγμένη.
  const { booking: expired } = await cardBooking(app, db, { car: 3 });
  db.prepare('UPDATE bookings SET hold_expires_at = ? WHERE id = ?').run(Date.now() - 1000, expired.id);
  // Η δέσμευση λήγει σε 3 λεπτά: δεν προλαβαίνει.
  const { booking: late } = await cardBooking(app, db, { car: 4 });
  db.prepare('UPDATE bookings SET hold_expires_at = ? WHERE id = ?').run(Date.now() + 3 * 60 * 1000, late.id);
  for (const b of [confirmed, paid, expired, late]) ageBooking(db, b.id, 15);

  await runMaintenance(db, { force: true });
  await settleMail();
  assert.equal(mails('Η κράτησή σας δεν έχει ολοκληρωθεί').length, 0);
  assert.equal(bookingsLib.getById(db, paid.id).status, 'confirmed', 'η πληρωμή καταγράφηκε');
  assert.equal(mails(`Επιβεβαίωση κράτησης ${paid.reference}`).length, 1);
  assert.equal(bookingsLib.getById(db, expired.id).status, 'expired');
  for (const b of [confirmed, paid, expired, late]) assert.equal(bookingsLib.getById(db, b.id).payment_reminder_sent_at, null);

  // PAYMENT_REMINDER_MINUTES=0: δεν στέλνεται ποτέ.
  const { booking: pending } = await cardBooking(app, db, { car: 5 });
  ageBooking(db, pending.id, 15);
  config.rules.paymentReminderMinutes = 0;
  assert.equal(await rescue.sendPaymentReminders(db), 0);
  config.rules.paymentReminderMinutes = 10;
  assert.equal(await rescue.sendPaymentReminders(db), 1);
});

test('PAYMENT_REMINDER_MINUTES: πάντα τουλάχιστον 10 λεπτά πριν λήξει η δέσμευση, 0 = ποτέ', () => {
  const read = (envVars) =>
    execFileSync(process.execPath, ['-e', "process.stdout.write(String(require('./src/config').rules.paymentReminderMinutes))"], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'test', ...envVars },
    }).toString();
  assert.equal(read({ PAYMENT_REMINDER_MINUTES: '', PAYMENT_HOLD_MINUTES: '' }), '10');
  assert.equal(read({ PAYMENT_REMINDER_MINUTES: '60', PAYMENT_HOLD_MINUTES: '35' }), '25');
  assert.equal(read({ PAYMENT_REMINDER_MINUTES: '60', PAYMENT_HOLD_MINUTES: '120' }), '60');
  assert.equal(read({ PAYMENT_REMINDER_MINUTES: '0' }), '0');
});

test('κράτηση που έληξε: «Κάντε νέα αναζήτηση» κρατά τα σημεία, τις ημερομηνίες και τις ώρες', async (t) => {
  const { db, app } = h.setup();
  h.useStripe(t);
  const params = h.searchParams({ pickupLocation: 2, returnLocation: 3, pickupTime: '11:30', returnTime: '18:00' });
  const { agent, booking } = await cardBooking(app, db, { pickupLocation: 2, returnLocation: 3, pickupTime: '11:30', returnTime: '18:00' });
  db.prepare('UPDATE bookings SET hold_expires_at = ? WHERE id = ?').run(Date.now() - 1, booking.id);
  await runMaintenance(db);
  assert.equal(bookingsLib.getById(db, booking.id).status, 'expired');

  const expected = new URLSearchParams({
    pickup_location: '2',
    return_location: '3',
    pickup_date: params.pickup_date,
    pickup_time: '11:30',
    return_date: params.return_date,
    return_time: '18:00',
  }).toString();
  assert.equal(rescue.searchQueryFor(bookingsLib.getById(db, booking.id)), expected);
  const page = await agent.get(`/booking/${booking.reference}`);
  const href = `/cars?${expected}`;
  assert.ok(page.text.includes(`<a href="${href.replace(/&/g, '&amp;')}">Κάντε νέα αναζήτηση</a>`), 'σύνδεσμος με την ίδια αναζήτηση');
  // Η σελίδα αποτελεσμάτων ανοίγει με την ίδια αναζήτηση (και το αυτοκίνητο είναι πάλι διαθέσιμο).
  const results = await agent.get(href);
  assert.equal(results.status, 200);
  assert.ok(results.text.includes(`value="${params.pickup_date}"`));
  assert.ok(results.text.includes(`value="${params.return_date}"`));
  assert.match(results.text, /<option value="2" selected>/);
  assert.match(results.text, new RegExp(`/cars/${booking.car_id}\\?[^"]*pickup_date=${params.pickup_date}`));
  // Στα αγγλικά ο σύνδεσμος μένει στη γλώσσα της σελίδας.
  const en = await agent.get(`/en/booking/${booking.reference}`);
  assert.ok(en.text.includes(`<a href="/en${href.replace(/&/g, '&amp;')}">Start a new search</a>`));
});
