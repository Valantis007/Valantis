'use strict';

// «Η κράτησή μου» με ένα πάτημα: κάθε email προς τον πελάτη για μια κράτηση έχει κουμπί με
// σύνδεσμο /b/<token>, που ανοίγει την κράτηση χωρίς κωδικό και email (όπως το /manage).
//
//  - Το token είναι τυχαίο (32 bytes). Στη βάση αποθηκεύεται ΜΟΝΟ το sha256 του (πίνακας
//    booking_access_tokens), όπως στο deposits.link_token_hash: όποιος διαβάσει τη βάση δεν
//    μπορεί να φτιάξει σύνδεσμο.
//  - Κάθε email παίρνει δικό του token (το προηγούμενο δεν μπορεί να ξαναδιαβαστεί, αφού δεν
//    κρατιέται)· έτσι λειτουργούν και οι σύνδεσμοι των παλαιότερων emails.
//  - Ισχύει έως 60 ημέρες μετά την επιστροφή του αυτοκινήτου (bookings.return_at): ο έλεγχος
//    γίνεται κάθε φορά από την κράτηση, άρα ακολουθεί και μια αλλαγή ημερομηνίας.
//  - Δίνει πρόσβαση μόνο σε αυτή την κράτηση, στο session του browser (req.session.bookingAccess).

const crypto = require('node:crypto');
const i18n = require('./i18n');
const time = require('./time');

const VALID_DAYS_AFTER_RETURN = 60;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Μέχρι πότε ισχύει ο σύνδεσμος (τοπική ώρα, όπως το return_at).
function validUntil(booking) {
  return time.addMinutes(booking.return_at, VALID_DAYS_AFTER_RETURN * 24 * 60);
}

function isValidFor(booking, nowLocal = time.nowLocal()) {
  return Boolean(booking && booking.return_at) && nowLocal < validUntil(booking);
}

/** Νέο token για την κράτηση· επιστρέφει το token (μόνο εδώ υπάρχει σε απλή μορφή). */
function issueToken(db, bookingId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO booking_access_tokens (booking_id, token_hash) VALUES (?, ?)').run(bookingId, sha256(token));
  return token;
}

/**
 * Σύνδεσμος «Η κράτησή μου» για ένα email (στη γλώσσα του email, που είναι της κράτησης).
 * null αν ο σύνδεσμος δεν θα ίσχυε πλέον (κράτηση που επεστράφη πριν από 60+ ημέρες).
 */
function linkFor(db, booking, locale = booking.locale) {
  if (!booking || !booking.id || !isValidFor(booking)) return null;
  return `${i18n.siteUrl(i18n.isLocale(locale) ? locale : i18n.DEFAULT_LOCALE)}/b/${issueToken(db, booking.id)}`;
}

/** Η κράτηση ενός token, αν υπάρχει και ισχύει ακόμη· αλλιώς null. */
function findBooking(db, token, nowLocal = time.nowLocal()) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  const row = db.prepare('SELECT id, booking_id FROM booking_access_tokens WHERE token_hash = ?').get(sha256(String(token)));
  if (!row) return null;
  const booking = db.prepare('SELECT id, reference, locale, return_at FROM bookings WHERE id = ?').get(row.booking_id);
  if (!isValidFor(booking, nowLocal)) return null;
  db.prepare(`UPDATE booking_access_tokens SET last_used_at = datetime('now') WHERE id = ?`).run(row.id);
  return booking;
}

// Περιοδικός καθαρισμός: tokens που δεν ισχύουν πλέον (60 ημέρες μετά την επιστροφή).
function purgeExpired(db, nowLocal = time.nowLocal()) {
  const cutoff = time.addMinutes(nowLocal, -VALID_DAYS_AFTER_RETURN * 24 * 60);
  return db
    .prepare('DELETE FROM booking_access_tokens WHERE booking_id IN (SELECT id FROM bookings WHERE return_at <= ?)')
    .run(cutoff).changes;
}

module.exports = { VALID_DAYS_AFTER_RETURN, sha256, validUntil, isValidFor, issueToken, linkFor, findBooking, purgeExpired };
