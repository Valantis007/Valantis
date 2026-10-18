'use strict';

const express = require('express');
const config = require('../config');
const time = require('../lib/time');
const format = require('../lib/format');
const mailer = require('../lib/mailer');
const mileage = require('../lib/mileage');
const { parseSearch, searchQuery } = require('../lib/search');
const { availableCarIds } = require('../lib/availability');
const bookings = require('../lib/bookings');
const deposits = require('../lib/deposits');
const payments = require('../lib/payments');
const { msg } = require('../lib/i18n');
const { str, isEmail, intOrNull, checkbox } = require('../lib/validation');
const { limits } = require('../middleware/security');

const SORTS = {
  price_asc: (a, b) => a.sortPrice - b.sortPrice,
  price_desc: (a, b) => b.sortPrice - a.sortPrice,
  seats: (a, b) => b.seats - a.seats || a.sortPrice - b.sortPrice,
};

module.exports = function publicRoutes(db) {
  const router = express.Router();
  const locations = () => db.prepare('SELECT * FROM locations WHERE active = 1 ORDER BY sort_order, name').all();

  // Προτεινόμενες προεπιλογές: παραλαβή αύριο, επιστροφή σε 3 ημέρες.
  function defaultSearch() {
    const today = time.datePart(time.nowLocal());
    return {
      pickup_date: time.addDaysToDate(today, 1),
      pickup_time: '10:00',
      return_date: time.addDaysToDate(today, 4),
      return_time: '10:00',
      pickup_location: '',
      return_location: '',
    };
  }

  router.get('/', (req, res) => {
    const cars = db.prepare('SELECT * FROM cars WHERE active = 1 ORDER BY daily_rate_cents, id').all();
    // Κατηγορίες με την τιμή «από» και ενδεικτικά μοντέλα (με τη σειρά της τιμής).
    const byCategory = new Map();
    for (const car of cars) {
      if (!byCategory.has(car.category)) byCategory.set(car.category, { category: car.category, fromCents: car.daily_rate_cents, models: [], count: 0 });
      const group = byCategory.get(car.category);
      group.count += 1;
      const name = `${car.make} ${car.model}`;
      if (group.models.length < 2 && !group.models.includes(name)) group.models.push(name);
    }
    // Δημοφιλή: το φθηνότερο αυτοκίνητο κάθε κατηγορίας.
    const featured = [...byCategory.keys()].map((category) => cars.find((c) => c.category === category)).slice(0, 4);
    res.render('pages/home', {
      title: 'Ενοικίαση αυτοκινήτων',
      locations: locations(),
      search: defaultSearch(),
      categories: [...byCategory.values()],
      featured,
      carCount: cars.length,
      allUnlimited: cars.length > 0 && cars.every((c) => mileage.isUnlimited(c)),
    });
  });

  router.get('/cars', (req, res) => {
    const search = parseSearch(db, req.query);
    const filters = {
      category: str(req.query.category, 30),
      transmission: str(req.query.transmission, 20),
      seats: intOrNull(req.query.seats),
      sort: Object.hasOwn(SORTS, String(req.query.sort || '')) ? String(req.query.sort) : 'price_asc',
    };
    let cars = db.prepare('SELECT * FROM cars WHERE active = 1').all();
    const categories = [...new Set(cars.map((c) => c.category))];
    if (filters.category) cars = cars.filter((c) => c.category === filters.category);
    if (filters.transmission) cars = cars.filter((c) => c.transmission === filters.transmission);
    if (filters.seats) cars = cars.filter((c) => c.seats >= filters.seats);

    let unavailableCount = 0;
    if (search.ok) {
      const free = availableCarIds(db, search.pickupAt, search.returnAt);
      unavailableCount = cars.filter((c) => !free.has(c.id)).length;
      cars = cars
        .filter((c) => free.has(c.id))
        .map((car) => {
          const quote = bookings.quoteFor(db, { car, search });
          return { ...car, quote, sortPrice: quote.totalCents };
        });
    } else {
      cars = cars.map((car) => ({ ...car, sortPrice: car.daily_rate_cents }));
    }
    cars.sort(SORTS[filters.sort]);

    res.render('pages/cars', {
      title: 'Διαθέσιμα αυτοκίνητα',
      locations: locations(),
      search,
      searchValues: search.provided ? search.values : defaultSearch(),
      errors: search.provided ? search.errors : {},
      query: searchQuery(search.values),
      cars,
      categories,
      filters,
      unavailableCount,
    });
  });

  router.get('/cars/:id', (req, res, next) => {
    const car = db.prepare('SELECT * FROM cars WHERE id = ? AND active = 1').get(intOrNull(req.params.id) ?? -1);
    if (!car) return next();
    const search = parseSearch(db, req.query);
    let quote = null;
    let available = null;
    if (search.ok) {
      available = availableCarIds(db, search.pickupAt, search.returnAt).has(car.id);
      if (available) quote = bookings.quoteFor(db, { car, search });
    }
    res.render('pages/car', {
      title: `${car.make} ${car.model}`,
      car,
      locations: locations(),
      search,
      searchValues: search.provided ? search.values : defaultSearch(),
      errors: search.provided ? search.errors : {},
      query: searchQuery(search.values),
      quote,
      available,
    });
  });

  // Ζωντανός υπολογισμός τιμής στη φόρμα κράτησης (ο server ξαναϋπολογίζει πάντα στην υποβολή).
  router.get('/api/quote', (req, res) => {
    const car = db.prepare('SELECT * FROM cars WHERE id = ? AND active = 1').get(intOrNull(req.query.car_id) ?? -1);
    const search = parseSearch(db, req.query);
    if (!car || !search.ok) return res.status(400).json({ error: req.t('Μη έγκυρα στοιχεία αναζήτησης.') });
    const quote = bookings.quoteFor(db, { car, search, extras: bookings.parseExtras(db, req.query) });
    // Ποσά στη μορφή της γλώσσας της σελίδας (π.χ. «€75.00» στα αγγλικά).
    const { money } = format.forLocale(req.locale);
    res.json({
      days: quote.days,
      total: money(quote.totalCents),
      base: money(quote.baseCents),
      discount: quote.discountCents ? `-${money(quote.discountCents)}` : null,
      discountPercent: quote.discountPercent,
      extras: money(quote.extrasCents),
      fees: money(quote.feesCents),
      vat: money(quote.vatCents),
      deposit: money(quote.depositCents),
      excess: money(quote.excessCents),
      hasWaiver: quote.hasWaiver,
      totalCents: quote.totalCents,
      extrasCents: quote.extrasCents,
      discountCents: quote.discountCents,
    });
  });

  // Αναζήτηση κράτησης για επισκέπτες (χωρίς λογαριασμό).
  router.get('/manage', (req, res) => {
    res.render('pages/manage', { title: 'Διαχείριση κράτησης', values: {}, error: null });
  });

  router.post('/manage', limits.lookup, (req, res) => {
    const values = { reference: str(req.body.reference, 20).toUpperCase(), email: str(req.body.email, 254).toLowerCase() };
    const booking = bookings.getByReference(db, values.reference);
    if (!booking || booking.email.toLowerCase() !== values.email) {
      return res.status(404).render('pages/manage', {
        title: 'Διαχείριση κράτησης',
        values,
        error: 'Δεν βρέθηκε κράτηση με αυτά τα στοιχεία. Ελέγξτε τον κωδικό και το email.',
      });
    }
    req.session.bookingAccess = [...new Set([...(req.session.bookingAccess || []), booking.reference])];
    res.redirect(`/booking/${booking.reference}`);
  });

  const MESSAGE_KINDS = ['question', 'complaint', 'charge_dispute'];

  router.get('/contact', (req, res) => {
    const kind = MESSAGE_KINDS.includes(req.query.kind) ? req.query.kind : 'question';
    res.render('pages/contact', { title: 'Επικοινωνία', values: { kind }, errors: {}, locations: locations() });
  });

  router.get('/company', (req, res) => res.render('pages/company', { title: 'Στοιχεία εταιρείας' }));

  // Αναφορά δημιουργών για φωτογραφίες τρίτων (όπως απαιτούν οι άδειες Creative Commons).
  router.get('/photo-credits', (req, res) => {
    const cars = db
      .prepare('SELECT id, make, model, image, image_credit, image_source FROM cars WHERE active = 1 AND image_credit IS NOT NULL ORDER BY make, model')
      .all();
    res.render('pages/photo-credits', { title: 'Πηγές φωτογραφιών', cars });
  });
  router.get('/complaints', (req, res) => res.render('pages/complaints', { title: 'Παράπονα & επίλυση διαφορών' }));

  router.post('/contact', limits.contact, async (req, res) => {
    const values = {
      name: str(req.body.name, 100),
      email: str(req.body.email, 254),
      phone: str(req.body.phone, 30),
      subject: str(req.body.subject, 150),
      body: str(req.body.body, 4000),
      kind: MESSAGE_KINDS.includes(req.body.kind) ? req.body.kind : 'question',
      booking_reference: str(req.body.booking_reference, 20).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8),
    };
    const errors = {};
    if (!values.name) errors.name = 'Συμπληρώστε το όνομά σας.';
    if (!isEmail(values.email)) errors.email = 'Συμπληρώστε έγκυρο email.';
    if (!values.subject) errors.subject = 'Συμπληρώστε θέμα.';
    if (values.body.length < 10) errors.body = 'Γράψτε το μήνυμά σας (τουλάχιστον 10 χαρακτήρες).';
    // Παγίδα για bots: κρυφό πεδίο που οι άνθρωποι αφήνουν κενό.
    if (req.body.website) return res.redirect('/contact');
    if (Object.keys(errors).length) {
      return res.status(422).render('pages/contact', { title: 'Επικοινωνία', values, errors, locations: locations() });
    }
    db.prepare('INSERT INTO messages (name, email, phone, subject, body, kind, booking_reference, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      values.name,
      values.email,
      values.phone || null,
      values.subject,
      values.body,
      values.kind,
      values.booking_reference || null,
      req.user ? req.user.id : null,
    );
    // Επιβεβαίωση λήψης στον πελάτη (υποχρεωτική για παράπονα), στη γλώσσα της σελίδας.
    mailer.sendInBackground({
      to: values.email,
      subject: msg('Λάβαμε το μήνυμά σας: {subject}', { subject: values.subject }),
      template: 'contact-ack',
      locale: req.locale,
      data: {
        message: values,
        receivedAt: format.forLocale(req.locale).utcTimestamp(new Date().toISOString().replace('T', ' ').slice(0, 19), config.rules.timezone),
      },
    });
    mailer.sendInBackground({
      to: config.mail.adminNotify,
      replyTo: values.email,
      subject: `Νέο μήνυμα: ${values.subject}`,
      template: 'admin-contact',
      data: { message: values },
    });
    req.flash('success', values.kind === 'question' ? 'Λάβαμε το μήνυμά σας. Θα σας απαντήσουμε το συντομότερο.' : 'Λάβαμε το μήνυμά σας. Θα σας απαντήσουμε αιτιολογημένα εντός 15 ημερών.');
    res.redirect('/contact');
  });

  // ---------- Εγγύηση: έγκριση δέσμευσης από τον πελάτη (σύνδεσμος / QR) ----------
  function renderDeposit(res, found, { status = 200, error = null, info = null } = {}) {
    const { deposit, booking } = found;
    res.status(status).render('pages/deposit', {
      title: 'Εγγύηση ενοικίασης',
      deposit,
      booking,
      window: deposits.holdWindow(booking),
      token: res.req.params.token,
      error,
      info,
    });
  }

  // Σύνδεσμος εγγύησης που έκλεισε πριν από 30+ ημέρες δεν εμφανίζει πλέον στοιχεία.
  function findLiveDeposit(token) {
    const found = deposits.findByToken(db, token);
    if (!found || !found.deposit.settled_at) return found;
    const old = db.prepare(`SELECT ? < datetime('now', '-30 days') AS old`).get(found.deposit.settled_at).old;
    return old ? null : found;
  }

  router.get('/deposit/:token', (req, res, next) => {
    const found = findLiveDeposit(req.params.token);
    if (!found) return next();
    renderDeposit(res, found);
  });

  router.post('/deposit/:token', limits.booking, async (req, res, next) => {
    const found = findLiveDeposit(req.params.token);
    if (!found) return next();
    if (!checkbox(req.body.consent)) {
      return renderDeposit(res, found, { status: 422, error: 'Για να συνεχίσετε πρέπει να συμφωνήσετε με τη δέσμευση του ποσού.' });
    }
    try {
      return res.redirect(303, await deposits.startOnlineHold(db, req.params.token));
    } catch (err) {
      if (!(err instanceof bookings.BookingError)) console.error('[deposit]', err);
      return renderDeposit(res, findLiveDeposit(req.params.token), {
        status: 409,
        error: err instanceof bookings.BookingError ? err.i18n || err.message : 'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών. Δοκιμάστε ξανά.',
      });
    }
  });

  router.get('/deposit/:token/return', async (req, res, next) => {
    const found = findLiveDeposit(req.params.token);
    if (!found) return next();
    const rows = db
      .prepare(`SELECT id FROM checkouts WHERE kind = 'deposit' AND ref_id = ? AND status = 'open' ORDER BY created_at DESC`)
      .all(found.deposit.id);
    for (const row of rows) {
      try {
        await payments.reconcileCheckout(db, row.id, { actor: 'customer-return' });
      } catch (err) {
        console.error('[deposit return]', err.message);
      }
    }
    const fresh = findLiveDeposit(req.params.token);
    renderDeposit(res, fresh, {
      info: fresh.deposit.status === 'awaiting' && !fresh.deposit.failure_reason ? 'Η έγκριση επεξεργάζεται. Ανανεώστε τη σελίδα σε λίγο.' : null,
    });
  });

  router.get('/terms', (req, res) => res.render('pages/terms', { title: 'Όροι ενοικίασης' }));
  router.get('/privacy', (req, res) => res.render('pages/privacy', { title: 'Πολιτική απορρήτου' }));
  router.get('/faq', (req, res) => res.render('pages/faq', { title: 'Συχνές ερωτήσεις' }));

  return router;
};
