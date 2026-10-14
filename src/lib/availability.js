'use strict';

const config = require('../config');
const time = require('./time');

// Κρατήσεις που «δεσμεύουν» το αυτοκίνητο. Οι κρατήσεις που περιμένουν
// πληρωμή δεσμεύουν μόνο μέχρι να λήξει ο χρόνος κράτησης (hold).
const BLOCKING_SQL = `(status IN ('confirmed', 'active')
  OR (status = 'pending_payment' AND hold_expires_at > :now_ms))`;

// Αν μια ενοικίαση είναι σε εξέλιξη και έχει περάσει η ώρα επιστροφής (εκπρόθεσμη),
// το αυτοκίνητο δεν είναι στο γραφείο: θεωρούμε ότι λείπει τουλάχιστον για τις
// επόμενες OVERDUE_BLOCK_HOURS ώρες, ώστε να μην πουληθεί σε άλλον πελάτη.
const OVERDUE_BLOCK_HOURS = 24;
const EFFECTIVE_RETURN_SQL = `(CASE WHEN status = 'active' AND return_at < :now_local THEN :overdue_until ELSE return_at END)`;

// Επικάλυψη με το διάστημα [:start, :end) (που περιλαμβάνει ήδη τον χρόνο προετοιμασίας).
const OVERLAP_SQL = `(pickup_at < :end AND ${EFFECTIVE_RETURN_SQL} > :start)`;

function blockingParams(nowMs = Date.now()) {
  const nowLocal = time.nowLocal(new Date(nowMs));
  return { now_ms: nowMs, now_local: nowLocal, overdue_until: time.addMinutes(nowLocal, OVERDUE_BLOCK_HOURS * 60) };
}

function window(pickupAt, returnAt) {
  // Χρόνος προετοιμασίας (καθαρισμός, έλεγχος) πριν και μετά από κάθε ενοικίαση.
  return {
    start: time.addMinutes(pickupAt, -config.rules.turnaroundMinutes),
    end: time.addMinutes(returnAt, config.rules.turnaroundMinutes),
  };
}

function isCarAvailable(db, carId, pickupAt, returnAt, { excludeBookingId = null, nowMs = Date.now() } = {}) {
  const w = window(pickupAt, returnAt);
  const clash = db
    .prepare(
      `SELECT 1 FROM bookings
       WHERE car_id = :car_id AND id != :exclude AND ${BLOCKING_SQL} AND ${OVERLAP_SQL}
       LIMIT 1`,
    )
    .get({ car_id: carId, exclude: excludeBookingId ?? -1, start: w.start, end: w.end, ...blockingParams(nowMs) });
  if (clash) return false;
  const block = db
    .prepare('SELECT 1 FROM car_blocks WHERE car_id = ? AND start_at < ? AND end_at > ? LIMIT 1')
    .get(carId, returnAt, pickupAt);
  return !block;
}

function availableCarIds(db, pickupAt, returnAt, { nowMs = Date.now() } = {}) {
  const w = window(pickupAt, returnAt);
  const rows = db
    .prepare(
      `SELECT c.id FROM cars c
       WHERE c.active = 1
         AND NOT EXISTS (
           SELECT 1 FROM bookings
           WHERE car_id = c.id AND ${BLOCKING_SQL} AND ${OVERLAP_SQL})
         AND NOT EXISTS (
           SELECT 1 FROM car_blocks
           WHERE car_id = c.id AND start_at < :return_at AND end_at > :pickup_at)`,
    )
    .all({ start: w.start, end: w.end, pickup_at: pickupAt, return_at: returnAt, ...blockingParams(nowMs) });
  return new Set(rows.map((r) => r.id));
}

module.exports = { isCarAvailable, availableCarIds, blockingParams, BLOCKING_SQL, OVERLAP_SQL, EFFECTIVE_RETURN_SQL };
