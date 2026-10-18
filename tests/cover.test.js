'use strict';

// «Κάλυψη ζημιών» (βασική κάλυψη ή Πλήρης Απαλλαγή FDW) στη φόρμα κράτησης και στη σελίδα του αυτοκινήτου,
// και η κάτω μπάρα στο κινητό (σύνολο και επόμενο βήμα).

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const bookingsLib = require('../src/lib/bookings');

function fdwOf(db) {
  return db.prepare("SELECT * FROM extras WHERE kind = 'damage_waiver' ORDER BY sort_order, id").get();
}

function excessOf(car) {
  return car.excess_cents ?? car.deposit_cents;
}

// Οι δύο επιλογές της «Κάλυψης ζημιών» (radio με το ίδιο όνομα extra_<id>).
function coverRadios(html, id) {
  const re = new RegExp(`<input type="radio" name="extra_${id}" value="([01])"([^>]*)>`, 'g');
  return [...html.matchAll(re)].map((m) => ({ value: m[1], checked: /\bchecked\b/.test(m[2]) }));
}

function section(html, start) {
  const from = html.indexOf(start);
  assert.ok(from !== -1, `δεν βρέθηκε: ${start}`);
  return html.slice(from, html.indexOf('</section>', from));
}

function bar(html) {
  const from = html.indexOf('<div class="bottom-bar" data-bottom-bar>');
  assert.ok(from !== -1, 'υπάρχει κάτω μπάρα');
  return html.slice(from, html.indexOf('</div>', from));
}

test('κάλυψη ζημιών: προεπιλογή η βασική, η FDW ως δεύτερη επιλογή με το ίδιο πεδίο, όχι στα «Πρόσθετα»', async () => {
  const { db, app } = h.setup();
  const fdw = fdwOf(db);
  const car = db.prepare('SELECT * FROM cars WHERE id = 1').get();
  const res = await h.request(app).get(`/booking/new?${new URLSearchParams(h.searchParams())}`);
  assert.equal(res.status, 200);

  // Δύο επιλογές, προεπιλεγμένη ΜΟΝΟ η βασική (ποτέ η FDW με χρέωση).
  assert.deepEqual(coverRadios(res.text, fdw.id), [{ value: '0', checked: true }, { value: '1', checked: false }]);
  const cover = section(res.text, '<section class="card pad cover">');
  assert.match(cover, /Κάλυψη ζημιών/);
  assert.match(cover, /Βασική κάλυψη \(περιλαμβάνεται\)/);
  assert.match(cover, new RegExp(`Συμμετοχή σας σε ζημιές έως ${excessOf(car) / 100},00\\s€`));
  assert.match(cover, /\+0,00\s€/);
  assert.match(cover, /Πλήρης Απαλλαγή \(FDW\)/);
  assert.match(cover, /Συμμετοχή σας σε ζημιές 0,00\s€/);
  assert.match(cover, /<strong>\+12,00\s€\/ημέρα<\/strong> \(36,00\s€ για 3 ημέρες\)/);
  assert.match(cover, new RegExp(`Η εγγύηση στην πιστωτική κάρτα είναι ${car.deposit_cents / 100},00\\s€ και στις δύο περιπτώσεις\\.`));
  assert.match(cover, /δεν είναι ασφαλιστικό προϊόν/);
  assert.match(cover, /<a href="\/terms#damage" target="_blank">όροι ενοικίασης, §7<\/a>/);
  assert.match(cover, /data-extra data-kind="damage_waiver"/, 'ζωντανή ενημέρωση τιμής (refreshQuote)');

  // Η «Κάλυψη ζημιών» είναι πάνω από τα «Πρόσθετα», που δεν έχουν πια την FDW.
  const extras = section(res.text, '<h2 class="h3">Πρόσθετα</h2>');
  assert.ok(res.text.indexOf('<section class="card pad cover">') < res.text.indexOf('<h2 class="h3">Πρόσθετα</h2>'));
  assert.doesNotMatch(extras, new RegExp(`name="extra_${fdw.id}"`));
  assert.doesNotMatch(extras, /FDW/);
  assert.equal((res.text.match(new RegExp(`name="extra_${fdw.id}"`, 'g')) || []).length, 2, 'μόνο οι δύο επιλογές');

  // Ενοικίαση 1 ημέρας: ενικός.
  const oneDay = await h.request(app).get(`/booking/new?${new URLSearchParams(h.searchParams({ days: 1 }))}`);
  assert.match(oneDay.text, /<strong>\+12,00\s€\/ημέρα<\/strong> \(12,00\s€ για 1 ημέρα\)/);
});

test('κάλυψη ζημιών: η επιλογή φτάνει στη ζωντανή τιμή (/api/quote) και στην κράτηση — βασική ή FDW', async () => {
  const { db, app } = h.setup();
  const fdw = fdwOf(db);
  const car = db.prepare('SELECT * FROM cars WHERE id = 1').get();
  const params = h.searchParams();

  const basic = await h.request(app).get(`/api/quote?${new URLSearchParams({ ...params, [`extra_${fdw.id}`]: '0' })}`);
  const full = await h.request(app).get(`/api/quote?${new URLSearchParams({ ...params, [`extra_${fdw.id}`]: '1' })}`);
  assert.equal(basic.body.hasWaiver, false);
  assert.equal(basic.body.excess, `${excessOf(car) / 100},00 €`);
  assert.equal(full.body.hasWaiver, true);
  assert.equal(full.body.excess, '0,00 €');
  assert.equal(full.body.totalCents - basic.body.totalCents, 3 * fdw.price_cents);

  // Κράτηση με τη βασική κάλυψη (extra_<id>=0): καμία χρέωση FDW, απαλλαγή του αυτοκινήτου.
  const a = h.agent(app);
  const form = `/booking/new?${new URLSearchParams(params)}`;
  const r1 = await h.post(a, '/booking', { ...params, ...h.driver(), [`extra_${fdw.id}`]: '0' }, form);
  assert.equal(r1.status, 303);
  const b1 = bookingsLib.getByReference(db, h.bookingRef(r1));
  assert.equal(bookingsLib.getExtras(db, b1.id).length, 0);
  assert.equal(b1.excess_cents, excessOf(car));
  assert.equal(b1.total_cents, basic.body.totalCents);

  // Κράτηση με Πλήρη Απαλλαγή (extra_<id>=1, άλλο αυτοκίνητο): χρέωση FDW, απαλλαγή 0 €.
  const p2 = h.searchParams({ car: 2 });
  const r2 = await h.post(h.agent(app), '/booking', { ...p2, ...h.driver({ email: 'maria@example.com' }), [`extra_${fdw.id}`]: '1' }, `/booking/new?${new URLSearchParams(p2)}`);
  assert.equal(r2.status, 303);
  const b2 = bookingsLib.getByReference(db, h.bookingRef(r2));
  const lines = bookingsLib.getExtras(db, b2.id);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].extra_id, fdw.id);
  assert.equal(lines[0].total_cents, 3 * fdw.price_cents);
  assert.equal(b2.excess_cents, 0);
});

test('κάλυψη ζημιών χωρίς JavaScript: μετά από σφάλμα η φόρμα κρατά την επιλογή και το σύνολο τη συμπεριλαμβάνει', async () => {
  const { db, app } = h.setup();
  const fdw = fdwOf(db);
  const params = h.searchParams();
  const form = `/booking/new?${new URLSearchParams(params)}`;
  const agent = h.agent(app);

  const withFdw = await h.post(agent, '/booking', { ...params, ...h.driver({ email: 'λάθος' }), [`extra_${fdw.id}`]: '1' }, form);
  assert.equal(withFdw.status, 422);
  assert.deepEqual(coverRadios(withFdw.text, fdw.id), [{ value: '0', checked: false }, { value: '1', checked: true }]);
  assert.match(withFdw.text, /<li data-q-row="fdw" class="">/, 'σημείωση FDW στην ενημέρωση πριν την κράτηση');
  assert.match(withFdw.text, /<dd data-q="excess">0,00\s€<\/dd>/);
  const total = /<dd data-q="total">([^<]+)<\/dd>/.exec(withFdw.text)[1];
  assert.match(bar(withFdw.text), new RegExp(`<strong data-bar-total>${total}</strong>`), 'ίδιο σύνολο στη μπάρα');

  const withBasic = await h.post(agent, '/booking', { ...params, ...h.driver({ email: 'λάθος' }), [`extra_${fdw.id}`]: '0' }, form);
  assert.equal(withBasic.status, 422);
  assert.deepEqual(coverRadios(withBasic.text, fdw.id), [{ value: '0', checked: true }, { value: '1', checked: false }]);
  assert.match(withBasic.text, /<li data-q-row="fdw" class="hidden">/);
});

test('κάτω μπάρα στη φόρμα κράτησης: σύνολο και σύνδεσμος προς τη σύνοψη — ΔΕΝ υποβάλλει τη φόρμα', async () => {
  const { app } = h.setup();
  const res = await h.request(app).get(`/booking/new?${new URLSearchParams(h.searchParams())}`);
  assert.match(res.text, /<body class="has-bottom-bar">/);
  const b = bar(res.text);
  const total = /<dd data-q="total">([^<]+)<\/dd>/.exec(res.text)[1];
  assert.match(b, new RegExp(`Σύνολο</span> <strong data-bar-total>${total}</strong>`));
  assert.match(b, /<a class="btn btn-primary" href="#booking-summary" data-bar-scroll>Σύνοψη &amp; ολοκλήρωση<\/a>/);
  assert.doesNotMatch(b, /<button|type="submit"|<form/);
  // Η μπάρα είναι εκτός φόρμας· ο σύνδεσμος οδηγεί στο σύνολο της σύνοψης, πριν από το (μοναδικό) κουμπί κράτησης,
  // που βρίσκεται μετά την ενημέρωση πριν την κράτηση.
  assert.ok(res.text.indexOf('</form>') < res.text.indexOf('data-bottom-bar>'));
  const target = res.text.indexOf('id="booking-summary"');
  const precontract = res.text.indexOf('Σημαντικές πληροφορίες πριν την κράτηση');
  const submit = res.text.indexOf('Κράτηση με υποχρέωση πληρωμής</button>');
  assert.ok(precontract !== -1 && precontract < target && target < submit);
  assert.equal((res.text.match(/type="submit" class="btn btn-primary btn-block" data-submit/g) || []).length, 1);
});

test('σελίδα αυτοκινήτου: γραμμή FDW κάτω από τη βασική κάλυψη, και κάτω μπάρα με ή χωρίς τιμή', async () => {
  const { db, app } = h.setup();
  const car = db.prepare('SELECT * FROM cars WHERE id = 1').get();

  const plain = await h.request(app).get('/cars/1');
  assert.match(plain.text, new RegExp(`Βασική κάλυψη ζημιών \\(CDW\\) — απαλλαγή ${excessOf(car) / 100},00\\s€`));
  assert.match(plain.text, /<span class="checklist-sub">Μηδενική συμμετοχή με την Πλήρη Απαλλαγή \(FDW\): \+12,00\s€\/ημέρα<\/span>/);
  // Χωρίς ημερομηνίες: «Έλεγχος διαθεσιμότητας», που πηγαίνει στη φόρμα της σελίδας.
  const b1 = bar(plain.text);
  assert.match(b1, /από<br><strong>25,00\s€<\/strong> \/ ημέρα/);
  assert.match(b1, /<a class="btn btn-primary" href="#availability" data-bar-scroll>Έλεγχος διαθεσιμότητας<\/a>/);
  assert.match(plain.text, /<aside class="card pad sticky" id="availability"/);

  // Με ημερομηνίες: σύνολο και «Συνέχεια στην κράτηση».
  const search = h.searchParams();
  delete search.car_id;
  const quoted = await h.request(app).get(`/cars/1?${new URLSearchParams(search)}`);
  const b2 = bar(quoted.text);
  assert.match(b2, /<strong>75,00\s€<\/strong> για 3 ημέρες/);
  assert.match(b2, /href="\/booking\/new\?car_id=1&pickup_location=1&amp;[^"]+">Συνέχεια στην κράτηση<\/a>/);
  const oneDay = h.searchParams({ days: 1 });
  delete oneDay.car_id;
  assert.match(bar((await h.request(app).get(`/cars/1?${new URLSearchParams(oneDay)}`)).text), /<strong>25,00\s€<\/strong> για 1 ημέρα/);

  // Μη διαθέσιμο: πάλι «Έλεγχος διαθεσιμότητας» (εκεί είναι το μήνυμα).
  const params = h.searchParams();
  await h.post(h.agent(app), '/booking', { ...params, ...h.driver() }, `/booking/new?${new URLSearchParams(params)}`);
  const taken = await h.request(app).get(`/cars/1?${new URLSearchParams(search)}`);
  assert.match(taken.text, /δεν είναι διαθέσιμο/);
  assert.match(bar(taken.text), /Έλεγχος διαθεσιμότητας/);
});

test('κάλυψη ζημιών: χωρίς ενεργή FDW δεν εμφανίζεται· με χρέωση ανά ενοικίαση· δεύτερη FDW μένει στα «Πρόσθετα»', async () => {
  const { db, app } = h.setup();
  const fdw = fdwOf(db);
  const search = new URLSearchParams(h.searchParams()).toString();

  db.prepare('UPDATE extras SET active = 0 WHERE id = ?').run(fdw.id);
  const none = await h.request(app).get(`/booking/new?${search}`);
  assert.doesNotMatch(none.text, /class="card pad cover"/);
  assert.doesNotMatch((await h.request(app).get('/cars/1')).text, /checklist-sub/);

  db.prepare("UPDATE extras SET active = 1, pricing = 'per_rental' WHERE id = ?").run(fdw.id);
  const perRental = await h.request(app).get(`/booking/new?${search}`);
  assert.match(section(perRental.text, '<section class="card pad cover">'), /<strong>\+12,00\s€<\/strong> ανά ενοικίαση/);
  assert.match((await h.request(app).get('/cars/1')).text, /Μηδενική συμμετοχή με την Πλήρη Απαλλαγή \(FDW\): \+12,00\s€ ανά ενοικίαση/);

  // Δεύτερο πρόσθετο του ίδιου είδους (ασυνήθιστο): δεν χάνεται, εμφανίζεται στα «Πρόσθετα».
  const second = db
    .prepare("INSERT INTO extras (name, name_en, name_es, price_cents, pricing, max_qty, sort_order, kind) VALUES ('Απαλλαγή ελαστικών', 'Tyre waiver', 'Exención de neumáticos', 300, 'per_day', 1, 9, 'damage_waiver')")
    .run().lastInsertRowid;
  const both = await h.request(app).get(`/booking/new?${search}`);
  assert.equal(coverRadios(both.text, fdw.id).length, 2);
  assert.match(section(both.text, '<h2 class="h3">Πρόσθετα</h2>'), new RegExp(`type="checkbox" name="extra_${second}"`));
});
