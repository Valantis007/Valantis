'use strict';

// Ανάγνωση και έλεγχος των κριτηρίων αναζήτησης (σημεία & ημερομηνίες).

const config = require('../config');
const time = require('./time');
const { intOrNull } = require('./validation');
const { msg } = require('./i18n');

function getActiveLocation(db, id) {
  if (id === null) return null;
  return db.prepare('SELECT * FROM locations WHERE id = ? AND active = 1').get(id) || null;
}

/**
 * Διαβάζει pickup_date, pickup_time, return_date, return_time,
 * pickup_location, return_location από query ή body.
 * Επιστρέφει { values, errors, ok, pickupAt, returnAt, pickupLocation, returnLocation }.
 */
function parseSearch(db, input, now = time.nowLocal()) {
  const values = {
    pickup_date: String(input.pickup_date || ''),
    pickup_time: String(input.pickup_time || '10:00'),
    return_date: String(input.return_date || ''),
    return_time: String(input.return_time || '10:00'),
    pickup_location: String(input.pickup_location || ''),
    return_location: String(input.return_location || input.pickup_location || ''),
  };
  const errors = {};
  const provided = Boolean(values.pickup_date || values.return_date);

  const pickupLocation = getActiveLocation(db, intOrNull(values.pickup_location));
  const returnLocation = getActiveLocation(db, intOrNull(values.return_location));
  if (!pickupLocation) errors.pickup_location = 'Επιλέξτε σημείο παραλαβής.';
  if (!returnLocation) errors.return_location = 'Επιλέξτε σημείο επιστροφής.';

  const pickupAt = time.combine(values.pickup_date, values.pickup_time);
  const returnAt = time.combine(values.return_date, values.return_time);

  if (!pickupAt) errors.pickup_date = 'Επιλέξτε έγκυρη ημερομηνία και ώρα παραλαβής.';
  if (!returnAt) errors.return_date = 'Επιλέξτε έγκυρη ημερομηνία και ώρα επιστροφής.';

  if (pickupAt && returnAt) {
    const { rules } = config;
    // Μηνύματα με μεταβλητές: msg(), ώστε να μεταφράζονται εκεί όπου εμφανίζονται (t(errors.x)).
    const hours = { from: `${rules.openingHour}:00`, to: `${rules.closingHour}:00` };
    if (!time.isWithinOpeningHours(pickupAt)) {
      errors.pickup_time = msg('Οι παραλαβές γίνονται {from} - {to}.', hours);
    }
    if (!time.isWithinOpeningHours(returnAt)) {
      errors.return_time = msg('Οι επιστροφές γίνονται {from} - {to}.', hours);
    }
    if (time.minutesBetween(now, pickupAt) < rules.minLeadMinutes) {
      errors.pickup_date = msg('Η παραλαβή πρέπει να είναι τουλάχιστον {hours} ώρες από τώρα.', { hours: Math.ceil(rules.minLeadMinutes / 60) });
    } else if (time.minutesBetween(now, pickupAt) > rules.maxAdvanceDays * 24 * 60) {
      errors.pickup_date = msg('Δεχόμαστε κρατήσεις έως {days} ημέρες μπροστά.', { days: rules.maxAdvanceDays });
    }
    const minutes = time.minutesBetween(pickupAt, returnAt);
    if (minutes <= 0) {
      errors.return_date = 'Η επιστροφή πρέπει να είναι μετά την παραλαβή.';
    } else if (minutes < 60) {
      errors.return_date = 'Η επιστροφή πρέπει να είναι τουλάχιστον 1 ώρα μετά την παραλαβή.';
    } else if (time.rentalDays(pickupAt, returnAt) > rules.maxRentalDays) {
      errors.return_date = msg('Η μέγιστη διάρκεια ενοικίασης είναι {days} ημέρες.', { days: rules.maxRentalDays });
    }
  }

  const ok = Object.keys(errors).length === 0;
  return { values, errors, ok, provided, pickupAt, returnAt, pickupLocation, returnLocation };
}

// Το query string που «μεταφέρει» την αναζήτηση από σελίδα σε σελίδα.
function searchQuery(values) {
  const params = new URLSearchParams();
  for (const key of ['pickup_location', 'return_location', 'pickup_date', 'pickup_time', 'return_date', 'return_time']) {
    if (values[key]) params.set(key, values[key]);
  }
  return params.toString();
}

module.exports = { parseSearch, searchQuery };
