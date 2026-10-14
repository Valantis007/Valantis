'use strict';

const express = require('express');
const config = require('../config');
const payments = require('../lib/payments');
const bookings = require('../lib/bookings');
const { parseSearch, searchQuery } = require('../lib/search');
const { isCarAvailable } = require('../lib/availability');
const { intOrNull } = require('../lib/validation');
const { limits } = require('../middleware/security');

module.exports = function bookingRoutes(db) {
  const router = express.Router();

  function loadCar(id) {
    return db.prepare('SELECT * FROM cars WHERE id = ? AND active = 1').get(intOrNull(id) ?? -1) || null;
  }

  function canView(req, booking) {
    if (!booking) return false;
    if (req.user && (req.user.role === 'admin' || req.user.id === booking.user_id)) return true;
    return (req.session.bookingAccess || []).includes(booking.reference);
  }

  function grantAccess(req, booking) {
    req.session.bookingAccess = [...new Set([...(req.session.bookingAccess || []), booking.reference])];
  }

  function renderForm(res, { status = 200, car, search, driver, errors = {}, formError = null, selectedExtras = [] }) {
    const quote = bookings.quoteFor(db, { car, search, extras: selectedExtras });
    const selected = Object.fromEntries(selectedExtras.map((s) => [s.extra.id, s.qty]));
    res.status(status).render('booking/new', {
      title: 'Ολοκλήρωση κράτησης',
      car,
      search,
      query: searchQuery(search.values),
      extras: bookings.activeExtras(db),
      selected,
      driver,
      errors,
      formError,
      quote,
    });
  }

  function driverDefaults(user) {
    if (user && user.role === 'admin') user = null;
    return {
      first_name: user ? user.first_name : '',
      last_name: user ? user.last_name : '',
      email: user ? user.email : '',
      phone: user ? user.phone || '' : '',
      license_country: 'Ελλάδα',
      payment_method: payments.enabled() ? 'card' : 'pay_at_pickup',
    };
  }

  async function startCardPayment(booking, car) {
    const checkout = await payments.createCheckoutSession(booking, car, booking.hold_expires_at);
    db.prepare('UPDATE bookings SET stripe_session_id = ? WHERE id = ?').run(checkout.id, booking.id);
    return checkout.url;
  }

  router.get('/new', (req, res) => {
    const car = loadCar(req.query.car_id);
    const search = parseSearch(db, req.query);
    if (!car) return res.redirect('/cars');
    if (!search.ok) {
      req.flash('error', Object.values(search.errors)[0] || 'Επιλέξτε ημερομηνίες και σημεία παραλαβής/επιστροφής.');
      return res.redirect(`/cars/${car.id}?${searchQuery(search.values)}`);
    }
    if (!isCarAvailable(db, car.id, search.pickupAt, search.returnAt)) {
      req.flash('error', 'Το αυτοκίνητο δεν είναι διαθέσιμο για αυτές τις ημερομηνίες.');
      return res.redirect(`/cars?${searchQuery(search.values)}`);
    }
    renderForm(res, { car, search, driver: driverDefaults(req.user) });
  });

  router.post('/', limits.booking, async (req, res) => {
    const car = loadCar(req.body.car_id);
    const search = parseSearch(db, req.body);
    if (!car) {
      req.flash('error', 'Το αυτοκίνητο δεν βρέθηκε.');
      return res.redirect('/cars');
    }
    if (!search.ok) {
      req.flash('error', Object.values(search.errors)[0]);
      return res.redirect(`/cars?${searchQuery(search.values)}`);
    }
    const selectedExtras = bookings.parseExtras(db, req.body);
    const { values: driver, errors } = bookings.validateDriver(req.body, car, search.pickupAt, {
      paymentEnabled: payments.enabled(),
    });
    if (Object.keys(errors).length) {
      return renderForm(res, { status: 422, car, search, driver, errors, selectedExtras });
    }

    let booking;
    try {
      // Κρατήσεις που καταχωρεί ο διαχειριστής (π.χ. τηλεφωνικές) δεν συνδέονται με τον δικό του λογαριασμό.
      const userId = req.user && req.user.role !== 'admin' ? req.user.id : null;
      booking = bookings.createBooking(db, { car, search, extras: selectedExtras, driver, userId });
    } catch (err) {
      if (err instanceof bookings.BookingError) {
        return renderForm(res, { status: 409, car, search, driver, formError: err.message, selectedExtras });
      }
      throw err;
    }
    grantAccess(req, booking);

    if (booking.payment_method === 'card') {
      try {
        const url = await startCardPayment(booking, car);
        return res.redirect(303, url);
      } catch (err) {
        console.error('[stripe] Αποτυχία δημιουργίας πληρωμής:', err.message);
        await bookings.cancelBooking(db, booking, { actor: 'system', reason: 'Αποτυχία σύνδεσης με την υπηρεσία πληρωμών', refund: false });
        return renderForm(res, {
          status: 502,
          car,
          search,
          driver,
          selectedExtras,
          formError: 'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών. Δοκιμάστε ξανά ή επιλέξτε πληρωμή κατά την παραλαβή.',
        });
      }
    }

    await bookings.notifyConfirmed(db, booking);
    req.flash('success', 'Η κράτησή σας επιβεβαιώθηκε! Σας στείλαμε email με όλες τις λεπτομέρειες.');
    res.redirect(303, `/booking/${booking.reference}`);
  });

  router.param('ref', (req, res, next, ref) => {
    if (!/^[A-Z0-9]{8}$/i.test(ref)) return next('route');
    const booking = bookings.getByReference(db, ref);
    if (!canView(req, booking)) {
      // Ίδια απάντηση είτε δεν υπάρχει είτε δεν επιτρέπεται, ώστε να μη «διαρρέουν» κωδικοί.
      req.flash('info', 'Για να δείτε την κράτηση, συμπληρώστε τον κωδικό και το email της.');
      return res.redirect('/manage');
    }
    req.booking = booking;
    next();
  });

  router.get('/:ref', (req, res) => {
    const { booking } = req;
    res.render('booking/show', {
      title: `Κράτηση ${booking.reference}`,
      booking,
      extras: bookings.getExtras(db, booking.id),
      cancellation: bookings.customerCancellation(booking),
      canPay: booking.status === 'pending_payment' && booking.hold_expires_at > Date.now() && payments.enabled(),
    });
  });

  router.post('/:ref/cancel', async (req, res) => {
    const { booking } = req;
    const check = bookings.customerCancellation(booking);
    if (!check.allowed) {
      req.flash('error', check.reason);
      return res.redirect(303, `/booking/${booking.reference}`);
    }
    try {
      await bookings.cancelBooking(db, booking, {
        actor: req.user ? `user:${req.user.id}` : 'guest',
        reason: 'Ακύρωση από τον πελάτη',
      });
      req.flash('success', 'Η κράτηση ακυρώθηκε.' + (booking.paid_cents > 0 ? ' Τα χρήματα θα επιστραφούν στην κάρτα σας σε 5-10 εργάσιμες.' : ''));
    } catch (err) {
      console.error('[cancel]', err);
      req.flash('error', 'Δεν ήταν δυνατή η ακύρωση. Επικοινωνήστε μαζί μας.');
    }
    res.redirect(303, `/booking/${booking.reference}`);
  });

  // Νέα προσπάθεια πληρωμής (π.χ. αν ο πελάτης έκλεισε τη σελίδα του Stripe).
  router.post('/:ref/pay', async (req, res) => {
    const { booking } = req;
    if (booking.status !== 'pending_payment' || !(booking.hold_expires_at > Date.now()) || !payments.enabled()) {
      req.flash('error', 'Η πληρωμή δεν είναι πλέον δυνατή για αυτή την κράτηση. Κάντε νέα αναζήτηση.');
      return res.redirect(303, `/booking/${booking.reference}`);
    }
    try {
      const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(booking.car_id);
      return res.redirect(303, await startCardPayment(booking, car));
    } catch (err) {
      console.error('[stripe]', err.message);
      req.flash('error', 'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών. Δοκιμάστε ξανά σε λίγο.');
      return res.redirect(303, `/booking/${booking.reference}`);
    }
  });

  router.get('/:ref/payment/success', async (req, res) => {
    const { booking } = req;
    const sessionId = String(req.query.session_id || '');
    if (booking.payment_status !== 'paid' && sessionId && payments.enabled()) {
      try {
        const checkout = await payments.retrieveSession(sessionId);
        const ref = checkout.metadata && checkout.metadata.booking_reference;
        if (ref === booking.reference && checkout.payment_status === 'paid') {
          const outcome = await bookings.markPaidOnline(db, booking.reference, {
            amountCents: checkout.amount_total,
            paymentIntent: checkout.payment_intent,
            sessionId: checkout.id,
          });
          if (outcome.result === 'conflict') {
            req.flash('error', 'Δυστυχώς το αυτοκίνητο δεν ήταν πλέον διαθέσιμο. Η χρέωση επιστράφηκε στην κάρτα σας.');
            return res.redirect(303, `/booking/${booking.reference}`);
          }
        }
      } catch (err) {
        console.error('[stripe] Αποτυχία επαλήθευσης πληρωμής:', err.message);
      }
    }
    const fresh = bookings.getById(db, booking.id);
    if (fresh.payment_status === 'paid') {
      req.flash('success', 'Η πληρωμή ολοκληρώθηκε και η κράτησή σας επιβεβαιώθηκε! Σας στείλαμε email με τις λεπτομέρειες.');
    } else {
      req.flash('info', 'Η πληρωμή σας επεξεργάζεται. Θα λάβετε email μόλις επιβεβαιωθεί.');
    }
    res.redirect(303, `/booking/${booking.reference}`);
  });

  router.get('/:ref/payment/cancel', (req, res) => {
    req.flash(
      'info',
      `Η πληρωμή δεν ολοκληρώθηκε. Το αυτοκίνητο παραμένει δεσμευμένο για λίγα λεπτά — μπορείτε να δοκιμάσετε ξανά.`,
    );
    res.redirect(303, `/booking/${req.booking.reference}`);
  });

  // Εκτυπώσιμο αντίγραφο / voucher.
  router.get('/:ref/print', (req, res) => {
    res.render('booking/print', {
      title: `Κράτηση ${req.booking.reference}`,
      booking: req.booking,
      extras: bookings.getExtras(db, req.booking.id),
      rules: config.rules,
    });
  });

  return router;
};
