'use strict';

// Υπενθυμίσεις φορολογικών παραστατικών (myDATA).
//
// Η ιστοσελίδα ΔΕΝ εκδίδει παραστατικά: για κάθε είσπραξη ή επιστροφή χρημάτων καταγράφει
// ότι πρέπει να εκδοθεί απόδειξη (ΑΠΥ), τιμολόγιο ή πιστωτικό από το πρόγραμμα
// ηλεκτρονικής τιμολόγησης / ΦΗΜ της επιχείρησης. Το γραφείο καταχωρεί τον ΜΑΡΚ μόλις
// εκδοθεί, ώστε να φαίνεται τι εκκρεμεί. Ο λογιστής ορίζει τον ακριβή τύπο παραστατικού.

function record(db, { bookingId, kind, amountCents, description, source, refundId = null }) {
  if (!(amountCents > 0)) return null;
  let docKind = kind;
  if (kind === 'receipt') {
    const b = db.prepare('SELECT invoice_requested FROM bookings WHERE id = ?').get(bookingId);
    if (b && b.invoice_requested) docKind = 'invoice';
  }
  const res = db
    .prepare('INSERT INTO fiscal_docs (booking_id, kind, amount_cents, description, source, refund_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(bookingId, docKind, amountCents, description, source, refundId);
  return Number(res.lastInsertRowid);
}

function pending(db, { limit = 100 } = {}) {
  return db
    .prepare(
      `SELECT f.*, b.reference, b.first_name, b.last_name, b.invoice_vat, b.invoice_name
       FROM fiscal_docs f JOIN bookings b ON b.id = f.booking_id
       WHERE f.issued_at IS NULL ORDER BY f.id LIMIT ?`,
    )
    .all(limit);
}

function forBooking(db, bookingId) {
  return db.prepare('SELECT * FROM fiscal_docs WHERE booking_id = ? ORDER BY id').all(bookingId);
}

function markIssued(db, id, { mark, actor }) {
  return db
    .prepare(`UPDATE fiscal_docs SET mark = ?, issued_at = datetime('now'), issued_by = ? WHERE id = ? AND issued_at IS NULL`)
    .run(mark || null, actor, id).changes > 0;
}

module.exports = { record, pending, forBooking, markIssued };
