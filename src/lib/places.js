'use strict';

// «Πώς θα μας βρείτε»: για κάθε σημείο παραλαβής/επιστροφής οι οδηγίες προς τον πελάτη, το
// κουμπί «Οδηγίες πορείας» (Google Maps) και η διεύθυνση που έδωσε ο πελάτης για σημεία όπως
// η «Παράδοση σε ξενοδοχείο» (locations.needs_address).
//
// Κάθε «στάση» έχει τα πεδία name, address, text (με _en/_es για το tf()), url, needs_address
// και customer_address. Το text είναι οι οδηγίες παραλαβής (στην παραλαβή) ή οι οδηγίες
// επιστροφής (στην επιστροφή). Χρήση στα templates: views/partials/find-us.ejs, views/emails/_find-us.ejs.

const LANG_SUFFIXES = ['', '_en', '_es'];

// Σύνδεσμος χάρτη που δέχεται η διαχείριση: μόνο http(s), ώστε να μη γίνει ποτέ «javascript:…».
function isMapUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

// Οδηγίες πορείας στο Google Maps προς μια διεύθυνση (όπως γράφτηκε, συνήθως στα ελληνικά).
function googleDirections(address) {
  const destination = String(address || '').trim();
  return destination ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}` : '';
}

// «Οδηγίες πορείας»: ο σύνδεσμος χάρτη του σημείου, αλλιώς οδηγίες προς την (ελληνική) διεύθυνσή του.
// Όταν ερχόμαστε εμείς στη διεύθυνση του πελάτη (needs_address) δεν υπάρχει διαδρομή για εκείνον.
function directionsUrl(place) {
  if (!place || place.needs_address) return '';
  if (place.map_url && isMapUrl(place.map_url)) return String(place.map_url).trim();
  return googleDirections(place.address);
}

// Στάση από γραμμή του πίνακα locations. `kind`: 'pickup' (οδηγίες παραλαβής) ή 'return'.
function fromLocation(location, kind, customerAddress = null) {
  if (!location) return null;
  const textField = kind === 'return' ? 'return_instructions' : 'instructions';
  const stop = { kind, id: location.id, map_url: location.map_url || null, needs_address: Number(location.needs_address) === 1 };
  for (const s of LANG_SUFFIXES) {
    stop[`name${s}`] = location[`name${s}`] ?? null;
    stop[`address${s}`] = location[`address${s}`] ?? null;
    stop[`text${s}`] = location[`${textField}${s}`] ?? null;
  }
  stop.customer_address = customerAddress || null;
  stop.url = directionsUrl(stop);
  return stop;
}

// Στάση από κράτηση (στήλες του BOOKING_SELECT στο src/lib/bookings.js).
function fromBooking(booking, kind) {
  const p = `${kind}_location_`;
  const textField = kind === 'return' ? 'return_instructions' : 'instructions';
  const location = { id: booking[`${kind}_location_id`], map_url: booking[`${p}map_url`], needs_address: booking[`${p}needs_address`] };
  for (const s of LANG_SUFFIXES) {
    location[`name${s}`] = booking[`${p}name${s}`];
    location[`address${s}`] = booking[`${p}address${s}`];
    location[`${textField}${s}`] = booking[`${p}${textField}${s}`];
  }
  return fromLocation(location, kind, booking[`${kind}_address`]);
}

/**
 * Παραλαβή και επιστροφή μιας κράτησης: { pickup, ret, same }. `same`: το ίδιο σημείο (η επιστροφή
 * δεν επαναλαμβάνει διεύθυνση και κουμπί, μόνο τις οδηγίες επιστροφής).
 */
function forBooking(booking) {
  const same = booking.pickup_location_id === booking.return_location_id && (booking.pickup_address || '') === (booking.return_address || '');
  return { pickup: fromBooking(booking, 'pickup'), ret: fromBooking(booking, 'return'), same };
}

// Το ίδιο για τη φόρμα κράτησης (σημεία της αναζήτησης, πριν γραφτεί η διεύθυνση του πελάτη).
function forSearch(pickupLocation, returnLocation) {
  return {
    pickup: fromLocation(pickupLocation, 'pickup'),
    ret: fromLocation(returnLocation, 'return'),
    same: Boolean(pickupLocation && returnLocation && pickupLocation.id === returnLocation.id),
  };
}

// Διεύθυνση του πελάτη για εμφάνιση: η ένδειξη «[αφαιρέθηκε]» (αριθμός κάρτας που αφαιρέθηκε από
// το bookings.maskCardNumbers) στη γλώσσα της σελίδας ή του email. `t`: η μετάφραση του template.
const REMOVED = '[αφαιρέθηκε]';
function shownAddress(value, t) {
  return String(value || '').split(REMOVED).join(typeof t === 'function' ? t(REMOVED) : REMOVED);
}

// Έχει κάτι να πει η στάση στον πελάτη; (οδηγίες, διεύθυνση του πελάτη ή κουμπί χάρτη)
function hasDetails(stop) {
  if (!stop) return false;
  return Boolean(String(stop.text || '').trim() || stop.customer_address || stop.url);
}

module.exports = { isMapUrl, googleDirections, directionsUrl, fromLocation, fromBooking, forBooking, forSearch, hasDetails, shownAddress };
