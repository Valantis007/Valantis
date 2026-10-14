'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// Κάθε στοιχείο του πίνακα είναι μία μετάβαση (migration). Νέες αλλαγές
// σχήματος προστίθενται ΠΑΝΤΑ στο τέλος, ποτέ δεν αλλάζουμε τις υπάρχουσες.
const MIGRATIONS = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    reset_token_hash TEXT,
    reset_expires_at INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE locations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE cars (
    id INTEGER PRIMARY KEY,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    plate TEXT NOT NULL UNIQUE COLLATE NOCASE,
    category TEXT NOT NULL,
    transmission TEXT NOT NULL CHECK (transmission IN ('manual', 'automatic')),
    fuel TEXT NOT NULL CHECK (fuel IN ('petrol', 'diesel', 'hybrid', 'electric', 'lpg')),
    seats INTEGER NOT NULL,
    doors INTEGER NOT NULL,
    luggage INTEGER NOT NULL DEFAULT 1,
    air_conditioning INTEGER NOT NULL DEFAULT 1,
    daily_rate_cents INTEGER NOT NULL CHECK (daily_rate_cents > 0),
    deposit_cents INTEGER NOT NULL DEFAULT 0 CHECK (deposit_cents >= 0),
    min_driver_age INTEGER NOT NULL DEFAULT 21,
    mileage_policy TEXT NOT NULL DEFAULT 'Απεριόριστα χιλιόμετρα',
    description TEXT NOT NULL DEFAULT '',
    image TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE extras (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    pricing TEXT NOT NULL CHECK (pricing IN ('per_day', 'per_rental')),
    max_qty INTEGER NOT NULL DEFAULT 1 CHECK (max_qty >= 1),
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  -- Εποχικές τιμές: ποσοστό επί της βασικής ημερήσιας τιμής (π.χ. 130 = +30%).
  -- Οι ημερομηνίες είναι σε μορφή ΜΜ-ΗΗ και επαναλαμβάνονται κάθε χρόνο.
  CREATE TABLE seasons (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    start_md TEXT NOT NULL,
    end_md TEXT NOT NULL,
    percent INTEGER NOT NULL CHECK (percent > 0)
  );

  CREATE TABLE bookings (
    id INTEGER PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    car_id INTEGER NOT NULL REFERENCES cars(id),
    pickup_location_id INTEGER NOT NULL REFERENCES locations(id),
    return_location_id INTEGER NOT NULL REFERENCES locations(id),
    pickup_at TEXT NOT NULL,
    return_at TEXT NOT NULL,
    days INTEGER NOT NULL,

    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    license_number TEXT NOT NULL,
    license_country TEXT NOT NULL,
    license_issued TEXT NOT NULL,
    flight_number TEXT,
    notes TEXT,

    base_cents INTEGER NOT NULL,
    discount_cents INTEGER NOT NULL DEFAULT 0,
    extras_cents INTEGER NOT NULL DEFAULT 0,
    fees_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL,
    vat_cents INTEGER NOT NULL,
    deposit_cents INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL CHECK (status IN ('pending_payment', 'confirmed', 'active', 'completed', 'cancelled', 'expired')),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'pay_at_pickup')),
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded', 'partially_refunded')),
    paid_cents INTEGER NOT NULL DEFAULT 0,
    refunded_cents INTEGER NOT NULL DEFAULT 0,
    stripe_session_id TEXT,
    stripe_payment_intent TEXT,
    hold_expires_at INTEGER,

    pickup_km INTEGER,
    return_km INTEGER,
    admin_notes TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    cancelled_at TEXT,
    terms_accepted_at TEXT NOT NULL
  );
  CREATE INDEX idx_bookings_car_time ON bookings (car_id, pickup_at, return_at);
  CREATE INDEX idx_bookings_user ON bookings (user_id);
  CREATE INDEX idx_bookings_status ON bookings (status);

  CREATE TABLE booking_extras (
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    extra_id INTEGER NOT NULL REFERENCES extras(id),
    name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    pricing TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    PRIMARY KEY (booking_id, extra_id)
  );

  -- Ιστορικό ενεργειών ανά κράτηση (ποιος έκανε τι και πότε).
  CREATE TABLE booking_events (
    id INTEGER PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_booking_events_booking ON booking_events (booking_id);

  -- Περίοδοι που ένα αυτοκίνητο δεν είναι διαθέσιμο (σέρβις, βλάβη κ.λπ.).
  CREATE TABLE car_blocks (
    id INTEGER PRIMARY KEY,
    car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_car_blocks_car ON car_blocks (car_id, start_at, end_at);

  CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    handled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
  CREATE INDEX idx_sessions_expires ON sessions (expires);

  -- Αποτρέπει τη διπλή επεξεργασία του ίδιου γεγονότος Stripe.
  CREATE TABLE processed_webhooks (
    event_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
];

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v += 1) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

// Εκτελεί τη συνάρτηση μέσα σε συναλλαγή με αποκλειστικό κλείδωμα εγγραφής,
// ώστε δύο ταυτόχρονες κρατήσεις να μην μπορούν να πάρουν το ίδιο αυτοκίνητο.
function transaction(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, transaction };
