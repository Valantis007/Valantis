'use strict';

// Αρχική σελίδα (design Γ), ημερολόγιο ημερομηνιών και οδηγίες δοκιμών για τον διαχειριστή.

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

test('αρχική: κατηγορίες με τιμή «από», δημοφιλή αυτοκίνητα και τι χρειάζεστε στην παραλαβή', async () => {
  const { db, app } = h.setup();
  const res = await h.request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /Κατηγορίες και τιμές από/);
  // Μικρά: Fiat Panda (25 €) και Toyota Aygo X (30 €) → «από 25,00 €», με σύνδεσμο στο φίλτρο κατηγορίας.
  assert.match(res.text, /href="\/cars\?category=mini">\s*<strong>[^<]+<\/strong>\s*<span class="small muted">Fiat Panda, Toyota Aygo X<\/span>\s*<span class="price">από <strong>25,00\s€<\/strong>/);
  assert.match(res.text, /Δημοφιλή αυτοκίνητα/);
  assert.match(res.text, new RegExp(`Όλα τα αυτοκίνητα \\(${db.prepare('SELECT COUNT(*) n FROM cars WHERE active = 1').get().n}\\)`));
  assert.match(res.text, /Τι χρειάζεστε στην παραλαβή/);
  assert.match(res.text, /Απεριόριστα χιλιόμετρα/);

  // Αν κάποιο αυτοκίνητο έχει όριο χιλιομέτρων, η αρχική δεν υπόσχεται «απεριόριστα».
  db.prepare("UPDATE cars SET mileage_policy = '200 km/ημέρα' WHERE id = 1").run();
  const limited = await h.request(app).get('/');
  assert.doesNotMatch(limited.text, /Απεριόριστα χιλιόμετρα/);
  // Ανενεργά αυτοκίνητα δεν μετράνε.
  db.prepare("UPDATE cars SET active = 0 WHERE category = 'luxury'").run();
  assert.doesNotMatch((await h.request(app).get('/')).text, /category=luxury/);
});

test('ημερολόγιο: τα πεδία ημερομηνιών έχουν τα κείμενα στη γλώσσα της σελίδας', async () => {
  const { app } = h.setup();
  const en = await h.request(app).get('/en');
  const m = /data-calendar="([^"]+)"/.exec(en.text);
  assert.ok(m, 'data-calendar');
  const texts = JSON.parse(m[1].replace(/&#34;|&quot;/g, '"'));
  assert.equal(texts.choosePickup, 'Choose your pick-up date');
  assert.match(en.text, /<script src="\/js\/dates\.js" defer><\/script>/);
  const form = await h.request(app).get(`/es/booking/new?${new URLSearchParams(h.searchParams())}`);
  assert.match(form.text, /data-dmy="DD\/MM\/AAAA"/);
});

test('σελίδα κράτησης χωρίς πάροχο πληρωμών: οδηγία δοκιμής με κάρτα μόνο για τον διαχειριστή', async () => {
  const { db, app } = h.setup();
  const url = `/booking/new?${new URLSearchParams(h.searchParams())}`;
  const guest = await h.request(app).get(url);
  assert.equal(guest.status, 200);
  assert.doesNotMatch(guest.text, /sk_test_/);
  const customer = h.agent(app);
  await h.login(customer, await h.createUser(db));
  assert.doesNotMatch((await customer.get(url)).text, /sk_test_/);
  const admin = h.agent(app);
  await h.login(admin, await h.createUser(db, { email: 'admin@example.com', role: 'admin' }));
  const page = await admin.get(url);
  assert.match(page.text, /Μόνο εσείς \(διαχειριστής\) βλέπετε αυτό το μήνυμα/);
  assert.match(page.text, /4242 4242 4242 4242/);
});

test('σελίδα κράτησης με πάροχο πληρωμών: δεν εμφανίζεται η οδηγία', async (t) => {
  const { db, app } = h.setup();
  h.useStripe(t);
  const admin = h.agent(app);
  await h.login(admin, await h.createUser(db, { email: 'admin@example.com', role: 'admin' }));
  const page = await admin.get(`/booking/new?${new URLSearchParams(h.searchParams())}`);
  assert.match(page.text, /value="card"/);
  assert.doesNotMatch(page.text, /Μόνο εσείς \(διαχειριστής\)/);
});
