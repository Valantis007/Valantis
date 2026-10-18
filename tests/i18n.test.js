'use strict';

// Γλώσσες: κάθε σελίδα και κάθε email προς πελάτη στα αγγλικά και στα ισπανικά δεν πρέπει
// να περιέχει ελληνικό κείμενο — ούτε στα στοιχεία της επιχείρησης από το .env (μετάφραση ή
// μεταγραφή με λατινικούς χαρακτήρες). Εξαίρεση: το όνομα της γλώσσας στην επιλογή γλώσσας.

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../src/lib/i18n');
const mailer = require('../src/lib/mailer');
const bookingsLib = require('../src/lib/bookings');
const deposits = require('../src/lib/deposits');

const GREEK = /[Ͱ-Ͽἀ-῿]+/;

function allowed() {
  return ['Ελληνικά', 'ΕΛ'];
}

// Επιστρέφει αποσπάσματα με ελληνικό κείμενο (ορατό κείμενο και τιμές attributes).
function greekLeaks(html) {
  let text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  for (const a of allowed()) text = text.split(a).join(' ');
  const leaks = [];
  const re = new RegExp(GREEK.source, 'g');
  let m;
  while ((m = re.exec(text)) && leaks.length < 15) {
    const from = Math.max(0, m.index - 50);
    leaks.push(text.slice(from, m.index + m[0].length + 50).replace(/\s+/g, ' ').trim());
  }
  return leaks;
}

function assertNoGreek(html, where) {
  const leaks = greekLeaks(html);
  assert.equal(leaks.length, 0, `Ελληνικό κείμενο στο ${where}:\n  - ${leaks.join('\n  - ')}`);
}

const LATIN_DRIVER = { first_name: 'John', last_name: 'Smith', email: 'john@example.com', license_country: 'United Kingdom' };

for (const locale of ['en', 'es']) {
  const p = (path) => `/${locale}${path === '/' ? '' : path}`;

  test(`[${locale}] δημόσιες σελίδες χωρίς ελληνικό κείμενο`, async () => {
    const { db, app } = h.setup();
    const search = new URLSearchParams(h.searchParams()).toString();
    // Παράδοση σε ξενοδοχείο (πεδία διεύθυνσης) και αεροδρόμιο → λιμάνι («Πώς θα μας βρείτε»).
    const hotel = new URLSearchParams(h.searchParams({ pickupLocation: 4, returnLocation: 4 })).toString();
    const airportPort = new URLSearchParams(h.searchParams({ pickupLocation: 2, returnLocation: 3 })).toString();
    const pages = [
      '/',
      '/cars',
      `/cars?${search}`,
      '/cars/1',
      `/booking/new?${search}`,
      `/booking/new?${hotel}`,
      `/booking/new?${airportPort}`,
      '/manage',
      '/faq',
      '/contact',
      '/terms',
      '/privacy',
      '/company',
      '/complaints',
      '/login',
      '/register',
      '/forgot-password',
      '/this-page-does-not-exist',
    ];
    const agent = h.agent(app);
    for (const path of pages) {
      const res = await agent.get(p(path));
      assert.ok([200, 404].includes(res.status), `${p(path)} -> ${res.status}`);
      assert.match(res.text, new RegExp(`<html lang="${locale}"`), p(path));
      assertNoGreek(res.text, p(path));
    }
    assert.ok(db);
  });

  test(`[${locale}] κράτηση, σφάλματα φόρμας, σελίδα κράτησης, εκτύπωση, εγγύηση, λογαριασμός`, async (t) => {
    const { db, app } = h.setup();
    const agent = h.agent(app);
    const search = new URLSearchParams(h.searchParams()).toString();
    // Σφάλματα επικύρωσης
    const bad = await h.post(agent, p('/booking'), { ...h.searchParams(), ...h.driver({ ...LATIN_DRIVER, email: 'not-an-email', birth_date: '2010-01-01', terms: '' }) }, p(`/booking/new?${search}`));
    assert.equal(bad.status, 422);
    assertNoGreek(bad.text, `${p('/booking')} (σφάλματα)`);
    // Η επιλογή γλώσσας μετά το POST οδηγεί στη φόρμα (που ανοίγει με GET), όχι στο /booking.
    assert.match(bad.text, /<a href="\/es\/booking\/new\?car_id=1&amp;[^"]*" hreflang="es"/);
    assert.match(bad.text, /<a href="\/booking\/new\?car_id=1&amp;[^"]*" hreflang="el"/);
    // Φόρμα που έληξε (CSRF)
    const expired = await h.agent(app).post(p('/contact')).type('form').send({ name: 'x', _csrf: 'invalid' });
    assert.equal(expired.status, 403);
    assertNoGreek(expired.text, `${p('/contact')} (CSRF)`);
    // Κράτηση
    const ok = await h.post(agent, p('/booking'), { ...h.searchParams(), ...h.driver(LATIN_DRIVER) }, p(`/booking/new?${search}`));
    assert.equal(ok.status, 303);
    assert.match(ok.headers.location, new RegExp(`^/${locale}/booking/`), 'μένει στη γλώσσα');
    const ref = /\/booking\/([A-Z0-9]{8})/.exec(ok.headers.location)[1];
    const booking = bookingsLib.getByReference(db, ref);
    assert.equal(booking.locale, locale);
    for (const path of [`/booking/${ref}`, `/booking/${ref}/print`]) {
      const res = await agent.get(p(path));
      assert.equal(res.status, 200, p(path));
      assertNoGreek(res.text, p(path));
    }
    // Σελίδα εγγύησης (online)
    h.useStripe(t);
    const link = await deposits.createOnlineLink(db, booking.id, { amountCents: booking.deposit_cents, actor: 'test' });
    assert.match(link.url, new RegExp(`/${locale}/deposit/`));
    const dep = await agent.get(p(`/deposit/${link.token}`));
    assert.equal(dep.status, 200);
    assertNoGreek(dep.text, p('/deposit/…'));
    // Λογαριασμός
    const acc = h.agent(app);
    const reg = await h.post(acc, p('/register'), { first_name: 'Ann', last_name: 'Lee', email: 'ann@example.com', password: 'Password123', password_confirm: 'Password123' }, p('/register'));
    assert.equal(reg.status, 303);
    // Κράτηση από τον λογαριασμό: εμφανίζεται στη λίστα, με το σημείο παραλαβής στη γλώσσα.
    const own = h.searchParams({ car: 2 });
    const mine = await h.post(acc, p('/booking'), { ...own, ...h.driver({ ...LATIN_DRIVER, email: 'ann@example.com' }) }, p(`/booking/new?${new URLSearchParams(own)}`));
    assert.equal(mine.status, 303);
    const account = await acc.get(p('/account'));
    assert.equal(account.status, 200);
    assert.ok(account.text.includes(h.bookingRef(mine)), 'η κράτηση εμφανίζεται στον λογαριασμό');
    assertNoGreek(account.text, p('/account'));
    // Παράδοση σε ξενοδοχείο: σφάλμα διεύθυνσης, και κράτηση με διεύθυνση παράδοσης/παραλαβής.
    const hotel = h.searchParams({ car: 3, pickupLocation: 4, returnLocation: 4 });
    const hotelForm = p(`/booking/new?${new URLSearchParams(hotel)}`);
    const noAddress = await h.post(agent, p('/booking'), { ...hotel, ...h.driver(LATIN_DRIVER) }, hotelForm);
    assert.equal(noAddress.status, 422);
    assertNoGreek(noAddress.text, `${p('/booking')} (χωρίς διεύθυνση παράδοσης)`);
    const delivered = await h.post(
      agent,
      p('/booking'),
      { ...hotel, ...h.driver(LATIN_DRIVER), pickup_address: 'Hotel Electra Palace, Aristotelous Sq. 9', return_address: 'Hotel Capsis, Monastiriou 18' },
      hotelForm,
    );
    assert.equal(delivered.status, 303);
    for (const path of [`/booking/${h.bookingRef(delivered)}`, `/booking/${h.bookingRef(delivered)}/print`]) {
      const res = await agent.get(p(path));
      assert.match(res.text, /Hotel Electra Palace/);
      assertNoGreek(res.text, `${p(path)} (ξενοδοχείο)`);
    }
  });

  test(`[${locale}] emails προς τον πελάτη χωρίς ελληνικό κείμενο`, async () => {
    const { db, app } = h.setup();
    const agent = h.agent(app);
    const search = new URLSearchParams(h.searchParams()).toString();
    const seat = db.prepare(`SELECT id FROM extras WHERE kind = 'child_seat' LIMIT 1`).get().id;
    await h.post(agent, p('/booking'), { ...h.searchParams(), ...h.driver(LATIN_DRIVER), [`extra_${seat}`]: '1', child_info: '3 years, 15 kg' }, p(`/booking/new?${search}`));
    const booking = bookingsLib.getById(db, db.prepare('SELECT id FROM bookings ORDER BY id DESC LIMIT 1').get().id);
    const extras = bookingsLib.getExtras(db, booking.id);
    const charge = { id: 1, category: 'damage', description: 'Scratch on rear bumper', evidence: 'Return report 12, photos', amount_cents: 15000, paid_cents: 0, status: 'proposed', consent: null, respond_by: '2026-12-01' };
    const deposit = { id: 1, method: 'stripe', status: 'held', amount_cents: 25000, captured_cents: 0, card_brand: 'visa', card_last4: '4242', funding: 'credit' };
    const data = {
      booking,
      extras,
      charge,
      deposit,
      url: `${i18n.siteUrl(locale)}/deposit/abc`,
      window: deposits.holdWindow(booking),
      capturedCents: 5000,
      releasedCents: 20000,
      charges: [{ ...charge, category: 'fuel', description: 'Missing fuel', paid_cents: 5000, status: 'charged' }],
      outstandingCents: 0,
      unresolved: [],
      refundedCents: 7500,
      refundDueCents: 0,
      amountCents: 7500,
      reason: 'Ακύρωση από τον πελάτη',
      user: { first_name: 'Ann', email: 'ann@example.com', locale },
      link: `${i18n.siteUrl(locale)}/reset-password/abc`,
      message: { name: 'Ann', subject: 'Question', body: 'Hello there, a question.' },
      receivedAt: '16/10/2026 10:00',
      termsAttached: true,
    };
    const templates = [
      'booking-confirmed',
      'booking-cancelled',
      'payment-returned',
      'deposit-link',
      'deposit-held',
      'deposit-settled',
      'charge-added',
      'charge-notice',
      'welcome',
      'password-reset',
      'contact-ack',
      'terms-document',
    ];
    for (const template of templates) {
      const html = await mailer.render(template, data, locale);
      assertNoGreek(html, `email ${template}`);
    }
    // Επιβεβαίωση για παράδοση σε ξενοδοχείο και για αεροδρόμιο → λιμάνι: διευθύνσεις και «Πώς θα μας βρείτε».
    for (const [pickupLocation, returnLocation, car] of [[4, 4, 2], [2, 3, 3]]) {
      const params = h.searchParams({ car, pickupLocation, returnLocation });
      const res = await h.post(
        agent,
        p('/booking'),
        { ...params, ...h.driver({ ...LATIN_DRIVER, email: `john${car}@example.com` }), pickup_address: 'Hotel Electra Palace', return_address: 'Hotel Capsis' },
        p(`/booking/new?${new URLSearchParams(params)}`),
      );
      assert.equal(res.status, 303, `${pickupLocation} → ${returnLocation}`);
      const b = bookingsLib.getByReference(db, h.bookingRef(res));
      const html = await mailer.render('booking-confirmed', { ...data, booking: b, extras: [] }, locale);
      assert.match(html, locale === 'en' ? /How to find us/ : /Cómo encontrarnos/);
      assertNoGreek(html, `email booking-confirmed (${pickupLocation} → ${returnLocation})`);
    }
    // Χρέωση ζημιάς με γραπτή συναίνεση: η συναίνεση αποθηκεύεται στα ελληνικά, εμφανίζεται μεταφρασμένη.
    const consented = { ...charge, status: 'accepted', consent: 'Γραπτή συναίνεση πελάτη: damage report 12, signed' };
    assertNoGreek(await mailer.render('charge-added', { ...data, charge: consented }, locale), 'email charge-added (συναίνεση)');
    // Το θέμα του email επιβεβαίωσης και τα συνημμένα (μετάφραση + ελληνικό πρωτότυπο).
    await h.mailer.flush();
    const mail = h.mailer.outbox.find((m) => m.to === 'john@example.com');
    assert.ok(mail, 'στάλθηκε email επιβεβαίωσης');
    assert.doesNotMatch(mail.subject, GREEK);
    assert.equal(mail.attachments.length, 2);
  });
}

test('γλώσσα: ανακατευθύνσεις, επιλογή γλώσσας, ποσά, η διαχείριση μένει ελληνική', async () => {
  const { db, app } = h.setup();
  const res = await h.request(app).get('/en/cars');
  assert.equal(res.status, 200);
  assert.match(res.text, /hreflang="es" href="https:\/\/rent\.example\.gr\/es\/cars"/);
  assert.match(res.text, /href="\/en\/faq"/);
  const admin = await h.request(app).get('/en/admin');
  assert.equal(admin.status, 301);
  assert.equal(admin.headers.location, '/admin');
  assert.equal(i18n.localizePath('en', '/'), '/en');
  assert.equal(i18n.localizePath('es', '/cars?x=1'), '/es/cars?x=1');
  assert.equal(i18n.localizePath('el', '/en/cars'), '/cars');
  assert.equal(i18n.localizePath('en', 'https://example.com/'), 'https://example.com/');
  assert.equal(i18n.t('en', 'Κράτηση με υποχρέωση πληρωμής'), 'Book with obligation to pay');
  assert.equal(i18n.t('es', 'Κράτηση με υποχρέωση πληρωμής'), 'Reservar con obligación de pago');
  assert.ok(db);
});

test('λεξικά: κάθε αγγλική μετάφραση έχει και ισπανική, με τα ίδια {πεδία}', () => {
  const en = i18n.dictionaries.en;
  const es = i18n.dictionaries.es;
  const fields = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
  const problems = [];
  for (const key of new Set([...Object.keys(en), ...Object.keys(es)])) {
    if (!(key in en)) problems.push(`λείπει en: ${key}`);
    else if (!(key in es)) problems.push(`λείπει es: ${key}`);
    else if (fields(en[key]) !== fields(key) || fields(es[key]) !== fields(key)) problems.push(`διαφορετικά πεδία: ${key}`);
  }
  assert.deepEqual(problems.slice(0, 20), []);
});
