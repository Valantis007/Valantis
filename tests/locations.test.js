'use strict';

// Σημεία παραλαβής/επιστροφής: «Πώς θα μας βρείτε» (οδηγίες, «Οδηγίες πορείας») και διεύθυνση
// παράδοσης/παραλαβής του αυτοκινήτου όταν το σημείο τη ζητά (π.χ. «Παράδοση σε ξενοδοχείο»).

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { MIGRATIONS, migrate } = require('../src/db');
const bookingsLib = require('../src/lib/bookings');
const places = require('../src/lib/places');
const mailer = require('../src/lib/mailer');
const { purgeExpiredPersonalData } = require('../src/lib/maintenance');

const OFFICE = 1;
const AIRPORT = 2;
const PORT = 3;
const HOTEL = 4;
const GREEK = /[Ͱ-Ͽἀ-῿]+/g;
const LATIN_DRIVER = { first_name: 'John', last_name: 'Smith', email: 'john@example.com', license_country: 'United Kingdom' };
const HOTEL_A = 'Hotel Electra Palace, Aristotelous Sq. 9';
const HOTEL_B = 'Hotel Capsis, Monastiriou 18';

const formUrl = (params, prefix = '') => `${prefix}/booking/new?${new URLSearchParams(params)}`;

// Ελληνικό κείμενο (ορατό ή σε attribute), εκτός από την επιλογή γλώσσας.
function greekIn(html) {
  let text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  for (const a of ['Ελληνικά', 'ΕΛ']) text = text.split(a).join(' ');
  return text.match(GREEK) || [];
}

async function book(app, { params, driver = {}, prefix = '', agent = h.agent(app) }) {
  const res = await h.post(agent, `${prefix}/booking`, { ...params, ...h.driver(driver) }, formUrl(params, prefix));
  return { res, agent, ref: h.bookingRef(res) };
}

async function adminAgent(db, app) {
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  return aa;
}

test('αρχικά σημεία: οδηγίες παραλαβής/επιστροφής σε τρεις γλώσσες, διεύθυνση από τον πελάτη μόνο για το ξενοδοχείο', () => {
  const { db } = h.setup();
  const rows = db.prepare('SELECT * FROM locations ORDER BY id').all();
  assert.equal(rows.length, 4);
  for (const l of rows) {
    for (const f of ['instructions', 'return_instructions']) {
      assert.ok(l[f] && l[`${f}_en`] && l[`${f}_es`], `${l.name}: ${f} σε όλες τις γλώσσες`);
      assert.doesNotMatch(l[`${f}_en`], GREEK);
      assert.doesNotMatch(l[`${f}_es`], GREEK);
    }
    assert.equal(l.map_url, null, 'χωρίς σύνδεσμο χάρτη στα ενδεικτικά σημεία');
  }
  assert.deepEqual(rows.map((l) => l.needs_address), [0, 0, 0, 1]);
  assert.match(rows[1].instructions, /έξοδο των αφίξεων με πινακίδα με το όνομά σας/);
  assert.match(rows[1].instructions, /Αν καθυστερήσει η πτήση σας, σας περιμένουμε/);
  assert.match(rows[2].instructions, /έξοδος του επιβατικού σταθμού/);
  assert.match(rows[0].instructions, /08:00 - 22:00/, 'το ωράριο των ρυθμίσεων');
  assert.match(rows[3].instructions, /στη διεύθυνση που θα μας δώσετε, εντός πόλης/);
});

test('μετάβαση 11 σε παλιά βάση: οδηγίες για τα σημεία με το αρχικό όνομα, διεύθυνση από τον πελάτη για το ξενοδοχείο', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (let v = 0; v < 10; v += 1) {
    if (typeof MIGRATIONS[v] === 'function') MIGRATIONS[v](db);
    else db.exec(MIGRATIONS[v]);
  }
  db.exec('PRAGMA user_version = 10');
  const insert = db.prepare('INSERT INTO locations (id, name, address) VALUES (?, ?, ?)');
  insert.run(1, 'Αεροδρόμιο', 'Αίθουσα αφίξεων');
  insert.run(2, 'Παράδοση σε ξενοδοχείο (εντός πόλης)', 'Στη διεύθυνση που θα μας δώσετε');
  insert.run(3, 'Αεροδρόμιο Μακεδονία', 'Αίθουσα αφίξεων'); // άλλαξε όνομα: μένει χωρίς οδηγίες
  insert.run(4, 'Παράδοση στο σπίτι σας', 'Στη διεύθυνση που θα μας δώσετε');
  migrate(db);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, MIGRATIONS.length);
  const rows = db.prepare('SELECT * FROM locations ORDER BY id').all();
  assert.match(rows[0].instructions, /πινακίδα με το όνομά σας/);
  assert.match(rows[0].instructions_en, /sign with your name/);
  assert.match(rows[0].return_instructions_es, /recogerá el coche y las llaves/);
  assert.equal(rows[0].needs_address, 0);
  assert.match(rows[1].instructions_en, /We bring the car to the address you give us/);
  assert.equal(rows[1].needs_address, 1);
  assert.equal(rows[2].instructions, '');
  assert.equal(rows[2].instructions_en, null);
  assert.equal(rows[3].needs_address, 1, 'ίδια ενδεικτική διεύθυνση «στη διεύθυνση που θα μας δώσετε»');
  const cols = db.prepare('PRAGMA table_info(bookings)').all().map((c) => c.name);
  assert.ok(cols.includes('pickup_address') && cols.includes('return_address'));
});

test('οδηγίες πορείας: σύνδεσμος χάρτη αν υπάρχει, αλλιώς Google Maps προς τη διεύθυνση· όχι στη διεύθυνση του πελάτη', () => {
  assert.equal(places.isMapUrl('https://maps.app.goo.gl/abc'), true);
  assert.equal(places.isMapUrl('javascript:alert(1)'), false);
  assert.equal(places.isMapUrl('maps.google.com'), false);
  assert.equal(places.directionsUrl({ map_url: 'https://maps.app.goo.gl/abc', address: 'Τσιμισκή 12' }), 'https://maps.app.goo.gl/abc');
  assert.equal(
    places.directionsUrl({ map_url: null, address: 'Τσιμισκή 12, Θεσσαλονίκη' }),
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('Τσιμισκή 12, Θεσσαλονίκη')}`,
  );
  assert.equal(places.directionsUrl({ map_url: 'javascript:alert(1)', address: '' }), '');
  assert.equal(places.directionsUrl({ needs_address: 1, address: 'Στη διεύθυνση που θα μας δώσετε' }), '');
});

test('φόρμα κράτησης: πεδία διεύθυνσης μόνο για σημεία που τη ζητούν, «Πώς θα μας βρείτε» στη σύνοψη', async () => {
  const { app } = h.setup();
  const office = await h.request(app).get(formUrl(h.searchParams({ pickupLocation: OFFICE, returnLocation: AIRPORT })));
  assert.equal(office.status, 200);
  assert.doesNotMatch(office.text, /name="pickup_address"/);
  assert.doesNotMatch(office.text, /name="return_address"/);
  assert.match(office.text, /Πώς θα μας βρείτε/);
  assert.match(office.text, /Ελάτε στο γραφείο μας/);
  assert.match(office.text, /Καλέστε μας περίπου 15 λεπτά πριν φτάσετε στο αεροδρόμιο/, 'οδηγίες επιστροφής στο αεροδρόμιο');
  assert.match(office.text, /href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=/);

  const hotel = await h.request(app).get(formUrl(h.searchParams({ pickupLocation: HOTEL, returnLocation: HOTEL })));
  assert.match(hotel.text, /Διεύθυνση παράδοσης \(ξενοδοχείο, οδός, περιοχή\) \*/);
  assert.match(hotel.text, /Διεύθυνση από όπου θα παραλάβουμε το αυτοκίνητο \*/);
  assert.match(hotel.text, /<span class="hint">Εντός πόλης<\/span>/);
  assert.match(hotel.text, /name="return_same_address" value="1" checked/, 'προεπιλογή: ίδια διεύθυνση');

  const onlyReturn = await h.request(app).get(formUrl(h.searchParams({ pickupLocation: AIRPORT, returnLocation: HOTEL })));
  assert.doesNotMatch(onlyReturn.text, /name="pickup_address"/);
  assert.doesNotMatch(onlyReturn.text, /name="return_same_address"/);
  assert.match(onlyReturn.text, /name="return_address"/);
});

test('κράτηση με παράδοση σε ξενοδοχείο: υποχρεωτική διεύθυνση, «ίδια διεύθυνση», αποθήκευση και εμφάνιση παντού', async () => {
  const { db, app } = h.setup();
  const params = h.searchParams({ pickupLocation: HOTEL, returnLocation: HOTEL });
  // Χωρίς διεύθυνση: η φόρμα ξαναεμφανίζεται με το σφάλμα δίπλα στο πεδίο.
  const missing = await book(app, { params });
  assert.equal(missing.res.status, 422);
  assert.match(missing.res.text, /id="err-pickup_address">Συμπληρώστε τη διεύθυνση παράδοσης \(ξενοδοχείο, οδός, περιοχή\)\./);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings').get().n, 0);
  // Διαφορετική διεύθυνση παραλαβής, αλλά κενή.
  const noReturn = await book(app, { params: { ...params, pickup_address: HOTEL_A } });
  assert.equal(noReturn.res.status, 422);
  assert.match(noReturn.res.text, /id="err-return_address">Συμπληρώστε τη διεύθυνση από όπου θα παραλάβουμε το αυτοκίνητο\./);
  assert.match(noReturn.res.text, new RegExp(`value="${HOTEL_A}"`), 'η φόρμα κρατά τη διεύθυνση');
  assert.doesNotMatch(noReturn.res.text, /name="return_same_address" value="1" checked/, 'κρατά και την επιλογή του πελάτη');

  // «Ίδια διεύθυνση»: παραλαμβάνουμε από εκεί που το φέραμε.
  const same = await book(app, { params: { ...params, pickup_address: HOTEL_A, return_same_address: '1', return_address: 'αγνοείται' } });
  assert.equal(same.res.status, 303);
  const b1 = bookingsLib.getByReference(db, same.ref);
  assert.equal(b1.pickup_address, HOTEL_A);
  assert.equal(b1.return_address, HOTEL_A);

  // Διαφορετική διεύθυνση επιστροφής.
  const other = await book(app, { params: { ...h.searchParams({ car: 2, pickupLocation: HOTEL, returnLocation: HOTEL }), pickup_address: HOTEL_A, return_address: HOTEL_B } });
  assert.equal(other.res.status, 303);
  const b2 = bookingsLib.getByReference(db, other.ref);
  assert.equal(b2.pickup_address, HOTEL_A);
  assert.equal(b2.return_address, HOTEL_B);

  // Σελίδα κράτησης και εκτύπωση.
  const page = await other.agent.get(`/booking/${other.ref}`);
  assert.match(page.text, new RegExp(`Θα σας φέρουμε το αυτοκίνητο στις <strong>[^<]+</strong> στη διεύθυνση «${HOTEL_A}»`));
  assert.match(page.text, new RegExp(`Διεύθυνση παράδοσης: ${HOTEL_A}`));
  assert.match(page.text, new RegExp(`Θα παραλάβουμε το αυτοκίνητο από: ${HOTEL_B}`));
  assert.match(page.text, /Πώς θα μας βρείτε/);
  assert.match(page.text, /Φέρνουμε το αυτοκίνητο στη διεύθυνση που θα μας δώσετε/);
  assert.doesNotMatch(page.text, /Οδηγίες πορείας/, 'ερχόμαστε εμείς: χωρίς κουμπί χάρτη');
  const print = await other.agent.get(`/booking/${other.ref}/print`);
  assert.match(print.text, new RegExp(`Διεύθυνση παράδοσης: ${HOTEL_A}`));
  assert.match(print.text, new RegExp(`Θα παραλάβουμε το αυτοκίνητο από: ${HOTEL_B}`));
  assert.match(print.text, /Πώς θα μας βρείτε/);

  // Emails: επιβεβαίωση στον πελάτη και ειδοποίηση στο γραφείο.
  await h.mailer.flush();
  const confirmation = h.mailer.outbox.filter((m) => m.to === 'giorgos@example.com').pop();
  assert.match(confirmation.html, new RegExp(`Διεύθυνση παράδοσης: ${HOTEL_A}`));
  assert.match(confirmation.html, new RegExp(`Θα παραλάβουμε το αυτοκίνητο από: ${HOTEL_B}`));
  assert.match(confirmation.html, /Πώς θα μας βρείτε/);
  const office = h.mailer.outbox.filter((m) => m.to === 'office@example.gr' && m.subject.includes(other.ref)).pop();
  assert.ok(office, 'ειδοποίηση στο γραφείο');
  assert.match(office.html, new RegExp(`Διεύθυνση παράδοσης: ${HOTEL_A}`));
  assert.match(office.html, new RegExp(`Θα παραλάβουμε το αυτοκίνητο από: ${HOTEL_B}`));

  // Διαχείριση: σελίδα κράτησης και λίστα.
  const aa = await adminAgent(db, app);
  const adminPage = await aa.get(`/admin/bookings/${b2.id}`);
  assert.match(adminPage.text, new RegExp(`Διεύθυνση παράδοσης: ${HOTEL_A}`));
  assert.match(adminPage.text, new RegExp(`Θα παραλάβουμε το αυτοκίνητο από: ${HOTEL_B}`));
  const list = await aa.get('/admin/bookings');
  assert.match(list.text, new RegExp(`<strong>Παράδοση:</strong> ${HOTEL_A}`));
  assert.match(list.text, new RegExp(`<strong>Παραλαβή από:</strong> ${HOTEL_B}`));
});

test('διεύθυνση: δεν αποθηκεύεται για σημεία που δεν τη ζητούν· αριθμοί καρτών αφαιρούνται', async () => {
  const { db, app } = h.setup();
  const office = await book(app, { params: { ...h.searchParams(), pickup_address: HOTEL_A, return_address: HOTEL_B } });
  assert.equal(office.res.status, 303);
  const b1 = bookingsLib.getByReference(db, office.ref);
  assert.equal(b1.pickup_address, null);
  assert.equal(b1.return_address, null);
  // Μόνο η επιστροφή στο ξενοδοχείο: η «ίδια διεύθυνση» δεν ισχύει (δεν υπάρχει διεύθυνση παράδοσης).
  const onlyReturn = h.searchParams({ car: 2, pickupLocation: AIRPORT, returnLocation: HOTEL });
  const bad = await book(app, { params: { ...onlyReturn, return_same_address: '1' } });
  assert.equal(bad.res.status, 422);
  assert.match(bad.res.text, /id="err-return_address"/);
  const ok = await book(app, { params: { ...onlyReturn, return_address: 'Hotel X, card 4242 4242 4242 4242' } });
  assert.equal(ok.res.status, 303);
  const b2 = bookingsLib.getByReference(db, ok.ref);
  assert.equal(b2.pickup_address, null);
  assert.equal(b2.return_address, 'Hotel X, card [αφαιρέθηκε]');
});

test('email επιβεβαίωσης: διεύθυνση και οδηγίες του σημείου επιστροφής, «Οδηγίες πορείας» προς Google Maps', async () => {
  const { db, app } = h.setup();
  db.prepare(`UPDATE locations SET map_url = 'https://maps.app.goo.gl/airport123' WHERE id = ?`).run(AIRPORT);
  const { ref } = await book(app, { params: h.searchParams({ pickupLocation: AIRPORT, returnLocation: PORT }) });
  const booking = bookingsLib.getByReference(db, ref);
  const html = await mailer.render('booking-confirmed', { booking, extras: [] });
  assert.match(html, /Πώς θα μας βρείτε/);
  assert.match(html, /Θα σας περιμένει συνάδελφός μας στην έξοδο των αφίξεων/);
  assert.match(html, /Επιβατικός σταθμός/, 'διεύθυνση του σημείου επιστροφής');
  assert.match(html, /Καλέστε μας περίπου 15 λεπτά πριν φτάσετε στο λιμάνι/, 'οδηγίες επιστροφής');
  assert.match(html, /href="https:\/\/maps\.app\.goo\.gl\/airport123"/, 'ο σύνδεσμος χάρτη του γραφείου');
  assert.match(html, new RegExp(`href="https://www\\.google\\.com/maps/dir/\\?api=1&amp;destination=${encodeURIComponent('Επιβατικός σταθμός')}"`));
  // Ίδιο σημείο παραλαβής και επιστροφής: διεύθυνση και κουμπί μία φορά, και οι οδηγίες επιστροφής.
  const same = await book(app, { params: h.searchParams({ car: 2, pickupLocation: AIRPORT, returnLocation: AIRPORT }) });
  const html2 = await mailer.render('booking-confirmed', { booking: bookingsLib.getByReference(db, same.ref), extras: [] });
  assert.equal((html2.match(/maps\.app\.goo\.gl\/airport123/g) || []).length, 1);
  assert.match(html2, /Καλέστε μας περίπου 15 λεπτά πριν φτάσετε στο αεροδρόμιο/);
});

test('σελίδα «Επικοινωνία»: «Πώς θα μας βρείτε» με όλα τα ενεργά σημεία και «Οδηγίες πορείας»', async () => {
  const { db, app } = h.setup();
  db.prepare('UPDATE locations SET active = 0 WHERE id = ?').run(PORT);
  const res = await h.request(app).get('/contact');
  assert.equal(res.status, 200);
  assert.match(res.text, /Πώς θα μας βρείτε/);
  assert.match(res.text, /Γραφείο - Κέντρο πόλης/);
  assert.match(res.text, /Θα σας περιμένει συνάδελφός μας στην έξοδο των αφίξεων/);
  assert.match(res.text, /Φέρνουμε το αυτοκίνητο στη διεύθυνση που θα μας δώσετε/);
  assert.doesNotMatch(res.text, /Επιβατικός σταθμός/, 'ανενεργό σημείο');
  assert.equal((res.text.match(/Οδηγίες πορείας/g) || []).length, 2, 'γραφείο και αεροδρόμιο (όχι το ξενοδοχείο)');
});

test('διαχείριση σημείων: οδηγίες με υποχρεωτική μετάφραση, έλεγχος συνδέσμου χάρτη, «Ζητείται διεύθυνση από τον πελάτη»', async () => {
  const { db, app } = h.setup();
  const aa = await adminAgent(db, app);
  const page = await aa.get('/admin/locations');
  assert.match(page.text, /Ζητείται διεύθυνση από τον πελάτη/);
  assert.match(page.text, /Οδηγίες παραλαβής \(«Πώς θα μας βρείτε»\)/);
  const loc = db.prepare('SELECT * FROM locations WHERE id = ?').get(OFFICE);
  const fields = {
    name: loc.name, name_en: loc.name_en, name_es: loc.name_es, address: 'Τσιμισκή 12, Θεσσαλονίκη', address_en: 'Tsimiski 12, Thessaloniki',
    address_es: 'Tsimiski 12, Salónica', instructions: 'Ισόγειο, δίπλα στο φαρμακείο.', instructions_en: 'Ground floor, next to the pharmacy.',
    instructions_es: '', return_instructions: '', fee: '0.00', sort_order: '1', active: '1', map_url: 'javascript:alert(1)',
  };
  const bad = await h.post(aa, `/admin/locations/${OFFICE}`, fields, '/admin/locations');
  assert.equal(bad.status, 422);
  assert.match(bad.text, /Ο σύνδεσμος χάρτη πρέπει να ξεκινά με https:\/\//);
  assert.match(bad.text, /Συμπληρώστε και τη μετάφραση στα ισπανικά/);
  assert.match(bad.text, /Ισόγειο, δίπλα στο φαρμακείο\./, 'η φόρμα κρατά ό,τι γράφτηκε');
  assert.equal(db.prepare('SELECT address FROM locations WHERE id = ?').get(OFFICE).address, loc.address, 'δεν αποθηκεύτηκε');

  const ok = await h.post(
    aa,
    `/admin/locations/${OFFICE}`,
    { ...fields, instructions_es: 'Planta baja, junto a la farmacia.', map_url: 'https://maps.app.goo.gl/office1', needs_address: '1' },
    '/admin/locations',
  );
  assert.equal(ok.status, 303);
  const saved = db.prepare('SELECT * FROM locations WHERE id = ?').get(OFFICE);
  assert.equal(saved.instructions_es, 'Planta baja, junto a la farmacia.');
  assert.equal(saved.return_instructions, '');
  assert.equal(saved.map_url, 'https://maps.app.goo.gl/office1');
  assert.equal(saved.needs_address, 1);
  const es = await h.request(app).get(formUrl(h.searchParams(), '/es'));
  assert.match(es.text, /Planta baja, junto a la farmacia\./);
  assert.match(es.text, /Dirección de entrega \(hotel, calle, zona\) \*/, 'το σημείο ζητά πλέον διεύθυνση');
  // Χωρίς το κουτάκι: ο πελάτης δεν γράφει διεύθυνση.
  await h.post(aa, `/admin/locations/${OFFICE}`, { ...fields, instructions_es: 'Planta baja, junto a la farmacia.', map_url: '' }, '/admin/locations');
  assert.equal(db.prepare('SELECT needs_address, map_url FROM locations WHERE id = ?').get(OFFICE).needs_address, 0);
  assert.equal(db.prepare('SELECT map_url FROM locations WHERE id = ?').get(OFFICE).map_url, null);

  // «Μεταφράσεις που λείπουν»: οδηγίες χωρίς μετάφραση (π.χ. από παλιά βάση).
  db.prepare('UPDATE locations SET return_instructions_en = NULL WHERE id = ?').run(AIRPORT);
  const system = await aa.get('/admin/system');
  assert.match(system.text, /Οδηγίες επιστροφής/);
  assert.match(system.text, /href="\/admin\/locations#location-2"/);
  assert.match((await aa.get('/admin/locations')).text, /id="location-2"[\s\S]{0,400}⚠ Λείπει μετάφραση: Οδηγίες επιστροφής/);
});

test('έλεγχος συστήματος: υπενθύμιση για σημεία με την ενδεικτική διεύθυνση της εγκατάστασης', async () => {
  const { db, app } = h.setup();
  const aa = await adminAgent(db, app);
  const before = await aa.get('/admin/system');
  assert.match(before.text, /Σημεία με ενδεικτική διεύθυνση: Γραφείο - Κέντρο πόλης, Αεροδρόμιο, Λιμάνι/);
  assert.match(before.text, /<a class="small" href="\/admin\/locations">Διαχείριση → Σημεία →<\/a>/);
  db.prepare(`UPDATE locations SET address = 'Τσιμισκή 12, Θεσσαλονίκη' WHERE id = ?`).run(OFFICE);
  db.prepare('UPDATE locations SET active = 0 WHERE id = ?').run(PORT);
  assert.match((await aa.get('/admin/system')).text, /Σημεία με ενδεικτική διεύθυνση: Αεροδρόμιο</);
  db.prepare(`UPDATE locations SET address = 'Αερολιμένας Μακεδονία, Αίθουσα αφίξεων' WHERE id = ?`).run(AIRPORT);
  const after = await aa.get('/admin/system');
  assert.doesNotMatch(after.text, /ενδεικτική διεύθυνση:/);
  assert.match(after.text, /Σημεία παραλαβής: χωρίς ενδεικτικές διευθύνσεις/);
});

test('διατήρηση δεδομένων: η διεύθυνση παράδοσης/παραλαβής διαγράφεται μαζί με τα άλλα στοιχεία· στη λήψη δεδομένων και στη διαγραφή λογαριασμού', async () => {
  const { db, app } = h.setup();
  const params = h.searchParams({ pickupLocation: HOTEL, returnLocation: HOTEL });
  const { ref } = await book(app, { params: { ...params, pickup_address: HOTEL_A, return_address: HOTEL_B } });
  const id = bookingsLib.getByReference(db, ref).id;
  db.prepare(`UPDATE bookings SET status = 'completed', pickup_at = '2024-01-05T10:00', return_at = '2024-01-10T10:00' WHERE id = ?`).run(id);
  assert.equal(purgeExpiredPersonalData(db).purged, 1);
  const purged = bookingsLib.getById(db, id);
  assert.equal(purged.pickup_address, null);
  assert.equal(purged.return_address, null);

  // Λογαριασμός: τα στοιχεία στη λήψη δεδομένων· διαγραφή για κράτηση χωρίς πληρωμή.
  const agent = h.agent(app);
  await h.post(agent, '/register', { first_name: 'Ann', last_name: 'Lee', email: 'ann@example.com', password: 'Password123', password_confirm: 'Password123' }, '/register');
  const own = h.searchParams({ car: 3, pickupLocation: HOTEL, returnLocation: HOTEL });
  const mine = await book(app, { agent, params: { ...own, pickup_address: HOTEL_A, return_same_address: '1' }, driver: { email: 'ann@example.com' } });
  assert.equal(mine.res.status, 303);
  const data = JSON.parse((await agent.get('/account/export')).text);
  assert.equal(data.bookings[0].pickup_address, HOTEL_A);
  assert.equal(data.bookings[0].return_address, HOTEL_A);
  db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE reference = ?`).run(mine.ref);
  await h.post(agent, '/account/delete', { current_password: 'Password123' }, '/account');
  const after = bookingsLib.getByReference(db, mine.ref);
  assert.equal(after.pickup_address, null);
  assert.equal(after.return_address, null);
});

for (const locale of ['en', 'es']) {
  const p = (x) => `/${locale}${x}`;
  test(`[${locale}] διεύθυνση παράδοσης και «Πώς θα μας βρείτε» χωρίς ελληνικά: φόρμα, σφάλματα, κράτηση, εκτύπωση, email, επικοινωνία`, async () => {
    const { db, app } = h.setup();
    db.prepare(`UPDATE locations SET map_url = 'https://maps.app.goo.gl/port1' WHERE id = ?`).run(PORT);
    const checks = [];
    const check = (html, where) => checks.push([where, greekIn(html).slice(0, 8)]);
    check((await h.request(app).get(p('/contact'))).text, 'contact');
    let car = 1;
    for (const [pickupLocation, returnLocation] of [[HOTEL, HOTEL], [AIRPORT, PORT], [OFFICE, HOTEL]]) {
      const params = h.searchParams({ car, pickupLocation, returnLocation });
      car += 1;
      const agent = h.agent(app);
      check((await agent.get(formUrl(params, `/${locale}`))).text, `form ${pickupLocation}->${returnLocation}`);
      const driver = { ...LATIN_DRIVER, email: `john${car}@example.com` };
      const bad = await book(app, { agent, prefix: `/${locale}`, params, driver: { ...driver, first_name: '' } });
      assert.equal(bad.res.status, 422);
      check(bad.res.text, `errors ${pickupLocation}->${returnLocation}`);
      const ok = await book(app, { agent, prefix: `/${locale}`, params: { ...params, pickup_address: HOTEL_A, return_address: HOTEL_B }, driver });
      assert.equal(ok.res.status, 303, `${pickupLocation}->${returnLocation}`);
      const show = await agent.get(p(`/booking/${ok.ref}`));
      assert.match(show.text, locale === 'en' ? /How to find us/ : /Cómo encontrarnos/);
      check(show.text, `booking ${pickupLocation}->${returnLocation}`);
      check((await agent.get(p(`/booking/${ok.ref}/print`))).text, `print ${pickupLocation}->${returnLocation}`);
      const booking = bookingsLib.getByReference(db, ok.ref);
      check(await mailer.render('booking-confirmed', { booking, extras: bookingsLib.getExtras(db, booking.id), termsAttached: true }), `email ${pickupLocation}->${returnLocation}`);
    }
    // Μηνύματα σφάλματος της διεύθυνσης.
    const params = h.searchParams({ car: 9, pickupLocation: HOTEL, returnLocation: HOTEL });
    const noAddress = await book(app, { prefix: `/${locale}`, params, driver: LATIN_DRIVER });
    assert.equal(noAddress.res.status, 422);
    assert.match(noAddress.res.text, locale === 'en' ? /Please enter the delivery address \(hotel, street, area\)\./ : /Indique la dirección de entrega \(hotel, calle, zona\)\./);
    check(noAddress.res.text, 'address error');
    const noReturn = await book(app, { prefix: `/${locale}`, params: { ...params, pickup_address: HOTEL_A }, driver: LATIN_DRIVER });
    assert.match(noReturn.res.text, locale === 'en' ? /Please enter the address where we will collect the car\./ : /Indique la dirección donde recogeremos el coche\./);
    check(noReturn.res.text, 'return address error');
    assert.deepEqual(checks.filter(([, leaks]) => leaks.length), []);
  });
}
