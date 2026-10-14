'use strict';

const crypto = require('node:crypto');
const config = require('../config');
const time = require('./time');
const { computeQuote } = require('./pricing');
const { isCarAvailable } = require('./availability');
const { transaction } = require('../db');
const { str, isEmail, isPhone, intOrNull, checkbox } = require('./validation');
const mailer = require('./mailer');

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class BookingError extends Error {
  constructor(message, code = 'booking_error') {
    super(message);
    this.code = code;
  }
}

function generateReference(db) {
  for (;;) {
    let ref = '';
    for (let i = 0; i < 8; i += 1) ref += REF_ALPHABET[crypto.randomInt(REF_ALPHABET.length)];
    if (!db.prepare('SELECT 1 FROM bookings WHERE reference = ?').get(ref)) return ref;
  }
}

function activeSeasons(db) {
  return db.prepare('SELECT * FROM seasons').all();
}

function activeExtras(db) {
  return db.prepare('SELECT * FROM extras WHERE active = 1 ORDER BY sort_order, id').all();
}

// Τα πρόσθετα έρχονται από τη φόρμα ως extra_<id>=<ποσότητα>.
function parseExtras(db, input) {
  const selected = [];
  for (const extra of activeExtras(db)) {
    const raw = input[`extra_${extra.id}`];
    let qty = raw === 'on' ? 1 : intOrNull(raw) ?? 0;
    qty = Math.min(Math.max(qty, 0), extra.max_qty);
    if (qty > 0) selected.push({ extra, qty });
  }
  return selected;
}

function quoteFor(db, { car, search, extras = [] }) {
  return computeQuote({
    car,
    pickupAt: search.pickupAt,
    returnAt: search.returnAt,
    pickupLocation: search.pickupLocation,
    returnLocation: search.returnLocation,
    extras,
    seasons: activeSeasons(db),
  });
}

function validateDriver(input, car, pickupAt, { paymentEnabled }) {
  const values = {
    first_name: str(input.first_name, 80),
    last_name: str(input.last_name, 80),
    email: str(input.email, 254).toLowerCase(),
    phone: str(input.phone, 30),
    birth_date: str(input.birth_date, 10),
    license_number: str(input.license_number, 40),
    license_country: str(input.license_country, 60),
    license_issued: str(input.license_issued, 10),
    flight_number: str(input.flight_number, 20),
    notes: str(input.notes, 1000),
    payment_method: str(input.payment_method, 20) || (paymentEnabled ? 'card' : 'pay_at_pickup'),
    terms: checkbox(input.terms),
  };
  const errors = {};
  if (!values.first_name) errors.first_name = 'Συμπληρώστε το όνομα.';
  if (!values.last_name) errors.last_name = 'Συμπληρώστε το επώνυμο.';
  if (!isEmail(values.email)) errors.email = 'Συμπληρώστε έγκυρο email.';
  if (!isPhone(values.phone)) errors.phone = 'Συμπληρώστε έγκυρο τηλέφωνο (π.χ. +30 69XXXXXXXX).';

  const pickupDate = time.datePart(pickupAt);
  if (!time.isValidDate(values.birth_date)) {
    errors.birth_date = 'Συμπληρώστε την ημερομηνία γέννησης.';
  } else {
    const age = time.yearsBetween(values.birth_date, pickupDate);
    if (age < car.min_driver_age) {
      errors.birth_date = `Για αυτό το αυτοκίνητο ο οδηγός πρέπει να είναι τουλάχιστον ${car.min_driver_age} ετών κατά την παραλαβή.`;
    } else if (age > 100) {
      errors.birth_date = 'Ελέγξτε την ημερομηνία γέννησης.';
    }
  }
  if (!values.license_number) errors.license_number = 'Συμπληρώστε τον αριθμό διπλώματος.';
  if (!values.license_country) errors.license_country = 'Συμπληρώστε τη χώρα έκδοσης.';
  if (!time.isValidDate(values.license_issued)) {
    errors.license_issued = 'Συμπληρώστε την ημερομηνία έκδοσης του διπλώματος.';
  } else if (values.license_issued > pickupDate) {
    errors.license_issued = 'Η ημερομηνία έκδοσης δεν μπορεί να είναι μεταγενέστερη της παραλαβής.';
  } else if (time.yearsBetween(values.license_issued, pickupDate) < config.rules.minLicenseYears) {
    errors.license_issued = `Απαιτείται δίπλωμα τουλάχιστον ${config.rules.minLicenseYears} έτους.`;
  }
  if (
    !errors.license_issued &&
    time.isValidDate(values.birth_date) &&
    time.isValidDate(values.license_issued) &&
    values.license_issued < values.birth_date
  ) {
    errors.license_issued = 'Η ημερομηνία έκδοσης είναι πριν τη γέννηση.';
  }
  const allowedMethods = paymentEnabled ? ['card', 'pay_at_pickup'] : ['pay_at_pickup'];
  if (!allowedMethods.includes(values.payment_method)) errors.payment_method = 'Επιλέξτε τρόπο πληρωμής.';
  if (!values.terms) errors.terms = 'Πρέπει να αποδεχθείτε τους όρους ενοικίασης.';
  return { values, errors };
}

function logEvent(db, bookingId, actor, action, note = null) {
  db.prepare('INSERT INTO booking_events (booking_id, actor, action, note) VALUES (?, ?, ?, ?)').run(
    bookingId,
    actor,
    action,
    note,
  );
}

const BOOKING_SELECT = `
  SELECT b.*,
    c.make, c.model, c.year AS car_year, c.plate, c.category, c.transmission, c.fuel, c.seats, c.image,
    pl.name AS pickup_location_name, pl.address AS pickup_location_address,
    rl.name AS return_location_name, rl.address AS return_location_address
  FROM bookings b
  JOIN cars c ON c.id = b.car_id
  JOIN locations pl ON pl.id = b.pickup_location_id
  JOIN locations rl ON rl.id = b.return_location_id`;

function getByReference(db, reference) {
  return db.prepare(`${BOOKING_SELECT} WHERE b.reference = ?`).get(String(reference || '').toUpperCase()) || null;
}

function getById(db, id) {
  return db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(id) || null;
}

function getExtras(db, bookingId) {
  return db.prepare('SELECT * FROM booking_extras WHERE booking_id = ? ORDER BY name').all(bookingId);
}

function getEvents(db, bookingId) {
  return db.prepare('SELECT * FROM booking_events WHERE booking_id = ? ORDER BY id').all(bookingId);
}

/**
 * Δημιουργεί κράτηση. Ο έλεγχος διαθεσιμότητας και η εγγραφή γίνονται
 * στην ίδια συναλλαγή, ώστε να μην μπορεί να γίνει διπλοκράτηση.
 */
function createBooking(db, { car, search, extras, driver, userId = null, nowMs = Date.now() }) {
  return transaction(db, () => {
    const freshCar = db.prepare('SELECT * FROM cars WHERE id = ? AND active = 1').get(car.id);
    if (!freshCar) throw new BookingError('Το αυτοκίνητο δεν είναι πλέον διαθέσιμο.', 'unavailable');
    if (!isCarAvailable(db, freshCar.id, search.pickupAt, search.returnAt, { nowMs })) {
      throw new BookingError(
        'Δυστυχώς το αυτοκίνητο μόλις κρατήθηκε για αυτές τις ημερομηνίες. Δοκιμάστε άλλο αυτοκίνητο.',
        'unavailable',
      );
    }
    const quote = quoteFor(db, { car: freshCar, search, extras });
    const isCard = driver.payment_method === 'card';
    const reference = generateReference(db);
    const holdExpiresAt = isCard ? nowMs + config.rules.paymentHoldMinutes * 60 * 1000 : null;

    const result = db
      .prepare(
        `INSERT INTO bookings (
          reference, user_id, car_id, pickup_location_id, return_location_id, pickup_at, return_at, days,
          first_name, last_name, email, phone, birth_date, license_number, license_country, license_issued,
          flight_number, notes, base_cents, discount_cents, extras_cents, fees_cents, total_cents, vat_cents,
          deposit_cents, status, payment_method, payment_status, hold_expires_at, terms_accepted_at
        ) VALUES (
          :reference, :user_id, :car_id, :pickup_location_id, :return_location_id, :pickup_at, :return_at, :days,
          :first_name, :last_name, :email, :phone, :birth_date, :license_number, :license_country, :license_issued,
          :flight_number, :notes, :base_cents, :discount_cents, :extras_cents, :fees_cents, :total_cents, :vat_cents,
          :deposit_cents, :status, :payment_method, 'unpaid', :hold_expires_at, datetime('now')
        )`,
      )
      .run({
        reference,
        user_id: userId,
        car_id: freshCar.id,
        pickup_location_id: search.pickupLocation.id,
        return_location_id: search.returnLocation.id,
        pickup_at: search.pickupAt,
        return_at: search.returnAt,
        days: quote.days,
        first_name: driver.first_name,
        last_name: driver.last_name,
        email: driver.email,
        phone: driver.phone,
        birth_date: driver.birth_date,
        license_number: driver.license_number,
        license_country: driver.license_country,
        license_issued: driver.license_issued,
        flight_number: driver.flight_number || null,
        notes: driver.notes || null,
        base_cents: quote.baseCents,
        discount_cents: quote.discountCents,
        extras_cents: quote.extrasCents,
        fees_cents: quote.feesCents,
        total_cents: quote.totalCents,
        vat_cents: quote.vatCents,
        deposit_cents: quote.depositCents,
        status: isCard ? 'pending_payment' : 'confirmed',
        payment_method: driver.payment_method,
        hold_expires_at: holdExpiresAt,
      });
    const bookingId = Number(result.lastInsertRowid);
    const insertExtra = db.prepare(
      `INSERT INTO booking_extras (booking_id, extra_id, name, qty, unit_price_cents, pricing, total_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const line of quote.extraLines) {
      insertExtra.run(bookingId, line.extra_id, line.name, line.qty, line.unit_price_cents, line.pricing, line.total_cents);
    }
    logEvent(db, bookingId, userId ? `user:${userId}` : 'guest', 'created', isCard ? 'Αναμονή πληρωμής με κάρτα' : 'Πληρωμή κατά την παραλαβή');
    return getById(db, bookingId);
  });
}

function notifyConfirmed(db, booking) {
  const extras = getExtras(db, booking.id);
  mailer.sendInBackground({
    to: booking.email,
    subject: `Επιβεβαίωση κράτησης ${booking.reference}`,
    template: 'booking-confirmed',
    data: { booking, extras },
  });
  mailer.sendInBackground({
    to: config.mail.adminNotify,
    subject: `Νέα κράτηση ${booking.reference} - ${booking.make} ${booking.model}`,
    template: 'admin-new-booking',
    data: { booking, extras },
  });
}

function hoursUntilPickup(booking, now = time.nowLocal()) {
  return time.minutesBetween(now, booking.pickup_at) / 60;
}

// Πληρωμή που έγινε online (κάρτα μέσω Stripe/Revolut) και μπορεί να επιστραφεί αυτόματα.
function isOnlinePayment(booking) {
  return Boolean(booking.payment_provider && booking.payment_ref && booking.paid_cents > 0);
}

function customerCancellation(booking, now = time.nowLocal()) {
  if (booking.status === 'pending_payment') return { allowed: true };
  if (booking.status !== 'confirmed') return { allowed: false, reason: 'Η κράτηση δεν μπορεί πλέον να ακυρωθεί online.' };
  if (hoursUntilPickup(booking, now) < config.rules.freeCancellationHours) {
    return {
      allowed: false,
      reason: `Η δωρεάν ακύρωση είναι δυνατή έως ${config.rules.freeCancellationHours} ώρες πριν την παραλαβή. Επικοινωνήστε μαζί μας.`,
    };
  }
  return { allowed: true };
}

// Κρατήσεις που δεν πληρώθηκαν εγκαίρως αποδεσμεύουν το αυτοκίνητο.
// Επιστρέφει τα id τους, ώστε να κλείσουν και οι σελίδες πληρωμής στον πάροχο.
function expireStaleHolds(db, nowMs = Date.now()) {
  const stale = db
    .prepare(`SELECT id FROM bookings WHERE status = 'pending_payment' AND hold_expires_at <= ?`)
    .all(nowMs);
  const expired = [];
  for (const { id } of stale) {
    transaction(db, () => {
      const res = db
        .prepare(`UPDATE bookings SET status = 'expired', hold_expires_at = NULL WHERE id = ? AND status = 'pending_payment'`)
        .run(id);
      if (res.changes) {
        logEvent(db, id, 'system', 'expired', 'Δεν ολοκληρώθηκε η πληρωμή εγκαίρως');
        expired.push(id);
      }
    });
  }
  return expired;
}

module.exports = {
  BookingError,
  parseExtras,
  activeExtras,
  quoteFor,
  validateDriver,
  createBooking,
  getByReference,
  getById,
  getExtras,
  getEvents,
  logEvent,
  notifyConfirmed,
  customerCancellation,
  isOnlinePayment,
  expireStaleHolds,
};
