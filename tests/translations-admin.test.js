'use strict';

// Διαχείριση: ό,τι γράφει το γραφείο στα ελληνικά και βλέπει ο πελάτης χρειάζεται μετάφραση
// στα αγγλικά και στα ισπανικά· χιλιόμετρα με δομή· μετάβαση παλιών βάσεων.

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { MIGRATIONS, migrate } = require('../src/db');
const mileage = require('../src/lib/mileage');

async function adminAgent(db, app) {
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  return aa;
}

const EXTRA = { name: 'Αλυσίδες χιονιού', description: 'Για χιονισμένους δρόμους', price: '5', pricing: 'per_rental', kind: 'other', max_qty: '1', sort_order: '9', active: '1' };

test('χιλιόμετρα: αναγνώριση παλιού ελεύθερου κειμένου', () => {
  assert.deepEqual(mileage.parse('Απεριόριστα χιλιόμετρα'), { unlimited: true });
  assert.deepEqual(mileage.parse(''), { unlimited: true });
  assert.deepEqual(mileage.parse('200 km/ημέρα'), { limitKm: 200 });
  assert.deepEqual(mileage.parse('200 χλμ. ανά ημέρα'), { limitKm: 200 });
  assert.deepEqual(mileage.parse('Όριο: 250 χλμ. ανά ημέρα'), { limitKm: 250 });
  assert.deepEqual(mileage.parse('1.000 km'), { limitKm: 1000 });
  assert.deepEqual(mileage.parse('150 χλμ συνολικά'), { custom: '150 χλμ συνολικά' });
});

test('μετάβαση 10 σε παλιά βάση: «N χλμ/km» γίνεται όριο, το προεπιλεγμένο μένει απεριόριστο, άλλο κείμενο μένει ως έχει', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (let v = 0; v < 9; v += 1) db.exec(MIGRATIONS[v]);
  db.exec('PRAGMA user_version = 9');
  db.exec(`INSERT INTO locations (id, name) VALUES (1, 'Αεροδρόμιο')`);
  const car = db.prepare(
    `INSERT INTO cars (make, model, year, plate, category, transmission, fuel, seats, doors, daily_rate_cents, mileage_policy)
     VALUES ('Fiat', 'Panda', 2023, ?, 'mini', 'manual', 'petrol', 4, 5, 2500, ?)`,
  );
  car.run('ΝΒΑ1', 'Απεριόριστα χιλιόμετρα');
  car.run('ΝΒΑ2', '200 km/ημέρα');
  car.run('ΝΒΑ3', '150 χλμ συνολικά');
  db.exec(`INSERT INTO bookings (reference, car_id, pickup_location_id, return_location_id, pickup_at, return_at, days, first_name, last_name,
      email, phone, birth_date, license_number, license_country, license_issued, base_cents, total_cents, vat_cents, status, payment_method, terms_accepted_at)
    VALUES ('ABCD2345', 2, 1, 1, '2026-11-01T10:00', '2026-11-03T10:00', 2, 'A', 'B', 'a@b.gr', '+306900000000', '1990-01-01', 'X1', 'GR', '2010-01-01',
      5000, 5000, 968, 'confirmed', 'pay_at_pickup', datetime('now'))`);
  migrate(db);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, MIGRATIONS.length);
  const rows = db.prepare('SELECT plate, mileage_policy, mileage_limit_km FROM cars ORDER BY id').all().map((r) => ({ ...r }));
  assert.deepEqual(rows, [
    { plate: 'ΝΒΑ1', mileage_policy: 'Απεριόριστα χιλιόμετρα', mileage_limit_km: null },
    { plate: 'ΝΒΑ2', mileage_policy: 'Όριο: 200 χλμ. ανά ημέρα', mileage_limit_km: 200 },
    { plate: 'ΝΒΑ3', mileage_policy: '150 χλμ συνολικά', mileage_limit_km: null },
  ]);
  // Η υπάρχουσα κράτηση κρατά τα χιλιόμετρα του αυτοκινήτου της.
  assert.deepEqual({ ...db.prepare('SELECT mileage_policy, mileage_limit_km FROM bookings').get() }, { mileage_policy: 'Όριο: 200 χλμ. ανά ημέρα', mileage_limit_km: 200 });
});

test('πρόσθετα και σημεία: χωρίς αγγλικά/ισπανικά δεν αποθηκεύονται, η φόρμα κρατά ό,τι γράψατε', async () => {
  const { db, app } = h.setup();
  const aa = await adminAgent(db, app);
  const count = () => db.prepare('SELECT COUNT(*) n FROM extras').get().n;
  const before = count();
  const bad = await h.post(aa, '/admin/extras', EXTRA, '/admin/extras');
  assert.equal(bad.status, 422);
  assert.equal(count(), before);
  assert.match(bad.text, /Συμπληρώστε και τη μετάφραση στα αγγλικά — π\.χ\. με DeepL ή Google Translate\./);
  assert.match(bad.text, /Συμπληρώστε και τη μετάφραση στα ισπανικά/);
  assert.match(bad.text, /value="Αλυσίδες χιονιού"/, 'κρατά το όνομα');
  assert.match(bad.text, /value="Για χιονισμένους δρόμους"/, 'κρατά την περιγραφή');
  // Μόνο το όνομα μεταφρασμένο: η ελληνική περιγραφή χρειάζεται κι αυτή μετάφραση.
  const half = await h.post(aa, '/admin/extras', { ...EXTRA, name_en: 'Snow chains', name_es: 'Cadenas para nieve' }, '/admin/extras');
  assert.equal(half.status, 422);
  assert.match(half.text, /value="Snow chains"/);
  const ok = await h.post(
    aa,
    '/admin/extras',
    { ...EXTRA, name_en: 'Snow chains', name_es: 'Cadenas para nieve', description_en: 'For snowy roads', description_es: 'Para carreteras nevadas' },
    '/admin/extras',
  );
  assert.equal(ok.status, 303);
  assert.equal(count(), before + 1);
  const es = await h.request(app).get(`/es/booking/new?${new URLSearchParams(h.searchParams())}`);
  assert.match(es.text, /Cadenas para nieve/);
  assert.match(es.text, /Para carreteras nevadas/);

  // Σημεία: ελληνική διεύθυνση χωρίς μετάφραση.
  const loc = db.prepare('SELECT * FROM locations WHERE id = 2').get();
  const lbad = await h.post(aa, `/admin/locations/${loc.id}`, { name: loc.name, name_en: loc.name_en, name_es: loc.name_es, address: 'Πύλη 3, αφίξεις', address_en: '', address_es: 'Puerta 3, llegadas', fee: '20.00', sort_order: '2', active: '1' }, '/admin/locations');
  assert.equal(lbad.status, 422);
  assert.match(lbad.text, /Συμπληρώστε και τη μετάφραση στα αγγλικά/);
  assert.doesNotMatch(lbad.text, /Συμπληρώστε και τη μετάφραση στα ισπανικά/);
  assert.equal(db.prepare('SELECT address FROM locations WHERE id = 2').get().address, loc.address, 'δεν άλλαξε');
});

test('αυτοκίνητο: περιγραφή χωρίς μετάφραση απορρίπτεται· χιλιόμετρα με όριο· παλιό κείμενο μένει μέχρι να επιλεγεί άλλο', async () => {
  const { db, app } = h.setup();
  const aa = await adminAgent(db, app);
  const car = db.prepare('SELECT * FROM cars WHERE id = 1').get();
  const fields = {
    make: car.make, model: car.model, year: String(car.year), plate: car.plate, category: car.category, transmission: car.transmission,
    fuel: car.fuel, seats: String(car.seats), doors: String(car.doors), luggage: String(car.luggage), daily_rate: '25.00', deposit: '250.00',
    excess: '', min_driver_age: '21', description: car.description, description_en: car.description_en, description_es: car.description_es, active: '1',
  };
  const save = async (extra) => {
    const token = await h.csrf(aa, '/admin/cars/1');
    let req = aa.post('/admin/cars/1').field('_csrf', token);
    for (const [k, v] of Object.entries({ ...fields, ...extra })) req = req.field(k, v);
    return req;
  };
  const noEn = await save({ mileage_mode: 'unlimited', description_en: '' });
  assert.equal(noEn.status, 422);
  assert.match(noEn.text, /Συμπληρώστε και τη μετάφραση στα αγγλικά/);
  const badKm = await save({ mileage_mode: 'limit', mileage_limit_km: '0' });
  assert.equal(badKm.status, 422);
  assert.match(badKm.text, /Συμπληρώστε το όριο σε χιλιόμετρα ανά ημέρα/);
  assert.equal((await save({ mileage_mode: 'limit', mileage_limit_km: '250' })).status, 303);
  assert.deepEqual({ ...db.prepare('SELECT mileage_policy, mileage_limit_km FROM cars WHERE id = 1').get() }, { mileage_policy: 'Όριο: 250 χλμ. ανά ημέρα', mileage_limit_km: 250 });
  assert.match((await h.request(app).get('/en/cars/1')).text, /Limit: 250 km per day/);
  assert.equal((await save({ mileage_mode: 'unlimited' })).status, 303);
  assert.deepEqual({ ...db.prepare('SELECT mileage_policy, mileage_limit_km FROM cars WHERE id = 1').get() }, { mileage_policy: 'Απεριόριστα χιλιόμετρα', mileage_limit_km: null });

  // Παλιό κείμενο που δεν αναγνωρίστηκε: εμφανίζεται ως επιλογή και στις «Μεταφράσεις που λείπουν».
  db.prepare("UPDATE cars SET mileage_policy = '150 χλμ συνολικά', mileage_limit_km = NULL WHERE id = 1").run();
  const form = await aa.get('/admin/cars/1');
  assert.match(form.text, /name="mileage_mode" value="custom" checked/);
  assert.match(form.text, /Παλιό κείμενο: «150 χλμ συνολικά»/);
  assert.equal((await save({ mileage_mode: 'custom', mileage_policy: '150 χλμ συνολικά' })).status, 303);
  assert.equal(db.prepare('SELECT mileage_policy FROM cars WHERE id = 1').get().mileage_policy, '150 χλμ συνολικά');
  const system = await aa.get('/admin/system');
  assert.match(system.text, /Μεταφράσεις που λείπουν/);
  assert.match(system.text, /Χιλιόμετρα: «150 χλμ συνολικά»/);
  assert.match(system.text, /href="\/admin\/cars\/1#mileage"/);
});

test('Έλεγχος συστήματος και λίστες: «Μεταφράσεις που λείπουν» με σύνδεσμο διόρθωσης, ένδειξη στις λίστες', async () => {
  const { db, app } = h.setup();
  const aa = await adminAgent(db, app);
  const clean = await aa.get('/admin/system');
  assert.match(clean.text, /Όλα τα ενεργά αυτοκίνητα, πρόσθετα και σημεία έχουν μετάφραση/);
  db.prepare('UPDATE cars SET description_es = NULL WHERE id = 3').run();
  db.prepare("UPDATE extras SET name_en = '' WHERE id = 2").run();
  db.prepare('UPDATE locations SET address_en = NULL WHERE id = 3').run();
  // Ανενεργό: δεν το βλέπει ο πελάτης, δεν μετράει.
  db.prepare('UPDATE cars SET description_en = NULL, active = 0 WHERE id = 4').run();
  const system = await aa.get('/admin/system');
  assert.match(system.text, /Μεταφράσεις: λείπουν 3/);
  assert.match(system.text, /href="\/admin\/cars\/3"/);
  assert.match(system.text, /href="\/admin\/extras#extra-2"/);
  assert.match(system.text, /href="\/admin\/locations#location-3"/);
  assert.match(system.text, /Λείπει στα ισπανικά\./);
  assert.doesNotMatch(system.text, /href="\/admin\/cars\/4"/);
  assert.match((await aa.get('/admin/cars')).text, /⚠ Λείπει μετάφραση: Περιγραφή/);
  assert.match((await aa.get('/admin/extras')).text, /id="extra-2"[\s\S]{0,400}⚠ Λείπει μετάφραση: Όνομα/);
  assert.match((await aa.get('/admin/locations')).text, /id="location-3"[\s\S]{0,400}⚠ Λείπει μετάφραση: Διεύθυνση/);
});
