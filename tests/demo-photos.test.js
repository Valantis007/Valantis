'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const h = require('./helpers');

// Ψεύτικη Wikipedia / Wikimedia Commons: κάθε άρθρο έχει φωτογραφία, εκτός από το Mini (μη ελεύθερη άδεια).
function fakeWikimedia() {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    requests.push({ path: url.pathname, agent: req.headers['user-agent'] });
    const json = (body) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/wiki') {
      const title = url.searchParams.get('titles') || url.searchParams.get('gsrsearch');
      const name = `${title.replace(/[^A-Za-z0-9]+/g, '_')}.jpg`;
      return json({ query: { pages: [{ title, index: 1, pageimage: name }] } });
    }
    if (url.pathname === '/commons') {
      const file = url.searchParams.get('titles');
      const nonFree = /Mini/.test(file);
      return json({
        query: {
          pages: [{
            title: file,
            imageinfo: [{
              mime: 'image/jpeg',
              thumburl: `http://localhost:${server.address().port}/img/${encodeURIComponent(file)}`,
              url: 'unused',
              descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(file)}`,
              extmetadata: {
                Artist: { value: '<a href="https://example.org/user">Jane &amp; Doe</a>' },
                LicenseShortName: { value: nonFree ? 'Fair use' : 'CC BY-SA 4.0' },
              },
            }],
          }],
        },
      });
    }
    if (url.pathname.startsWith('/img/')) {
      res.setHeader('Content-Type', 'image/jpeg');
      return res.end(jpeg);
    }
    res.statusCode = 404;
    res.end();
  });
  return { server, requests };
}

test('ενδεικτικές φωτογραφίες: λήψη με ελεύθερη άδεια και αναφορά δημιουργού, χωρίς να αγγίζονται δικές σας φωτογραφίες', async (t) => {
  const { server, requests } = fakeWikimedia();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.DEMO_PHOTOS_WIKI_API = `${base}/wiki`;
  process.env.DEMO_PHOTOS_COMMONS_API = `${base}/commons`;
  t.after(() => {
    delete process.env.DEMO_PHOTOS_WIKI_API;
    delete process.env.DEMO_PHOTOS_COMMONS_API;
    server.close();
  });

  const { db, app } = h.setup();
  // Ένα αυτοκίνητο έχει ήδη δική του φωτογραφία: δεν πρέπει να αλλάξει.
  db.prepare("UPDATE cars SET image = '/uploads/own.jpg' WHERE id = 2").run();
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);

  const res = await h.post(aa, '/admin/cars/demo-photos', {}, '/admin/cars');
  assert.equal(res.status, 303);
  const page = await aa.get('/admin/cars');
  assert.match(page.text, /Προστέθηκαν φωτογραφίες σε 9 από 10 αυτοκίνητα/);
  assert.match(page.text, /Χωρίς φωτογραφία: Mini Cooper Cabrio \(δεν βρέθηκε φωτογραφία με ελεύθερη άδεια\)/);
  assert.ok(requests.every((r) => /^CarRentalDemoPhotos\//.test(r.agent)), 'User-Agent για τη Wikimedia');

  const panda = db.prepare('SELECT * FROM cars WHERE id = 1').get();
  assert.match(panda.image, /^\/uploads\/[a-f0-9]{24}\.jpg$/);
  assert.equal(panda.image_credit, 'Jane & Doe · CC BY-SA 4.0 · Wikimedia Commons');
  assert.match(panda.image_source, /^https:\/\/commons\.wikimedia\.org\/wiki\//);
  assert.equal(db.prepare('SELECT image FROM cars WHERE id = 2').get().image, '/uploads/own.jpg');
  assert.match(db.prepare("SELECT image FROM cars WHERE make = 'Mini'").get().image, /^\/img\/cars\//);

  // Το αρχείο σερβίρεται και η αναφορά δημιουργού εμφανίζεται κάτω από τη φωτογραφία, σε κάθε γλώσσα.
  assert.equal((await h.request(app).get(panda.image)).status, 200);
  const el = await h.request(app).get('/cars/1');
  assert.match(el.text, /<figcaption class="photo-credit">Φωτογραφία: <a href="https:\/\/commons\.wikimedia\.org\/wiki\/[^"]+" target="_blank" rel="noopener nofollow">Jane &amp; Doe · CC BY-SA 4.0 · Wikimedia Commons<\/a>/);
  const en = await h.request(app).get('/en/cars/1');
  assert.match(en.text, /<figcaption class="photo-credit">Photo: /);

  // Νέα φωτογραφία από τον διαχειριστή: η αναφορά δημιουργού σβήνει.
  const token = await h.csrf(aa, '/admin/cars/1');
  const car = db.prepare('SELECT * FROM cars WHERE id = 1').get();
  const upload = await aa
    .post('/admin/cars/1')
    .field('_csrf', token)
    .field('make', car.make).field('model', car.model).field('year', String(car.year)).field('plate', car.plate)
    .field('category', car.category).field('transmission', car.transmission).field('fuel', car.fuel)
    .field('seats', String(car.seats)).field('doors', String(car.doors)).field('luggage', String(car.luggage))
    .field('daily_rate', '25.00').field('deposit', '250.00').field('excess', '').field('min_driver_age', '21')
    .field('mileage_policy', car.mileage_policy).field('description', car.description || '').field('active', '1')
    .attach('image', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'own.jpg', contentType: 'image/jpeg' });
  assert.equal(upload.status, 303);
  const after = db.prepare('SELECT image, image_credit, image_source FROM cars WHERE id = 1').get();
  assert.notEqual(after.image, panda.image);
  assert.equal(after.image_credit, null);
  assert.equal(after.image_source, null);

  // Δεύτερη εκτέλεση: μόνο το αυτοκίνητο χωρίς φωτογραφία (Mini) ξαναδοκιμάζεται.
  const before = requests.length;
  await h.post(aa, '/admin/cars/demo-photos', {}, '/admin/cars');
  const second = requests.slice(before);
  assert.equal(second.filter((r) => r.path.startsWith('/img/')).length, 0);
  assert.ok(second.filter((r) => r.path === '/commons').length <= 3, 'μόνο το Mini ξαναδοκιμάζεται');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cars WHERE image LIKE '/img/cars/%'").get().n, 1);
});
