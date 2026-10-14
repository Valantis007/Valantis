'use strict';

const express = require('express');
const config = require('../config');
const payments = require('../lib/payments');
const providers = require('../lib/providers');
const deposits = require('../lib/deposits');
const bookings = require('../lib/bookings');
const format = require('../lib/format');
const { parseSearch, searchQuery } = require('../lib/search');
const { isCarAvailable } = require('../lib/availability');
const { intOrNull, str } = require('../lib/validation');
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

  const actorOf = (req) => (req.user ? `user:${req.user.id}` : 'guest');

  // Κρατήσεις του ίδιου επισκέπτη που περιμένουν πληρωμή για το ίδιο αυτοκίνητο
  // (π.χ. γύρισε πίσω από τη σελίδα πληρωμής για να αλλάξει τρόπο πληρωμής).
  function ownPendingHolds(req, carId) {
    const refs = req.session.bookingAccess || [];
    if (!refs.length) return [];
    return db
      .prepare(
        `SELECT id, reference FROM bookings WHERE status = 'pending_payment' AND car_id = ?
         AND reference IN (${refs.map(() => '?').join(',')})`,
      )
      .all(carId, ...refs);
  }

  function renderForm(req, res, { status = 200, car, search, driver, errors = {}, formError = null, selectedExtras = [] }) {
    const quote = bookings.quoteFor(db, { car, search, extras: selectedExtras });
    const selected = Object.fromEntries(selectedExtras.map((s) => [s.extra.id, s.qty]));
    const query = searchQuery(search.values);
    res.status(status).render('booking/new', {
      title: 'Ολοκλήρωση κράτησης',
      car,
      search,
      query,
      loginUrl: `/login?returnTo=${encodeURIComponent(`/booking/new?car_id=${car.id}&${query}`)}`,
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
      payment_method: providers.onlineEnabled() ? 'card' : 'pay_at_pickup',
    };
  }

  router.get('/new', (req, res) => {
    const car = loadCar(req.query.car_id);
    const search = parseSearch(db, req.query);
    if (!car) return res.redirect('/cars');
    if (!search.ok) {
      req.flash('error', Object.values(search.errors)[0] || 'Επιλέξτε ημερομηνίες και σημεία παραλαβής/επιστροφής.');
      return res.redirect(`/cars/${car.id}?${searchQuery(search.values)}`);
    }
    const own = ownPendingHolds(req, car.id);
    const free =
      isCarAvailable(db, car.id, search.pickupAt, search.returnAt) ||
      own.some((b) => isCarAvailable(db, car.id, search.pickupAt, search.returnAt, { excludeBookingId: b.id }));
    if (!free) {
      req.flash('error', 'Το αυτοκίνητο δεν είναι διαθέσιμο για αυτές τις ημερομηνίες.');
      return res.redirect(`/cars?${searchQuery(search.values)}`);
    }
    renderForm(req, res, { car, search, driver: driverDefaults(req.user) });
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
      paymentEnabled: providers.onlineEnabled(),
      needsChildInfo: selectedExtras.some((x) => x.extra.kind === 'child_seat'),
    });
    if (Object.keys(errors).length) {
      return renderForm(req, res, { status: 422, car, search, driver, errors, selectedExtras });
    }

    // Ο ίδιος επισκέπτης ξαναϋποβάλλει (π.χ. άλλαξε τρόπο πληρωμής): η προηγούμενη
    // κράτηση σε αναμονή πληρωμής ακυρώνεται σιωπηλά για να ελευθερωθεί το αυτοκίνητο.
    for (const own of ownPendingHolds(req, car.id)) {
      try {
        await payments.cancelBooking(db, own.id, { actor: 'system', reason: 'Νέα υποβολή από τον πελάτη', refund: false, notify: false });
      } catch (err) {
        console.warn('[booking] Δεν ακυρώθηκε η προηγούμενη κράτηση:', err.message);
      }
    }

    let booking;
    try {
      // Κρατήσεις που καταχωρεί ο διαχειριστής (π.χ. τηλεφωνικές) δεν συνδέονται με τον δικό του λογαριασμό.
      const userId = req.user && req.user.role !== 'admin' ? req.user.id : null;
      booking = bookings.createBooking(db, { car, search, extras: selectedExtras, driver, userId });
    } catch (err) {
      if (err instanceof bookings.BookingError) {
        return renderForm(req, res, { status: 409, car, search, driver, formError: err.message, selectedExtras });
      }
      throw err;
    }
    grantAccess(req, booking);

    if (booking.payment_method === 'card') {
      try {
        return res.redirect(303, await payments.startRentalPayment(db, booking.id));
      } catch (err) {
        console.error('[payments] Αποτυχία δημιουργίας πληρωμής:', err.message);
        await payments
          .cancelBooking(db, booking.id, { actor: 'system', reason: 'Αποτυχία σύνδεσης με την υπηρεσία πληρωμών', refund: false, notify: false })
          .catch((e) => console.error('[payments]', e.message));
        return renderForm(req, res, {
          status: 502,
          car,
          search,
          driver,
          selectedExtras,
          formError: 'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών. Δοκιμάστε ξανά ή επιλέξτε πληρωμή κατά την παραλαβή.',
        });
      }
    }

    bookings.notifyConfirmed(db, booking);
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
    const charges = deposits.chargesForBooking(db, booking.id).filter((c) => c.status !== 'withdrawn');
    const outstanding = deposits.outstandingCents(db, booking.id);
    res.render('booking/show', {
      title: `Κράτηση ${booking.reference}`,
      booking,
      extras: bookings.getExtras(db, booking.id),
      cancellation: bookings.customerCancellation(booking),
      canPay: booking.status === 'pending_payment' && booking.hold_expires_at > Date.now() && providers.onlineEnabled(),
      deposit: deposits.listForBooking(db, booking.id)[0] || null,
      charges,
      outstanding,
      canPayCharges: outstanding > 0 && !deposits.activeDeposit(db, booking.id) && providers.onlineEnabled(),
      pendingRefundCents: payments.pendingRefundCents(db, booking.id),
    });
  });

  router.post('/:ref/cancel', async (req, res) => {
    const { booking } = req;
    const check = bookings.customerCancellation(booking);
    if (!check.allowed) {
      req.flash('error', check.reason);
      return res.redirect(303, `/booking/${booking.reference}`);
    }
    if (check.late && check.feeCents > 0 && req.body.accept_fee !== '1') {
      req.flash('error', `Επιβεβαιώστε ότι αποδέχεστε τη χρέωση ακύρωσης ${format.money(check.feeCents)}.`);
      return res.redirect(303, `/booking/${booking.reference}`);
    }
    try {
      const refundable = booking.paid_cents - booking.refunded_cents;
      const result = await payments.cancelBooking(db, booking.id, {
        actor: actorOf(req),
        reason: check.feeCents ? `Ακύρωση από τον πελάτη (χρέωση ακύρωσης ${format.money(check.feeCents)})` : 'Ακύρωση από τον πελάτη',
        refundCents: check.feeCents ? Math.max(refundable - check.feeCents, 0) : null,
        refund: refundable - check.feeCents > 0,
      });
      let msg = 'Η κράτηση ακυρώθηκε.';
      if (result.refundedCents) {
        msg += ` Η επιστροφή ${format.money(result.refundedCents)} στην κάρτα σας ξεκίνησε και θα εμφανιστεί σε 5-10 εργάσιμες ημέρες.`;
      }
      if (result.refundPendingCents) {
        msg += ` Η επιστροφή ${format.money(result.refundPendingCents)} καθυστερεί λόγω προσωρινού προβλήματος του παρόχου πληρωμών· θα ολοκληρωθεί αυτόματα μόλις αποκατασταθεί.`;
      }
      if (result.refundDueCents) {
        msg += ` Θα επικοινωνήσουμε μαζί σας για την επιστροφή ${format.money(result.refundDueCents)}.`;
      }
      req.flash('success', msg);
    } catch (err) {
      console.error('[cancel]', err);
      req.flash('error', err instanceof bookings.BookingError ? err.message : 'Δεν ήταν δυνατή η ακύρωση. Επικοινωνήστε μαζί μας.');
    }
    res.redirect(303, `/booking/${booking.reference}`);
  });

  // Νέα προσπάθεια πληρωμής (π.χ. αν ο πελάτης έκλεισε τη σελίδα πληρωμής).
  router.post('/:ref/pay', limits.booking, async (req, res) => {
    const { booking } = req;
    if (booking.status !== 'pending_payment' || !providers.onlineEnabled()) {
      req.flash('error', 'Η πληρωμή δεν είναι πλέον δυνατή για αυτή την κράτηση. Κάντε νέα αναζήτηση.');
      return res.redirect(303, `/booking/${booking.reference}`);
    }
    try {
      return res.redirect(303, await payments.startRentalPayment(db, booking.id));
    } catch (err) {
      console.error('[payments]', err.message);
      req.flash('error', err instanceof bookings.BookingError ? err.message : 'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών. Δοκιμάστε ξανά σε λίγο.');
      return res.redirect(303, `/booking/${booking.reference}`);
    }
  });

  // Επιστροφή από τη σελίδα πληρωμής: η κατάσταση διαβάζεται από τον πάροχο, όχι από το URL.
  async function paymentReturn(req, res) {
    const { booking } = req;
    const sessionId = String(req.query.session_id || '');
    const before = bookings.getById(db, booking.id);
    try {
      const row = sessionId ? payments.getCheckoutRow(db, sessionId) : null;
      if (row && row.booking_id === booking.id) await payments.reconcileCheckout(db, row.id, { actor: 'customer-return' });
      await payments.reconcileBooking(db, booking.id);
    } catch (err) {
      console.error('[payments] Αποτυχία επαλήθευσης πληρωμής:', err.message);
    }
    const fresh = bookings.getById(db, booking.id);
    const returned = db
      .prepare(`SELECT COUNT(*) n FROM checkouts WHERE booking_id = ? AND status IN ('refund_pending', 'refunded') AND updated_at >= ?`)
      .get(booking.id, Date.now() - 15 * 60 * 1000).n;
    if (fresh.status === 'confirmed' && fresh.payment_status === 'paid' && before.payment_status !== 'paid') {
      req.flash('success', 'Η πληρωμή ολοκληρώθηκε και η κράτησή σας επιβεβαιώθηκε! Σας στείλαμε email με τις λεπτομέρειες.');
    } else if (returned) {
      req.flash('error', 'Η πληρωμή σας δεν μπορούσε να αντιστοιχιστεί στην κράτηση (π.χ. είχε ήδη πληρωθεί ή ακυρωθεί) και επιστρέφεται αυτόματα στην κάρτα σας.');
    } else if (fresh.status === 'pending_payment') {
      req.flash('info', 'Η πληρωμή σας επεξεργάζεται. Θα λάβετε email μόλις επιβεβαιωθεί.');
    } else if (deposits.outstandingCents(db, booking.id) === 0 && fresh.payment_status === 'paid') {
      req.flash('success', 'Η πληρωμή καταχωρήθηκε. Ευχαριστούμε!');
    }
    res.redirect(303, `/booking/${booking.reference}`);
  }
  router.get('/:ref/payment/return', paymentReturn);
  router.get('/:ref/payment/success', paymentReturn);

  router.get('/:ref/payment/cancel', (req, res) => {
    req.flash('info', 'Η πληρωμή δεν ολοκληρώθηκε. Το αυτοκίνητο παραμένει δεσμευμένο για λίγα λεπτά — μπορείτε να δοκιμάσετε ξανά.');
    res.redirect(303, `/booking/${req.booking.reference}`);
  });

  // Απάντηση του πελάτη σε χρέωση ζημιάς (αποδοχή ή αμφισβήτηση).
  router.post('/:ref/charges/:chargeId/respond', (req, res) => {
    const decision = req.body.decision;
    if (!['accept', 'dispute'].includes(decision)) {
      req.flash('error', 'Επιλέξτε αποδοχή ή αμφισβήτηση.');
      return res.redirect(303, `/booking/${req.booking.reference}`);
    }
    if (decision === 'accept' && req.body.confirm !== '1') {
      req.flash('error', 'Επιβεβαιώστε ότι αποδέχεστε τη χρέωση.');
      return res.redirect(303, `/booking/${req.booking.reference}`);
    }
    // Η απάντηση καταγράφεται ως συναίνεση του πελάτη: δεν τη δίνει το γραφείο για λογαριασμό του.
    if (req.user && req.user.role === 'admin' && req.user.id !== req.booking.user_id) {
      req.flash('error', 'Η αποδοχή από το γραφείο καταχωρείται από τη διαχείριση, με την περιγραφή της γραπτής συναίνεσης του πελάτη.');
      return res.redirect(303, `/booking/${req.booking.reference}`);
    }
    try {
      deposits.respondToCharge(db, req.booking.id, intOrNull(req.params.chargeId) ?? -1, {
        accept: decision === 'accept',
        note: str(req.body.note, 1000),
        actor: actorOf(req),
      });
      req.flash('success', decision === 'accept' ? 'Ευχαριστούμε. Η αποδοχή σας καταχωρήθηκε.' : 'Η αμφισβήτησή σας καταχωρήθηκε. Θα επικοινωνήσουμε μαζί σας.');
    } catch (err) {
      if (!(err instanceof bookings.BookingError)) throw err;
      req.flash('error', err.message);
    }
    res.redirect(303, `/booking/${req.booking.reference}`);
  });

  // Πληρωμή εκκρεμών χρεώσεων που δεν καλύφθηκαν από την εγγύηση.
  router.post('/:ref/charges/pay', limits.booking, async (req, res) => {
    try {
      return res.redirect(303, await payments.startChargesPayment(db, req.booking.id));
    } catch (err) {
      if (!(err instanceof bookings.BookingError)) console.error('[charges]', err);
      req.flash('error', err instanceof bookings.BookingError ? err.message : 'Δεν ήταν δυνατή η σύνδεση με την υπηρεσία πληρωμών.');
      return res.redirect(303, `/booking/${req.booking.reference}`);
    }
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
