'use strict';

// Καταγραφή των σελίδων πληρωμής (checkouts) που ανοίγουμε στους παρόχους.

const providers = require('./providers');

function insertCheckout(db, { id, provider, bookingId, kind, refId = null, amountCents, url }) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO checkouts (id, provider, booking_id, kind, ref_id, amount_cents, status, url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
  ).run(id, provider, bookingId, kind, refId, amountCents, url || null, now, now);
}

function getCheckoutRow(db, id) {
  return db.prepare('SELECT * FROM checkouts WHERE id = ?').get(id) || null;
}

function setCheckoutStatus(db, id, status, paymentRef = undefined) {
  if (paymentRef === undefined) {
    db.prepare('UPDATE checkouts SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id);
  } else {
    db.prepare('UPDATE checkouts SET status = ?, payment_ref = ?, updated_at = ? WHERE id = ?').run(status, paymentRef, Date.now(), id);
  }
}

function openCheckouts(db, bookingId, kind) {
  return db
    .prepare(`SELECT * FROM checkouts WHERE booking_id = ? AND kind = ? AND status = 'open' ORDER BY created_at DESC`)
    .all(bookingId, kind);
}

// Κλείνει (στον πάροχο) τις ανοιχτές σελίδες πληρωμής, ώστε να μην μπορούν πλέον να πληρωθούν.
async function expireOpenCheckouts(db, bookingId, kind, { except = null } = {}) {
  for (const row of openCheckouts(db, bookingId, kind)) {
    if (row.id === except) continue;
    const provider = providers.get(row.provider);
    if (provider) await provider.expireCheckout(row.id);
  }
}

module.exports = { insertCheckout, getCheckoutRow, setCheckoutStatus, openCheckouts, expireOpenCheckouts };
