'use strict';

// Γλώσσες: κείμενα που παράγει ο κώδικας (JavaScript του browser, ενδείξεις στη βάση,
// ονόματα αρχείων) εμφανίζονται κι αυτά στη γλώσσα της σελίδας / του email.

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bookingsLib = require('../src/lib/bookings');
const deposits = require('../src/lib/deposits');
const mailer = require('../src/lib/mailer');

const GREEK = /[Ͱ-Ͽἀ-῿]/;
const LATIN_DRIVER = { first_name: 'John', last_name: 'Smith', email: 'john@example.com', license_country: 'United Kingdom' };

function decode(attr) {
  return attr.replace(/&#34;|&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

for (const locale of ['en', 'es']) {
  const p = (x) => `/${locale}${x}`;

  test(`[${locale}] ημερολόγιο και πεδία ημερομηνίας: όλα τα κείμενα του public/js/dates.js έρχονται μεταφρασμένα`, async () => {
    const { app } = h.setup();
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dates.js'), 'utf8');
    const used = [...new Set([...js.matchAll(/texts\.(\w+)/g)].map((m) => m[1]))];
    assert.ok(used.length >= 8, 'βρέθηκαν τα κείμενα του ημερολογίου');
    const search = new URLSearchParams(h.searchParams()).toString();
    for (const page of ['/', '/cars', `/cars?${search}`, `/cars/1?${search}`]) {
      const res = await h.request(app).get(p(page));
      const m = /data-calendar="([^"]*)"/.exec(res.text);
      assert.ok(m, `${page}: data-calendar`);
      const texts = JSON.parse(decode(m[1]));
      for (const key of used) {
        assert.ok(texts[key] && !GREEK.test(texts[key]), `${p(page)}: κείμενο ημερολογίου «${key}» = ${texts[key]}`);
      }
      assert.match(texts.days, /\{n\}/);
    }
    const form = await h.request(app).get(p(`/booking/new?${search}`));
    for (const attr of ['data-dmy', 'data-dmy-invalid', 'data-hint-pickup']) {
      const m = new RegExp(`${attr}="([^"]*)"`).exec(form.text);
      assert.ok(m && m[1] && !GREEK.test(m[1]), `${attr}: ${m && m[1]}`);
    }
  });

  test(`[${locale}] φόρμα κράτησης μετά από σφάλμα: η ένδειξη αφαιρεμένου αριθμού κάρτας στη γλώσσα της σελίδας`, async () => {
    const { app } = h.setup();
    const agent = h.agent(app);
    const search = new URLSearchParams(h.searchParams()).toString();
    const res = await h.post(
      agent,
      p('/booking'),
      { ...h.searchParams(), ...h.driver({ ...LATIN_DRIVER, first_name: '', notes: 'My card 4242 4242 4242 4242 thanks' }) },
      p(`/booking/new?${search}`),
    );
    assert.equal(res.status, 422);
    const notes = /<textarea id="notes"[^>]*>([^<]*)<\/textarea>/.exec(res.text)[1];
    assert.doesNotMatch(notes, /4242/);
    assert.doesNotMatch(notes, GREEK);
  });

  test(`[${locale}] διεύθυνση παράδοσης με αριθμό κάρτας: η ένδειξη αφαιρεμένου αριθμού στη γλώσσα της σελίδας και του email`, async () => {
    const { db, app } = h.setup();
    const agent = h.agent(app);
    const params = h.searchParams({ pickupLocation: 4, returnLocation: 4 });
    const res = await h.post(
      agent,
      p('/booking'),
      { ...params, ...h.driver(LATIN_DRIVER), pickup_address: 'Hotel X, card 4242 4242 4242 4242', return_address: 'Hotel Y, 5555 5555 5555 4444' },
      p(`/booking/new?${new URLSearchParams(params)}`),
    );
    assert.equal(res.status, 303);
    const ref = h.bookingRef(res);
    const removed = locale === 'en' ? '[removed]' : '[eliminado]';
    for (const page of [`/booking/${ref}`, `/booking/${ref}/print`]) {
      const html = (await agent.get(p(page))).text;
      assert.ok(html.includes(`Hotel X, card ${removed}`) && html.includes(`Hotel Y, ${removed}`), p(page));
      assert.doesNotMatch(html, /αφαιρέθηκε|4242 4242/, p(page));
    }
    const booking = bookingsLib.getByReference(db, ref);
    const html = await mailer.render('booking-confirmed', { booking, extras: [] }, locale);
    assert.ok(html.includes(`Hotel X, card ${removed}`), 'email');
    assert.doesNotMatch(html, /αφαιρέθηκε/, 'email');
    // Η διαχείριση μένει ελληνική.
    assert.match(await mailer.render('admin-new-booking', { booking, extras: [] }, 'el'), /Hotel X, card \[αφαιρέθηκε\]/);
  });

  test(`[${locale}] χρέωση ζημιάς πέραν της απαλλαγής: τεκμηρίωση στη σελίδα και στο email χωρίς ελληνικά`, async () => {
    const { db, app } = h.setup();
    const agent = h.agent(app);
    const search = new URLSearchParams(h.searchParams()).toString();
    const res = await h.post(agent, p('/booking'), { ...h.searchParams(), ...h.driver(LATIN_DRIVER) }, p(`/booking/new?${search}`));
    const booking = bookingsLib.getByReference(db, h.bookingRef(res));
    db.prepare(`UPDATE bookings SET status = 'completed' WHERE id = ?`).run(booking.id);
    await h.mailer.flush();
    h.mailer.outbox.length = 0;
    deposits.addCharge(db, booking.id, {
      category: 'damage',
      description: 'Broken mirror',
      amountCents: (booking.excess_cents || 0) + 10000,
      evidence: 'Return report 12',
      beyondExcess: '§7 exclusion',
      actor: 'test',
    });
    const page = await agent.get(p(`/booking/${booking.reference}`));
    assert.match(page.text, /§7 exclusion/);
    assert.doesNotMatch(page.text.replace(/<script[\s\S]*?<\/script>/g, ''), /Πέραν/);
    await h.mailer.flush();
    const mail = h.mailer.outbox.find((m) => m.to === 'john@example.com');
    assert.ok(mail, 'στάλθηκε email για αποδοχή');
    assert.match(mail.html, /§7 exclusion/);
    assert.doesNotMatch(mail.html, /Πέραν/);
  });

  test(`[${locale}] ονόματα αρχείων: όροι στο email και λήψη δεδομένων στη γλώσσα του πελάτη`, async () => {
    const { app } = h.setup();
    const files = await mailer.termsAttachments(locale);
    assert.equal(files.length, 2);
    assert.match(files[0].filename, new RegExp(`-${locale}\\.html$`));
    for (const f of files) assert.doesNotMatch(f.filename, /oroi-enoikiasis/);
    if (locale === 'es') for (const f of files) assert.doesNotMatch(f.filename, /rental|terms|greek/);
    const agent = h.agent(app);
    await h.post(agent, p('/register'), { first_name: 'Ann', last_name: 'Lee', email: 'ann@example.com', password: 'Password123', password_confirm: 'Password123' }, p('/register'));
    const exp = await agent.get(p('/account/export'));
    assert.equal(exp.status, 200);
    assert.doesNotMatch(exp.headers['content-disposition'], /ta-dedomena-mou/);
  });
}

// ---------------------------------------------------------------------------
// «Όλα μεταφρασμένα»: στοιχεία επιχείρησης, χιλιόμετρα, κείμενα του γραφείου.
// ---------------------------------------------------------------------------

const config = require('../src/config');
const companyLib = require('../src/lib/company');
const { transliterate } = require('../src/lib/translit');

// Ορατό κείμενο και attributes (χωρίς scripts/styles), χωρίς το όνομα της γλώσσας στην επιλογή γλώσσας.
function greekIn(html) {
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .split('Ελληνικά').join(' ')
    .split('>ΕΛ<').join('><');
  return (text.match(/.{0,40}[Ͱ-Ͽἀ-῿]+.{0,40}/g) || []).slice(0, 8);
}

// Ελληνικά στοιχεία επιχείρησης όπως θα τα γράψει ο ιδιοκτήτης στο .env (επαναφέρονται μετά το test).
function greekCompany(t, extra = {}) {
  const saved = JSON.parse(JSON.stringify(config.company));
  const savedFrom = config.mail.from;
  Object.assign(config.company, {
    name: 'Βαλάντης Rent a Car',
    legalName: 'Αυτοκίνητα Βαλάντης Ι.Κ.Ε.',
    seat: 'Εγνατία 5, 54625 Θεσσαλονίκη',
    address: 'Τσιμισκή 12, 54624 Θεσσαλονίκη',
    taxOffice: 'ΔΟΥ Α΄ Θεσσαλονίκης',
    vat: '123456789',
    mhte: '0933Ε60000123400',
    phone: '+30 2310 000000',
    email: 'info@example.gr',
    translations: { en: {}, es: {} },
    ...extra,
  });
  config.mail.from = 'Βαλάντης Rent a Car <no-reply@example.gr>';
  t.after(() => {
    for (const key of Object.keys(config.company)) delete config.company[key];
    Object.assign(config.company, saved);
    config.mail.from = savedFrom;
  });
}

test('μεταγραφή ΕΛΟΤ 743 (διαβατήρια): χωρίς ελληνικά γράμματα, με σωστά δίψηφα και κεφαλαία', () => {
  const cases = {
    'Θεσσαλονίκη': 'Thessaloniki',
    'Ι.Κ.Ε.': 'I.K.E.',
    'ΘΕΣΣΑΛΟΝΙΚΗ': 'THESSALONIKI',
    'Οδός 1, 54600 Θεσσαλονίκη': 'Odos 1, 54600 Thessaloniki',
    'Μπάμπης': 'Bampis',
    'Ευαγγελία': 'Evangelia',
    'Ευτυχία': 'Eftychia',
    'Παύλος': 'Pavlos',
    'Γκίκας': 'Gkikas',
    'Αϊδίνη': 'Aidini',
    'Ψυχικό': 'Psychiko',
    'Χαλκιδική': 'Chalkidiki',
    'Α΄ Θεσσαλονίκης': "A' Thessalonikis",
  };
  for (const [greek, latin] of Object.entries(cases)) assert.equal(transliterate(greek), latin, greek);
});

test('στοιχεία επιχείρησης: μετάφραση από το .env, λεξικό για τις προεπιλογές, αλλιώς μεταγραφή — ποτέ ελληνικά', async (t) => {
  greekCompany(t);
  config.company.translations.en.address = 'Tsimiski Street 12, 54624 Thessaloniki, Greece';
  const en = companyLib.forLocale('en');
  assert.equal(en.legalName, 'Aftokinita Valantis I.K.E.');
  assert.equal(en.address, 'Tsimiski Street 12, 54624 Thessaloniki, Greece', 'μετάφραση από COMPANY_ADDRESS_EN');
  assert.equal(en.seat, 'Egnatia 5, 54625 Thessaloniki');
  assert.equal(en.taxOffice, "Tax Office A' Thessalonikis");
  assert.equal(en.mhte, '0933E60000123400');
  assert.equal(en.authority, 'Regional Tourism Service of Central Macedonia - Ministry of Tourism');
  assert.equal(companyLib.forLocale('es').authority, 'Servicio Regional de Turismo de Macedonia Central - Ministerio de Turismo');
  assert.equal(companyLib.forLocale('es').address, 'Tsimiski 12, 54624 Thessaloniki', 'χωρίς _ES: μεταγραφή');
  assert.equal(companyLib.forLocale('el').address, 'Τσιμισκή 12, 54624 Θεσσαλονίκη', 'στα ελληνικά όπως γράφτηκαν');
  assert.deepEqual(companyLib.mailFrom(config.mail.from, 'en'), { name: 'Valantis Rent a Car', address: 'no-reply@example.gr' });
  assert.equal(companyLib.mailFrom(config.mail.from, 'el'), config.mail.from);

  const { db, app } = h.setup();
  const agent = h.agent(app);
  const search = new URLSearchParams(h.searchParams()).toString();
  for (const locale of ['en', 'es']) {
    const p = (x) => `/${locale}${x}`;
    for (const page of ['', '/company', '/terms', '/privacy', '/contact', '/complaints', `/booking/new?${search}`, '/this-page-does-not-exist']) {
      const res = await agent.get(p(page));
      assert.deepEqual(greekIn(res.text), [], `${p(page)}: ελληνικά στα στοιχεία επιχείρησης`);
      assert.match(res.text, /Valantis Rent a Car/, `${p(page)}: διακριτικός τίτλος με λατινικούς`);
    }
    const company = await agent.get(p('/company'));
    assert.match(company.text, /Aftokinita Valantis I\.K\.E\./);
    assert.match(company.text, locale === 'en' ? /Tsimiski Street 12, 54624 Thessaloniki, Greece/ : /Tsimiski 12, 54624 Thessaloniki/);
    // Προσυμβατική ενημέρωση: «Εκμισθωτής» με λατινικούς χαρακτήρες.
    const form = await agent.get(p(`/booking/new?${search}`));
    assert.match(form.text, /Aftokinita Valantis I\.K\.E\./);
    // Κράτηση: σελίδα, εκτύπωση, email (θέμα, αποστολέας, συνημμένα όροι) χωρίς ελληνικά.
    h.mailer.outbox.length = 0;
    const ok = await h.post(agent, p('/booking'), { ...h.searchParams({ car: locale === 'en' ? 2 : 3 }), ...h.driver(LATIN_DRIVER) }, p(`/booking/new?${search}`));
    const ref = h.bookingRef(ok);
    for (const page of [`/booking/${ref}`, `/booking/${ref}/print`]) assert.deepEqual(greekIn((await agent.get(p(page))).text), [], p(page));
    await h.mailer.flush();
    const mail = h.mailer.outbox.find((m) => m.to === 'john@example.com');
    assert.ok(mail, 'email επιβεβαίωσης');
    assert.deepEqual(greekIn(mail.html), [], `email επιβεβαίωσης (${locale})`);
    assert.deepEqual(mail.from, { name: 'Valantis Rent a Car', address: 'no-reply@example.gr' });
    assert.doesNotMatch(mail.subject, /[Ͱ-Ͽ]/);
    assert.deepEqual(greekIn(mail.attachments[0].content), [], 'συνημμένη μετάφραση των όρων');
  }
  // Ελληνικά: τα στοιχεία όπως γράφτηκαν.
  const el = await agent.get('/company');
  assert.match(el.text, /Αυτοκίνητα Βαλάντης Ι\.Κ\.Ε\./);
  assert.match(el.text, /Τσιμισκή 12, 54624 Θεσσαλονίκη/);
  assert.ok(db);
});

test('στοιχεία επιχείρησης χωρίς ρύθμιση: η επωνυμία-υπόδειγμα και η αρμόδια αρχή μεταφράζονται', async () => {
  const { app } = h.setup();
  const en = await h.request(app).get('/en/company');
  assert.match(en.text, /Company name/);
  assert.match(en.text, /Regional Tourism Service of Central Macedonia - Ministry of Tourism/);
  const es = await h.request(app).get('/es/company');
  assert.match(es.text, /Nombre de la empresa/);
  assert.match(es.text, /Servicio Regional de Turismo de Macedonia Central - Ministerio de Turismo/);
});

test('χιλιόμετρα με όριο: μεταφρασμένα στα αποτελέσματα, στη σελίδα, στην προσυμβατική ενημέρωση, στην κράτηση, στην εκτύπωση και στο email', async () => {
  const { db, app } = h.setup();
  db.prepare("UPDATE cars SET mileage_limit_km = 200, mileage_policy = 'Όριο: 200 χλμ. ανά ημέρα' WHERE id = 1").run();
  const search = new URLSearchParams(h.searchParams()).toString();
  const expected = {
    el: ['Όριο: 200 χλμ. ανά ημέρα', 'έως 200 χλμ. ανά ημέρα'],
    en: ['Limit: 200 km per day', 'up to 200 km per day'],
    es: ['Límite: 200 km al día', 'hasta 200 km al día'],
  };
  for (const locale of ['el', 'en', 'es']) {
    const p = (x) => (locale === 'el' ? x : `/${locale}${x}`);
    const [label, inline] = expected[locale];
    const agent = h.agent(app);
    assert.ok((await agent.get(p(`/cars?${search}`))).text.includes(label), `${locale}: αποτελέσματα`);
    assert.ok((await agent.get(p(`/cars/1?${search}`))).text.includes(label), `${locale}: σελίδα αυτοκινήτου`);
    const form = await agent.get(p(`/booking/new?${search}`));
    assert.ok(form.text.includes(inline), `${locale}: προσυμβατική ενημέρωση`);
    if (locale !== 'el') assert.deepEqual(greekIn(form.text), [], `${locale}: φόρμα κράτησης`);
    // Η αρχική δεν υπόσχεται «απεριόριστα χιλιόμετρα» όταν κάποιο αυτοκίνητο έχει όριο.
    assert.doesNotMatch((await agent.get(p('/'))).text, /Απεριόριστα χιλιόμετρα|Unlimited mileage|Kilometraje ilimitado/);
    h.mailer.outbox.length = 0;
    const ok = await h.post(agent, p('/booking'), { ...h.searchParams(), ...h.driver({ ...LATIN_DRIVER, email: `m-${locale}@example.com` }) }, p(`/booking/new?${search}`));
    const ref = h.bookingRef(ok);
    assert.equal(bookingsLib.getByReference(db, ref).mileage_limit_km, 200, 'η κράτηση κρατά το όριο');
    assert.ok((await agent.get(p(`/booking/${ref}`))).text.includes(label), `${locale}: σελίδα κράτησης`);
    assert.ok((await agent.get(p(`/booking/${ref}/print`))).text.includes(label), `${locale}: εκτύπωση`);
    await h.mailer.flush();
    const mail = h.mailer.outbox.find((m) => m.to === `m-${locale}@example.com`);
    assert.ok(mail && mail.html.includes(label), `${locale}: email επιβεβαίωσης`);
    db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE reference = ?`).run(ref);
  }
  // Αλλαγή στο αυτοκίνητο μετά την κράτηση: η κράτηση δείχνει ό,τι γνωστοποιήθηκε.
  db.prepare("UPDATE cars SET mileage_limit_km = NULL, mileage_policy = 'Απεριόριστα χιλιόμετρα' WHERE id = 1").run();
  const last = db.prepare('SELECT reference FROM bookings ORDER BY id DESC LIMIT 1').get().reference;
  assert.equal(bookingsLib.getByReference(db, last).mileage_limit_km, 200);
});

test('ακύρωση από το γραφείο: έτοιμη αιτία στη γλώσσα του πελάτη, σημείωση στη γλώσσα του, ελληνική σημείωση απορρίπτεται', async () => {
  const { db, app } = h.setup();
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  const expected = {
    en: { reason: 'Reason: Breakdown or unavailability of the car', note: 'Note from our office: We will call you to offer another car.', noShow: 'Reason: No-show at pick-up' },
    es: { reason: 'Motivo: Avería o falta de disponibilidad del coche', note: 'Nota de nuestra oficina: Le llamaremos para ofrecerle otro coche.', noShow: 'Motivo: No presentación en la recogida' },
  };
  for (const locale of ['en', 'es']) {
    const p = (x) => `/${locale}${x}`;
    const cust = h.agent(app);
    const book = async (car) => {
      const s = h.searchParams({ car, from: 40 });
      const res = await h.post(cust, p('/booking'), { ...s, ...h.driver(LATIN_DRIVER) }, p(`/booking/new?${new URLSearchParams(s)}`));
      return bookingsLib.getByReference(db, h.bookingRef(res));
    };
    const b = await book(locale === 'en' ? 4 : 5);
    const page = `/admin/bookings/${b.id}`;
    // Η φόρμα δείχνει τη γλώσσα του πελάτη δίπλα στη σημείωση.
    assert.match((await aa.get(page)).text, new RegExp(`Ο πελάτης μιλά ${locale === 'en' ? 'αγγλικά' : 'ισπανικά'} — γράψτε το κείμενο σε αυτή τη γλώσσα`));
    await h.post(aa, `${page}/cancel`, { reason_code: 'car_unavailable', reason_note: 'Θα σας καλέσουμε για άλλο αυτοκίνητο.' }, page);
    assert.equal(bookingsLib.getById(db, b.id).status, 'confirmed', 'ελληνική σημείωση σε ξένο πελάτη: δεν ακυρώνεται');
    const again = await aa.get(page);
    assert.match(again.text, /Θα σας καλέσουμε για άλλο αυτοκίνητο\./, 'η φόρμα κρατά ό,τι γράφτηκε');
    await h.mailer.flush();
    h.mailer.outbox.length = 0;
    const note = expected[locale].note.replace(/^[^:]+: /, '');
    await h.post(aa, `${page}/cancel`, { reason_code: 'car_unavailable', reason_note: note }, page);
    assert.equal(bookingsLib.getById(db, b.id).status, 'cancelled');
    await h.mailer.flush();
    const mail = h.mailer.outbox.find((m) => m.to === 'john@example.com');
    assert.ok(mail, 'email ακύρωσης');
    assert.ok(mail.html.includes(expected[locale].reason), `${locale}: αιτία μεταφρασμένη`);
    assert.ok(mail.html.includes(expected[locale].note), `${locale}: σημείωση του γραφείου`);
    assert.deepEqual(greekIn(mail.html), []);
    // Στο ιστορικό της διαχείρισης: ελληνικά.
    assert.ok(bookingsLib.getEvents(db, b.id).some((e) => e.action === 'cancelled' && e.note === `Βλάβη ή μη διαθεσιμότητα του αυτοκινήτου — ${note}`));
    // Μη εμφάνιση, χωρίς σημείωση· «Άλλος λόγος» χωρίς σημείωση δεν γίνεται δεκτός.
    const b2 = await book(6);
    h.mailer.outbox.length = 0;
    await h.post(aa, `/admin/bookings/${b2.id}/cancel`, { reason_code: 'other', reason_note: '' }, `/admin/bookings/${b2.id}`);
    assert.equal(bookingsLib.getById(db, b2.id).status, 'confirmed');
    await h.post(aa, `/admin/bookings/${b2.id}/cancel`, { reason_code: 'no_show' }, `/admin/bookings/${b2.id}`);
    await h.mailer.flush();
    const mail2 = h.mailer.outbox.find((m) => m.to === 'john@example.com');
    assert.ok(mail2 && mail2.html.includes(expected[locale].noShow), `${locale}: μη εμφάνιση`);
    assert.deepEqual(greekIn(mail2.html), []);
  }
});

test('χρεώσεις του γραφείου: έτοιμη περιγραφή μεταφράζεται, ελεύθερο κείμενο με ελληνικά απορρίπτεται για ξένο πελάτη', async () => {
  const { db, app } = h.setup();
  const admin = await h.createUser(db, { email: 'admin@example.com', role: 'admin' });
  const aa = h.agent(app);
  await h.login(aa, admin);
  const cust = h.agent(app);
  const s = h.searchParams({ car: 2, from: 2, days: 2 });
  const res = await h.post(cust, '/en/booking', { ...s, ...h.driver(LATIN_DRIVER) }, `/en/booking/new?${new URLSearchParams(s)}`);
  const b = bookingsLib.getByReference(db, h.bookingRef(res));
  db.prepare(`UPDATE bookings SET status = 'completed' WHERE id = ?`).run(b.id);
  const page = `/admin/bookings/${b.id}`;
  await h.post(aa, `${page}/charges`, { category: 'fuel', description: 'Έλλειψη καυσίμου', amount: '20' }, page);
  assert.equal(deposits.chargesForBooking(db, b.id).length, 0, 'ελληνικό κείμενο σε πελάτη στα αγγλικά');
  assert.match((await aa.get(page)).text, /Έλλειψη καυσίμου/, 'η φόρμα κρατά ό,τι γράφτηκε');
  // Πινακίδα (ελληνικά κεφαλαία που μοιάζουν με λατινικά): γίνεται δεκτή.
  await h.post(aa, `${page}/charges`, { category: 'cleaning', description: 'Sand inside ΝΒΑ1002', amount: '20' }, page);
  await h.post(aa, `${page}/charges`, { category: 'fuel', description_preset: 'Καύσιμο που έλειπε κατά την επιστροφή', amount: '20' }, page);
  assert.equal(deposits.chargesForBooking(db, b.id).length, 2);
  const view = await cust.get(`/en/booking/${b.reference}`);
  assert.match(view.text, /Fuel missing on return/);
  assert.deepEqual(greekIn(view.text).filter((x) => !/ΝΒΑ1002/.test(x)), []);
});
