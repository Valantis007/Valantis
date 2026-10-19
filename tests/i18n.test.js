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
    // Σελίδα αυτοκινήτου με τιμή (κάτω μπάρα «… για 3 ημέρες») και φόρμα για 1 ημέρα («Κάλυψη ζημιών», ενικός).
    const carSearch = new URLSearchParams(h.searchParams()).toString().replace('car_id=1&', '');
    const oneDay = new URLSearchParams(h.searchParams({ days: 1 })).toString();
    const pages = [
      '/',
      '/cars',
      `/cars?${search}`,
      '/cars/1',
      `/cars/1?${carSearch}`,
      `/booking/new?${search}`,
      `/booking/new?${oneDay}`,
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

  test(`[${locale}] κάλυψη ζημιών και κάτω μπάρα: όλες οι καταστάσεις χωρίς ελληνικό κείμενο`, async () => {
    const { db, app } = h.setup();
    const fdw = db.prepare("SELECT id FROM extras WHERE kind = 'damage_waiver' ORDER BY sort_order, id").get().id;
    const params = h.searchParams();
    const form = p(`/booking/new?${new URLSearchParams(params)}`);
    const agent = h.agent(app);
    const page = await agent.get(form);
    assert.match(page.text, locale === 'en' ? /Damage cover[\s\S]*Basic cover \(included\)[\s\S]*Full Damage Waiver \(FDW\)/ : /Cobertura de daños[\s\S]*Cobertura básica \(incluida\)[\s\S]*Exención total por daños \(FDW\)/);
    assert.match(page.text, locale === 'en' ? /Summary &amp; finish/ : /Resumen y finalizar/);
    assert.match(page.text, new RegExp(`href="/${locale}/terms#damage"`));
    // Φόρμα που ξαναεμφανίζεται με επιλεγμένη την FDW (σφάλμα επικύρωσης), και με τη βασική.
    for (const value of ['1', '0']) {
      const res = await h.post(agent, p('/booking'), { ...params, ...h.driver({ ...LATIN_DRIVER, email: 'not-an-email' }), [`extra_${fdw}`]: value }, form);
      assert.equal(res.status, 422);
      assertNoGreek(res.text, `${p('/booking')} (σφάλμα, extra_${fdw}=${value})`);
    }
    // Σελίδα αυτοκινήτου: τιμή για 1 ημέρα, χωρίς διαθεσιμότητα.
    const one = h.searchParams({ days: 1 });
    delete one.car_id;
    const oneDay = await agent.get(p(`/cars/1?${new URLSearchParams(one)}`));
    assert.match(oneDay.text, locale === 'en' ? /for 1 day/ : /por 1 día/);
    assertNoGreek(oneDay.text, `${p('/cars/1')} (1 ημέρα)`);
    const ok = await h.post(agent, p('/booking'), { ...params, ...h.driver(LATIN_DRIVER), [`extra_${fdw}`]: '1' }, form);
    assert.equal(ok.status, 303);
    const three = { ...params };
    delete three.car_id;
    const taken = await agent.get(p(`/cars/1?${new URLSearchParams(three)}`));
    assert.match(taken.text, /data-bar-scroll/);
    assertNoGreek(taken.text, `${p('/cars/1')} (μη διαθέσιμο)`);
    // Η κράτηση με FDW (σελίδα, εκτύπωση) και Πλήρης Απαλλαγή με χρέωση ανά ενοικίαση.
    for (const path of [`/booking/${h.bookingRef(ok)}`, `/booking/${h.bookingRef(ok)}/print`]) assertNoGreek((await agent.get(p(path))).text, `${p(path)} (FDW)`);
    db.prepare("UPDATE extras SET pricing = 'per_rental' WHERE id = ?").run(fdw);
    const perRental = await agent.get(p(`/booking/new?${new URLSearchParams(h.searchParams({ car: 2 }))}`));
    assert.match(perRental.text, locale === 'en' ? /per rental/ : /por alquiler/);
    assertNoGreek(perRental.text, `${p('/booking/new')} (FDW ανά ενοικίαση)`);
    assertNoGreek((await agent.get(p('/cars/2'))).text, `${p('/cars/2')} (FDW ανά ενοικίαση)`);
  });

  test(`[${locale}] WhatsApp, «Η κράτησή μου» και αίτημα αλλαγής χωρίς ελληνικό κείμενο`, async (t) => {
    const config = require('../src/config');
    const whatsapp = require('../src/lib/whatsapp');
    const before = config.company.whatsapp;
    config.company.whatsapp = '306941234567';
    t.after(() => {
      config.company.whatsapp = before;
    });
    const { db, app } = h.setup();
    const agent = h.agent(app);
    const params = h.searchParams();
    const ok = await h.post(agent, p('/booking'), { ...params, ...h.driver(LATIN_DRIVER) }, p(`/booking/new?${new URLSearchParams(params)}`));
    const ref = h.bookingRef(ok);
    // Το έτοιμο μήνυμα του WhatsApp (μέσα στον σύνδεσμο, κωδικοποιημένο) ελέγχεται κι αυτό.
    const waTexts = (html) => [...String(html).matchAll(/https:\/\/wa\.me\/\d+\?text=([^"&]+)/g)].map((m) => decodeURIComponent(m[1]));
    const check = (html, where) => {
      assertNoGreek(html, where);
      const texts = waTexts(html);
      for (const text of texts) assertNoGreek(text, `${where} (WhatsApp: ${text})`);
      return texts;
    };
    for (const path of ['/', '/contact', `/contact?kind=change_request&ref=${ref}`, `/booking/${ref}`, `/booking/${ref}/print`, '/privacy', '/cars/1', `/booking/new?${new URLSearchParams(h.searchParams({ car: 2 }))}`]) {
      const res = await agent.get(p(path));
      assert.equal(res.status, 200, p(path));
      assert.ok(check(res.text, p(path)).length > 0, `${p(path)}: σύνδεσμος WhatsApp`);
    }
    // Αίτημα αλλαγής: σφάλμα (χωρίς κωδικό), αποστολή, επιβεβαίωση στη σελίδα της κράτησης.
    const missing = await h.post(h.agent(app), p('/contact'), { name: 'Ann', email: 'ann@example.com', subject: 'Change', body: 'Another pick-up time, please.', kind: 'change_request' }, p('/contact'));
    assert.equal(missing.status, 422);
    check(missing.text, `${p('/contact')} (αίτημα αλλαγής χωρίς κωδικό)`);
    const sent = await h.post(agent, p('/contact'), { name: 'John Smith', email: 'john@example.com', subject: `Change ${ref}`, body: 'Another pick-up time, please.', kind: 'change_request', booking_reference: ref }, p('/contact'));
    assert.equal(sent.headers.location, p(`/booking/${ref}`));
    check((await agent.get(p(`/booking/${ref}`))).text, `${p(`/booking/${ref}`)} (αίτημα αλλαγής στάλθηκε)`);
    // Λάθος σύνδεσμος «Η κράτησή μου» → αναζήτηση κράτησης με μήνυμα.
    const wrong = h.agent(app);
    const tap = await wrong.get(p(`/b/${'x'.repeat(43)}`));
    assert.equal(tap.headers.location, p('/manage'));
    check((await wrong.get(p('/manage'))).text, `${p('/manage')} (σύνδεσμος που έληξε)`);
    // Emails: επιβεβαίωση με «Η κράτησή μου» και WhatsApp, επιβεβαίωση λήψης του αιτήματος αλλαγής.
    await h.mailer.flush();
    const confirmation = h.mailer.outbox.find((m) => m.to === 'john@example.com' && m.subject.includes(ref) && !m.subject.includes('Change'));
    assert.match(confirmation.html, new RegExp(`/${locale}/b/[A-Za-z0-9_-]{43}`));
    assert.ok(check(confirmation.html, 'email επιβεβαίωσης').length > 0);
    const ack = h.mailer.outbox.find((m) => m.to === 'john@example.com' && m.subject.includes('Change'));
    check(ack.html, 'email επιβεβαίωσης λήψης (αίτημα αλλαγής)');
    // Τα έτοιμα μηνύματα του γραφείου στο WhatsApp του πελάτη.
    const booking = bookingsLib.getByReference(db, ref);
    const links = whatsapp.customerLinks(booking).links;
    assert.equal(links.length, 3);
    for (const l of links) assertNoGreek(l.text, `WhatsApp στον πελάτη (${l.code})`);
  });

  test(`[${locale}] πληρωμή με κάρτα που δεν ολοκληρώθηκε: κουμπιά, υπενθύμιση, πληρωμή κατά την παραλαβή, κράτηση που έληξε — χωρίς ελληνικό κείμενο`, async (t) => {
    const config = require('../src/config');
    const { runMaintenance } = require('../src/lib/maintenance');
    const minutes = config.rules.paymentReminderMinutes;
    config.rules.paymentReminderMinutes = 10;
    t.after(() => {
      config.rules.paymentReminderMinutes = minutes;
    });
    const { db, app } = h.setup();
    const fake = h.useStripe(t);
    const settle = async () => {
      for (let i = 0; i < 5; i += 1) {
        await h.mailer.flush();
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    const cardBooking = async (agent, opts, email) => {
      const params = h.searchParams(opts);
      const res = await h.post(agent, p('/booking'), { ...params, ...h.driver({ ...LATIN_DRIVER, email, payment_method: 'card' }) }, p(`/booking/new?${new URLSearchParams(params)}`));
      assert.equal(res.status, 303);
      const b = bookingsLib.getById(db, db.prepare('SELECT id FROM bookings ORDER BY id DESC LIMIT 1').get().id);
      assert.equal(b.status, 'pending_payment');
      assert.equal(b.locale, locale);
      return b;
    };
    const agent = h.agent(app);
    const booking = await cardBooking(agent, {}, 'john@example.com');
    const ref = booking.reference;

    // Η πληρωμή δεν ολοκληρώθηκε: μήνυμα, «Πληρωμή {ποσό}» και «Πληρωμή κατά την παραλαβή».
    const back = await agent.get(p(`/booking/${ref}/payment/cancel`));
    assert.equal(back.headers.location, p(`/booking/${ref}`));
    const pending = await agent.get(p(`/booking/${ref}`));
    assert.match(pending.text, locale === 'en' ? /choose to pay at pick-up/ : /elegir el pago en la recogida/);
    assert.match(pending.text, new RegExp(`action="/${locale}/booking/${ref}/pay-at-pickup"[\\s\\S]*${locale === 'en' ? 'Pay at pick-up' : 'Pago en la recogida'}`));
    assertNoGreek(pending.text, `${p(`/booking/${ref}`)} (περιμένει πληρωμή)`);

    // Email «Η κράτησή σας δεν έχει ολοκληρωθεί» στη γλώσσα της κράτησης.
    db.prepare(`UPDATE bookings SET created_at = datetime('now', '-11 minutes') WHERE id = ?`).run(booking.id);
    await runMaintenance(db, { force: true });
    await settle();
    const reminder = h.mailer.outbox.find((m) => m.to === 'john@example.com' && m.html.includes(`/${locale}/b/`) && !m.attachments);
    assert.ok(reminder, 'στάλθηκε η υπενθύμιση');
    assert.equal(reminder.subject, locale === 'en' ? `Your booking has not been completed - booking ${ref}` : `Su reserva no se ha completado - reserva ${ref}`);
    assert.match(reminder.html, locale === 'en' ? /Pay at pick-up/ : /Pago en la recogida/);
    assertNoGreek(reminder.html, 'email υπενθύμισης πληρωμής');

    // «Πληρωμή κατά την παραλαβή»: η κράτηση επιβεβαιώνεται, μήνυμα και σελίδα στη γλώσσα.
    const switched = await h.post(agent, p(`/booking/${ref}/pay-at-pickup`), {}, p(`/booking/${ref}`));
    assert.equal(switched.headers.location, p(`/booking/${ref}`));
    const confirmed = await agent.get(p(`/booking/${ref}`));
    assert.match(confirmed.text, locale === 'en' ? /Your booking has been confirmed with payment at pick-up/ : /Su reserva se ha confirmado con pago en la recogida/);
    assertNoGreek(confirmed.text, `${p(`/booking/${ref}`)} (μετά την αλλαγή σε πληρωμή κατά την παραλαβή)`);
    await settle();
    const confirmation = h.mailer.outbox.find((m) => m.to === 'john@example.com' && m.attachments);
    assert.ok(confirmation, 'email επιβεβαίωσης');
    assert.doesNotMatch(confirmation.subject, GREEK);
    assertNoGreek(confirmation.html, 'email επιβεβαίωσης (πληρωμή κατά την παραλαβή μετά από κάρτα)');

    // Η πληρωμή με κάρτα ολοκληρώθηκε τελικά: email «Λάβαμε την πληρωμή σας».
    fake.sessions[booking.checkout_id].status = 'open';
    fake.pay(booking.checkout_id);
    const hook = await h.request(app).post('/webhooks/stripe').set('stripe-signature', fake.webhookSecret).set('content-type', 'application/json').send(fake.event('checkout.session.completed', { id: booking.checkout_id }));
    assert.equal(hook.status, 204);
    assert.equal(bookingsLib.getById(db, booking.id).payment_status, 'paid');
    await settle();
    const received = h.mailer.outbox.find((m) => m.to === 'john@example.com' && m.subject.includes(ref) && /payment|pago/i.test(m.subject) && m !== reminder);
    assert.ok(received, 'email «Λάβαμε την πληρωμή σας»');
    assert.doesNotMatch(received.subject, GREEK);
    assertNoGreek(received.html, 'email «Λάβαμε την πληρωμή σας»');
    assertNoGreek((await agent.get(p(`/booking/${ref}`))).text, `${p(`/booking/${ref}`)} (πληρώθηκε μετά την αλλαγή)`);

    // Η πληρωμή είχε ήδη ολοκληρωθεί όταν ο πελάτης πάτησε «Πληρωμή κατά την παραλαβή».
    const paidFirst = await cardBooking(agent, { car: 2 }, 'john2@example.com');
    fake.pay(paidFirst.checkout_id);
    await h.post(agent, p(`/booking/${paidFirst.reference}/pay-at-pickup`), {}, p(`/booking/${paidFirst.reference}`));
    const paidPage = await agent.get(p(`/booking/${paidFirst.reference}`));
    assert.match(paidPage.text, locale === 'en' ? /Your card payment had already been completed/ : /Su pago con tarjeta ya se había completado/);
    assertNoGreek(paidPage.text, `${p('/booking/…')} (η πληρωμή είχε ήδη ολοκληρωθεί)`);

    // Η δέσμευση έληξε: σφάλμα στη γλώσσα και «Κάντε νέα αναζήτηση» με την ίδια αναζήτηση.
    const late = await cardBooking(agent, { car: 3, pickupLocation: 2, returnLocation: 3, pickupTime: '11:30' }, 'john3@example.com');
    db.prepare('UPDATE bookings SET hold_expires_at = ? WHERE id = ?').run(Date.now() - 1000, late.id);
    await h.post(agent, p(`/booking/${late.reference}/pay-at-pickup`), {}, p(`/booking/${late.reference}`));
    const refused = await agent.get(p(`/booking/${late.reference}`));
    assert.match(refused.text, locale === 'en' ? /Payment at pick-up is no longer possible for this booking/ : /El pago en la recogida ya no es posible para esta reserva/);
    assertNoGreek(refused.text, `${p('/booking/…')} (η πληρωμή κατά την παραλαβή δεν είναι πλέον δυνατή)`);
    await runMaintenance(db);
    const expired = await agent.get(p(`/booking/${late.reference}`));
    assert.match(expired.text, new RegExp(`href="/${locale}/cars\\?pickup_location=2&amp;return_location=3&amp;pickup_date=[\\d-]+&amp;pickup_time=11%3A30&amp;`));
    assertNoGreek(expired.text, `${p('/booking/…')} (έληξε)`);
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
      bookingUrl: `${i18n.siteUrl(locale)}/b/abc`,
      // Υπενθύμιση πληρωμής: και οι δύο τρόποι.
      canPayCard: true,
      canPayAtPickup: true,
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
      'payment-reminder',
      'payment-received',
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
