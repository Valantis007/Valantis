'use strict';

const crypto = require('node:crypto');
const config = require('../config');
const time = require('./time');
const { computeQuote } = require('./pricing');
const { isCarAvailable } = require('./availability');
const { transaction } = require('../db');
const { str, isEmail, isPhone, intOrNull, checkbox } = require('./validation');
const mailer = require('./mailer');
const { Msg, msg } = require('./i18n');

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Σφάλμα που βλέπει ο πελάτης. Το `message` μπορεί να είναι Msg (i18n.msg) ώστε να
// μεταφράζεται εκεί όπου εμφανίζεται: req.t(err.i18n || err.message).
class BookingError extends Error {
  constructor(message, code = 'booking_error') {
    super(String(message));
    this.code = code;
    this.i18n = message instanceof Msg ? message : null;
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

// Η Πλήρης Απαλλαγή (FDW) που προσφέρεται ως επιλογή στην «Κάλυψη ζημιών» (απέναντι στη βασική
// κάλυψη): το πρώτο ενεργό πρόσθετο του είδους, κατά σειρά. Τυχόν άλλα του ίδιου είδους μένουν στα «Πρόσθετα».
function damageWaiver(extras) {
  return extras.find((x) => x.kind === 'damage_waiver') || null;
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

// Έλεγχος ΑΦΜ (9 ψηφία με ψηφίο ελέγχου).
function isValidGreekVat(vat) {
  if (!/^\d{9}$/.test(vat) || vat === '000000000') return false;
  let sum = 0;
  for (let i = 0; i < 8; i += 1) sum += Number(vat[i]) * 2 ** (8 - i);
  return (sum % 11) % 10 === Number(vat[8]);
}

function maskCardNumbers(text) {
  return String(text || '').replace(/\b(?:\d[ -]?){13,19}\b/g, '[αφαιρέθηκε]');
}

function validateDriver(input, car, pickupAt, options) {
  const { paymentEnabled } = options;
  const values = {
    first_name: str(input.first_name, 80),
    last_name: str(input.last_name, 80),
    email: str(input.email, 254).toLowerCase(),
    phone: str(input.phone, 30),
    // Μέχρι 20 χαρακτήρες: ένα άκυρο κείμενο δεν κόβεται σε κάτι που μοιάζει έγκυρο.
    birth_date: str(input.birth_date, 20),
    license_number: str(input.license_number, 40),
    license_country: str(input.license_country, 60),
    license_issued: str(input.license_issued, 20),
    flight_number: str(input.flight_number, 20),
    notes: str(input.notes, 1000),
    payment_method: str(input.payment_method, 20) || (paymentEnabled ? 'card' : 'pay_at_pickup'),
    terms: checkbox(input.terms),
    child_info: str(input.child_info, 200),
    invoice: checkbox(input.invoice),
    invoice_vat: str(input.invoice_vat, 12).replace(/\D/g, ''),
    invoice_name: str(input.invoice_name, 150),
    invoice_address: str(input.invoice_address, 200),
    invoice_tax_office: str(input.invoice_tax_office, 80),
    invoice_activity: str(input.invoice_activity, 150),
    // Διεύθυνση παράδοσης/παραλαβής του αυτοκινήτου (σημεία με needs_address, π.χ. ξενοδοχείο).
    pickup_address: str(input.pickup_address, 200),
    return_address: str(input.return_address, 200),
    return_same_address: checkbox(input.return_same_address),
  };
  // Αριθμοί καρτών δεν πρέπει να καταλήγουν σε ελεύθερο κείμενο (PCI DSS).
  values.notes = maskCardNumbers(values.notes);
  values.child_info = maskCardNumbers(values.child_info);
  values.pickup_address = maskCardNumbers(values.pickup_address);
  values.return_address = maskCardNumbers(values.return_address);
  const errors = {};
  if (!values.first_name) errors.first_name = 'Συμπληρώστε το όνομα.';
  if (!values.last_name) errors.last_name = 'Συμπληρώστε το επώνυμο.';
  if (!isEmail(values.email)) errors.email = 'Συμπληρώστε έγκυρο email.';
  if (!isPhone(values.phone)) errors.phone = 'Συμπληρώστε έγκυρο τηλέφωνο (π.χ. +30 69XXXXXXXX).';

  const pickupDate = time.datePart(pickupAt);
  if (!time.isValidDate(values.birth_date)) {
    errors.birth_date = values.birth_date ? 'Μη έγκυρη ημερομηνία' : 'Συμπληρώστε την ημερομηνία γέννησης.';
  } else {
    const age = time.yearsBetween(values.birth_date, pickupDate);
    if (age < car.min_driver_age) {
      errors.birth_date = msg('Για αυτό το αυτοκίνητο ο οδηγός πρέπει να είναι τουλάχιστον {age} ετών κατά την παραλαβή.', { age: car.min_driver_age });
    } else if (age > 100) {
      errors.birth_date = 'Ελέγξτε την ημερομηνία γέννησης.';
    }
  }
  if (!values.license_number) errors.license_number = 'Συμπληρώστε τον αριθμό διπλώματος.';
  if (!values.license_country) errors.license_country = 'Συμπληρώστε τη χώρα έκδοσης.';
  if (!time.isValidDate(values.license_issued)) {
    errors.license_issued = values.license_issued ? 'Μη έγκυρη ημερομηνία' : 'Συμπληρώστε την ημερομηνία έκδοσης του διπλώματος.';
  } else if (values.license_issued > pickupDate) {
    errors.license_issued = 'Η ημερομηνία έκδοσης δεν μπορεί να είναι μεταγενέστερη της παραλαβής.';
  } else if (time.yearsBetween(values.license_issued, pickupDate) < config.rules.minLicenseYears) {
    const years = config.rules.minLicenseYears;
    errors.license_issued = msg(years === 1 ? 'Απαιτείται δίπλωμα τουλάχιστον {years} έτους.' : 'Απαιτείται δίπλωμα τουλάχιστον {years} ετών.', { years });
  }
  if (
    !errors.license_issued &&
    time.isValidDate(values.birth_date) &&
    time.isValidDate(values.license_issued) &&
    values.license_issued < values.birth_date
  ) {
    errors.license_issued = 'Η ημερομηνία έκδοσης είναι πριν τη γέννηση.';
  }
  if (options.needsChildInfo && !values.child_info) {
    errors.child_info = 'Συμπληρώστε ηλικία και βάρος του παιδιού, ώστε να σας δώσουμε το κατάλληλο κάθισμα.';
  }
  // Σημεία όπου φέρνουμε/παραλαμβάνουμε εμείς το αυτοκίνητο: η διεύθυνση είναι υποχρεωτική.
  // Σε άλλα σημεία δεν αποθηκεύεται (ούτε αν έμεινε στη φόρμα από προηγούμενη επιλογή).
  const usable = (address) => address.replace(/\[αφαιρέθηκε\]/g, '').trim().length >= 3;
  if (!options.pickupNeedsAddress) values.pickup_address = '';
  else if (!usable(values.pickup_address)) errors.pickup_address = 'Συμπληρώστε τη διεύθυνση παράδοσης (ξενοδοχείο, οδός, περιοχή).';
  if (!options.returnNeedsAddress) {
    values.return_address = '';
  } else if (options.pickupNeedsAddress && values.return_same_address) {
    // «Ίδια με τη διεύθυνση παράδοσης»: παραλαμβάνουμε από εκεί που το φέραμε.
    values.return_address = values.pickup_address;
  } else if (!usable(values.return_address)) {
    errors.return_address = 'Συμπληρώστε τη διεύθυνση από όπου θα παραλάβουμε το αυτοκίνητο.';
  }
  if (values.invoice) {
    if (!isValidGreekVat(values.invoice_vat)) errors.invoice_vat = 'Μη έγκυρος ΑΦΜ.';
    if (!values.invoice_name) errors.invoice_name = 'Συμπληρώστε την επωνυμία.';
    if (!values.invoice_address) errors.invoice_address = 'Συμπληρώστε τη διεύθυνση.';
    if (!values.invoice_tax_office) errors.invoice_tax_office = 'Συμπληρώστε τη ΔΟΥ.';
    if (!values.invoice_activity) errors.invoice_activity = 'Συμπληρώστε τη δραστηριότητα.';
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
    c.mileage_policy AS car_mileage_policy, c.mileage_limit_km AS car_mileage_limit_km,
    pl.name AS pickup_location_name, pl.address AS pickup_location_address,
    pl.name_en AS pickup_location_name_en, pl.name_es AS pickup_location_name_es,
    pl.address_en AS pickup_location_address_en, pl.address_es AS pickup_location_address_es,
    rl.name AS return_location_name, rl.address AS return_location_address,
    rl.name_en AS return_location_name_en, rl.name_es AS return_location_name_es,
    rl.address_en AS return_location_address_en, rl.address_es AS return_location_address_es,
    -- «Πώς θα μας βρείτε» (src/lib/places.js): οδηγίες παραλαβής/επιστροφής, χάρτης, διεύθυνση πελάτη.
    pl.instructions AS pickup_location_instructions, pl.instructions_en AS pickup_location_instructions_en,
    pl.instructions_es AS pickup_location_instructions_es, pl.map_url AS pickup_location_map_url,
    pl.needs_address AS pickup_location_needs_address,
    rl.return_instructions AS return_location_return_instructions, rl.return_instructions_en AS return_location_return_instructions_en,
    rl.return_instructions_es AS return_location_return_instructions_es, rl.map_url AS return_location_map_url,
    rl.needs_address AS return_location_needs_address
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

// Τα πρόσθετα της κράτησης (το όνομα όπως ήταν τη στιγμή της κράτησης, και οι μεταφράσεις του).
function getExtras(db, bookingId) {
  return db
    .prepare(
      `SELECT be.*, e.name_en, e.name_es FROM booking_extras be LEFT JOIN extras e ON e.id = be.extra_id
       WHERE be.booking_id = ? ORDER BY be.name`,
    )
    .all(bookingId);
}

function getEvents(db, bookingId) {
  return db.prepare('SELECT * FROM booking_events WHERE booking_id = ? ORDER BY id').all(bookingId);
}

/**
 * Δημιουργεί κράτηση. Ο έλεγχος διαθεσιμότητας και η εγγραφή γίνονται
 * στην ίδια συναλλαγή, ώστε να μην μπορεί να γίνει διπλοκράτηση.
 */
function createBooking(db, { car, search, extras, driver, userId = null, locale = 'el', nowMs = Date.now() }) {
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
          deposit_cents, status, payment_method, payment_status, hold_expires_at, terms_accepted_at,
          terms_version, excess_cents, late_cancel_fee_cents, child_info,
          invoice_requested, invoice_vat, invoice_name, invoice_address, invoice_tax_office, invoice_activity, locale,
          mileage_policy, mileage_limit_km, pickup_address, return_address
        ) VALUES (
          :reference, :user_id, :car_id, :pickup_location_id, :return_location_id, :pickup_at, :return_at, :days,
          :first_name, :last_name, :email, :phone, :birth_date, :license_number, :license_country, :license_issued,
          :flight_number, :notes, :base_cents, :discount_cents, :extras_cents, :fees_cents, :total_cents, :vat_cents,
          :deposit_cents, :status, :payment_method, 'unpaid', :hold_expires_at, datetime('now'),
          :terms_version, :excess_cents, :late_cancel_fee_cents, :child_info,
          :invoice_requested, :invoice_vat, :invoice_name, :invoice_address, :invoice_tax_office, :invoice_activity, :locale,
          :mileage_policy, :mileage_limit_km, :pickup_address, :return_address
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
        terms_version: config.termsVersion,
        excess_cents: quote.excessCents,
        late_cancel_fee_cents: quote.lateCancelFeeCents,
        child_info: driver.child_info || null,
        invoice_requested: driver.invoice ? 1 : 0,
        invoice_vat: driver.invoice ? driver.invoice_vat : null,
        invoice_name: driver.invoice ? driver.invoice_name : null,
        invoice_address: driver.invoice ? driver.invoice_address : null,
        invoice_tax_office: driver.invoice ? driver.invoice_tax_office : null,
        invoice_activity: driver.invoice ? driver.invoice_activity : null,
        locale: ['el', 'en', 'es'].includes(locale) ? locale : 'el',
        // Τα χιλιόμετρα που γνωστοποιήθηκαν στην κράτηση (όπως η απαλλαγή και η έκδοση των όρων).
        mileage_policy: freshCar.mileage_policy,
        mileage_limit_km: freshCar.mileage_limit_km ?? null,
        // Μόνο για σημεία που ζητούν διεύθυνση (ο έλεγχος γίνεται στο validateDriver).
        pickup_address: search.pickupLocation.needs_address ? driver.pickup_address || null : null,
        return_address: search.returnLocation.needs_address ? driver.return_address || null : null,
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

// Email επιβεβαίωσης με τους όρους ενοικίασης συνημμένους (σταθερό μέσο, ν. 2251/1994).
// Με τη βάση (`db`) το email έχει και το κουμπί «Η κράτησή μου» (σύνδεσμος πρόσβασης).
function sendConfirmation(booking, extras, { db = null } = {}) {
  return mailer
    .termsAttachments(booking.locale)
    .catch((err) => {
      console.error('[email] Αποτυχία δημιουργίας συνημμένων όρων:', err.message);
      return null;
    })
    .then((terms) =>
      mailer.sendInBackground({
        to: booking.email,
        subject: new Msg('Επιβεβαίωση κράτησης {ref}', { ref: booking.reference }),
        template: 'booking-confirmed',
        data: { booking, extras, termsAttached: Boolean(terms) },
        attachments: terms || undefined,
        db,
      }),
    );
}

function notifyConfirmed(db, booking) {
  const extras = getExtras(db, booking.id);
  sendConfirmation(booking, extras, { db });
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

// Ακύρωση από τον πελάτη: δωρεάν έως το όριο· μετά (και έως την ώρα παραλαβής) με τη
// σταθερή χρέωση που γνωστοποιήθηκε στην κράτηση, μόνο αν έχει προπληρωθεί.
// `pendingRefundCents`: επιστροφές που εκκρεμούν (δεν μετράνε ως ποσό που έχει πληρωθεί).
function customerCancellation(booking, now = time.nowLocal(), { pendingRefundCents = 0 } = {}) {
  if (booking.status === 'pending_payment') return { allowed: true, late: false, feeCents: 0 };
  if (booking.status !== 'confirmed') return { allowed: false, reason: 'Η κράτηση δεν μπορεί πλέον να ακυρωθεί online.' };
  if (hoursUntilPickup(booking, now) <= 0) {
    return { allowed: false, reason: 'Η ώρα παραλαβής έχει περάσει. Επικοινωνήστε μαζί μας.' };
  }
  if (hoursUntilPickup(booking, now) < config.rules.freeCancellationHours) {
    const paid = booking.paid_cents - booking.refunded_cents - pendingRefundCents;
    // Χρέωση που δεν γνωστοποιήθηκε (κρατήσεις παλαιότερης έκδοσης) δεν οφείλεται.
    const fee = paid > 0 ? Math.min(booking.late_cancel_fee_cents ?? 0, paid) : 0;
    return { allowed: true, late: true, feeCents: fee };
  }
  return { allowed: true, late: false, feeCents: 0 };
}

// «Πληρωμή κατά την παραλαβή» για κράτηση που περιμένει ακόμη πληρωμή με κάρτα (π.χ. η κάρτα
// απορρίφθηκε ή ο πελάτης έκλεισε τη σελίδα πληρωμής). Ο τρόπος αυτός επιτρέπεται πάντα στη φόρμα
// κράτησης (validateDriver)· εδώ ελέγχεται ότι το αυτοκίνητο είναι ακόμη δεσμευμένο για την κράτηση
// και ότι η παραλαβή δεν έχει περάσει.
function canSwitchToPayAtPickup(booking, { nowMs = Date.now(), nowLocal = time.nowLocal() } = {}) {
  return (
    Boolean(booking) &&
    booking.status === 'pending_payment' &&
    booking.payment_status === 'unpaid' &&
    booking.payment_method === 'card' &&
    !booking.paid_cents &&
    booking.hold_expires_at > nowMs &&
    nowLocal < booking.pickup_at
  );
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
  damageWaiver,
  quoteFor,
  validateDriver,
  isValidGreekVat,
  createBooking,
  getByReference,
  getById,
  getExtras,
  getEvents,
  logEvent,
  notifyConfirmed,
  sendConfirmation,
  customerCancellation,
  isOnlinePayment,
  canSwitchToPayAtPickup,
  expireStaleHolds,
};
