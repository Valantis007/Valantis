'use strict';

const express = require('express');
const config = require('../config');
const time = require('../lib/time');
const format = require('../lib/format');
const mailer = require('../lib/mailer');
const { parseSearch, searchQuery } = require('../lib/search');
const { availableCarIds } = require('../lib/availability');
const bookings = require('../lib/bookings');
const deposits = require('../lib/deposits');
const payments = require('../lib/payments');
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
    const featured = db
      .prepare(
        `SELECT * FROM cars WHERE active = 1 AND id IN (
           SELECT MIN(id) FROM cars WHERE active = 1 GROUP BY category)
         ORDER BY daily_rate_cents LIMIT 6`,
      )
      .all();
    res.render('pages/home', {
      title: 'Ενοικίαση αυτοκινήτων',
      locations: locations(),
      search: defaultSearch(),
      featured,
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
    if (!car || !search.ok) return res.status(400).json({ error: 'Μη έγκυρα στοιχεία αναζήτησης.' });
    const quote = bookings.quoteFor(db, { car, search, extras: bookings.parseExtras(db, req.query) });
    res.json({
      days: quote.days,
      total: format.money(quote.totalCents),
      base: format.money(quote.baseCents),
      discount: quote.discountCents ? `-${format.money(quote.discountCents)}` : null,
      discountPercent: quote.discountPercent,
      extras: format.money(quote.extrasCents),
      fees: format.money(quote.feesCents),
      vat: format.money(quote.vatCents),
      deposit: format.money(quote.depositCents),
      excess: format.money(quote.excessCents),
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
    res.render('pages/contact', { title: 'Επικοινωνία', values: { kind }, errors: {} });
  });

  router.get('/company', (req, res) => res.render('pages/company', { title: 'Στοιχεία εταιρείας' }));
  router.get('/complaints', (req, res) => res.render('pages/complaints', { title: 'Παράπονα & επίλυση διαφορών' }));

  router.post('/contact', limits.contact, async (req, res) => {
    const values = {
      name: str(req.body.name, 100),
      email: str(req.body.email, 254),
      phone: str(req.body.phone, 30),
      subject: str(req.body.subject, 150),
      body: str(req.body.body, 4000),
      kind: MESSAGE_KINDS.includes(req.body.kind) ? req.body.kind : 'question',
      booking_reference: str(req.body.booking_reference, 8).toUpperCase().replace(/[^A-Z0-9]/g, ''),
    };
    const errors = {};
    if (!values.name) errors.name = 'Συμπληρώστε το όνομά σας.';
    if (!isEmail(values.email)) errors.email = 'Συμπληρώστε έγκυρο email.';
    if (!values.subject) errors.subject = 'Συμπληρώστε θέμα.';
    if (values.body.length < 10) errors.body = 'Γράψτε το μήνυμά σας (τουλάχιστον 10 χαρακτήρες).';
    // Παγίδα για bots: κρυφό πεδίο που οι άνθρωποι αφήνουν κενό.
    if (req.body.website) return res.redirect('/contact');
    if (Object.keys(errors).length) {
      return res.status(422).render('pages/contact', { title: 'Επικοινωνία', values, errors });
    }
    db.prepare('INSERT INTO messages (name, email, phone, subject, body, kind, booking_reference) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      values.name,
      values.email,
      values.phone || null,
      values.subject,
      values.body,
      values.kind,
      values.booking_reference || null,
    );
    // Επιβεβαίωση λήψης στον πελάτη (υποχρεωτική για παράπονα).
    mailer.sendInBackground({
      to: values.email,
      subject: `Λάβαμε το μήνυμά σας: ${values.subject}`,
      template: 'contact-ack',
      data: { message: values, receivedAt: format.utcTimestamp(new Date().toISOString().replace('T', ' ').slice(0, 19), config.rules.timezone) },
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
        error: err instanceof bookings.BookingError ? err.message : 'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών. Δοκιμάστε ξανά.',
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
