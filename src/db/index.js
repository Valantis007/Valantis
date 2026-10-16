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

  // 2: Τα id χρηστών δεν επαναχρησιμοποιούνται ποτέ (AUTOINCREMENT), ώστε ένας νέος
  //    λογαριασμός να μην «κληρονομεί» ιστορικό ή sessions ενός διαγραμμένου.
  `
  CREATE TABLE users_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  INSERT INTO users_new SELECT * FROM users;
  DROP TABLE users;
  ALTER TABLE users_new RENAME TO users;
  `,

  // 3: Πολλαπλοί πάροχοι πληρωμών (Stripe / Revolut), εγγυήσεις και χρεώσεις μετά την επιστροφή.
  `
  ALTER TABLE bookings RENAME COLUMN stripe_session_id TO checkout_id;
  ALTER TABLE bookings RENAME COLUMN stripe_payment_intent TO payment_ref;
  ALTER TABLE bookings ADD COLUMN payment_provider TEXT;
  UPDATE bookings SET payment_provider = 'stripe' WHERE checkout_id IS NOT NULL OR payment_ref IS NOT NULL;

  -- Κάθε σελίδα πληρωμής που ανοίξαμε σε πάροχο (ενοικίαση, εγγύηση ή πρόσθετη χρέωση).
  -- Έτσι καμία πληρωμή δεν «χάνεται», ακόμη κι αν ο πελάτης πλήρωσε σε παλιότερη σελίδα.
  CREATE TABLE checkouts (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('stripe', 'revolut')),
    booking_id INTEGER NOT NULL REFERENCES bookings(id),
    kind TEXT NOT NULL CHECK (kind IN ('rental', 'deposit', 'charge')),
    ref_id INTEGER,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'paid', 'authorised', 'expired', 'refund_pending', 'refunded')),
    payment_ref TEXT,
    url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_checkouts_booking ON checkouts (booking_id, kind);
  CREATE INDEX idx_checkouts_status ON checkouts (status);
  INSERT INTO checkouts (id, provider, booking_id, kind, amount_cents, status, payment_ref, created_at, updated_at)
    SELECT checkout_id, 'stripe', id, 'rental', total_cents,
      CASE WHEN payment_status IN ('paid', 'refunded', 'partially_refunded') THEN 'paid' ELSE 'expired' END,
      payment_ref, CAST(strftime('%s', created_at) AS INTEGER) * 1000, CAST(strftime('%s', created_at) AS INTEGER) * 1000
    FROM bookings WHERE checkout_id IS NOT NULL;

  -- Εγγύηση: δέσμευση ποσού στην πιστωτική κάρτα του πελάτη (POS ή online).
  CREATE TABLE deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL REFERENCES bookings(id),
    method TEXT NOT NULL CHECK (method IN ('pos', 'stripe', 'revolut')),
    status TEXT NOT NULL CHECK (status IN ('awaiting', 'held', 'released', 'captured', 'expired', 'failed', 'cancelled')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    captured_cents INTEGER NOT NULL DEFAULT 0,
    hold_ref TEXT,
    checkout_id TEXT,
    link_token_hash TEXT UNIQUE,
    card_brand TEXT,
    card_last4 TEXT,
    funding TEXT,
    capture_deadline_ms INTEGER,
    consent_at TEXT,
    failure_reason TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    held_at TEXT,
    settled_at TEXT
  );
  CREATE INDEX idx_deposits_booking ON deposits (booking_id);
  CREATE INDEX idx_deposits_status ON deposits (status);

  -- Χρεώσεις μετά την επιστροφή (καύσιμο, καθυστέρηση, καθαρισμός, ζημιές...).
  CREATE TABLE booking_charges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL REFERENCES bookings(id),
    category TEXT NOT NULL CHECK (category IN ('fuel', 'late_return', 'cleaning', 'fines_admin', 'damage', 'other')),
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    paid_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('proposed', 'accepted', 'disputed', 'withdrawn', 'charged')),
    evidence TEXT,
    customer_note TEXT,
    consent TEXT,
    respond_by TEXT,
    charged_via TEXT CHECK (charged_via IN ('deposit', 'payment_link', 'pos', 'other')),
    checkout_id TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    responded_at TEXT,
    charged_at TEXT
  );
  CREATE INDEX idx_booking_charges_booking ON booking_charges (booking_id);

  -- Επιστροφές χρημάτων: καταγράφονται πριν σταλούν στον πάροχο και ξαναδοκιμάζονται αν αποτύχουν.
  CREATE TABLE refunds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL REFERENCES bookings(id),
    checkout_id TEXT,
    provider TEXT NOT NULL,
    payment_ref TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    applies_to_booking INTEGER NOT NULL DEFAULT 1,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    actor TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    done_at TEXT
  );
  CREATE INDEX idx_refunds_status ON refunds (status);
  CREATE INDEX idx_refunds_booking ON refunds (booking_id);
  `,

  // 4: Νομικές απαιτήσεις: απαλλαγή ζημιών, έκδοση όρων, τιμολόγιο, παραστατικά, διατήρηση δεδομένων.
  `
  -- Απαλλαγή (συμμετοχή του πελάτη σε ζημιές). NULL = ίση με την εγγύηση.
  ALTER TABLE cars ADD COLUMN excess_cents INTEGER;
  -- Είδος πρόσθετου: damage_waiver μηδενίζει την απαλλαγή, child_seat απαιτεί στοιχεία παιδιού.
  ALTER TABLE extras ADD COLUMN kind TEXT NOT NULL DEFAULT 'other'
    CHECK (kind IN ('damage_waiver', 'prepaid_fuel', 'child_seat', 'driver', 'other'));
  UPDATE extras SET kind = 'damage_waiver' WHERE name LIKE '%απαλλαγή%' OR name LIKE '%ασφάλεια%';
  UPDATE extras SET kind = 'child_seat' WHERE name LIKE '%κάθισμα%';
  UPDATE extras SET kind = 'prepaid_fuel' WHERE name LIKE '%ρεζερβουάρ%';
  UPDATE extras SET kind = 'driver' WHERE name LIKE '%οδηγός%';

  -- Ό,τι γνωστοποιήθηκε στον πελάτη τη στιγμή της κράτησης (απόδειξη ενημέρωσης).
  ALTER TABLE bookings ADD COLUMN terms_version TEXT;
  ALTER TABLE bookings ADD COLUMN excess_cents INTEGER;
  ALTER TABLE bookings ADD COLUMN late_cancel_fee_cents INTEGER;
  ALTER TABLE bookings ADD COLUMN child_info TEXT;
  -- Στοιχεία τιμολογίου (επαγγελματίες πελάτες).
  ALTER TABLE bookings ADD COLUMN invoice_requested INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE bookings ADD COLUMN invoice_vat TEXT;
  ALTER TABLE bookings ADD COLUMN invoice_name TEXT;
  ALTER TABLE bookings ADD COLUMN invoice_address TEXT;
  ALTER TABLE bookings ADD COLUMN invoice_tax_office TEXT;
  ALTER TABLE bookings ADD COLUMN invoice_activity TEXT;
  ALTER TABLE bookings ADD COLUMN personal_data_purged_at TEXT;

  -- Παραστατικά που πρέπει να εκδοθούν (ΑΠΥ, πιστωτικά) για κάθε είσπραξη/επιστροφή.
  CREATE TABLE fiscal_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL REFERENCES bookings(id),
    kind TEXT NOT NULL CHECK (kind IN ('receipt', 'credit', 'invoice')),
    amount_cents INTEGER NOT NULL,
    description TEXT NOT NULL,
    source TEXT NOT NULL,
    mark TEXT,
    issued_at TEXT,
    issued_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_fiscal_docs_pending ON fiscal_docs (issued_at);

  -- Φόρμα επικοινωνίας: είδος μηνύματος και κωδικός κράτησης (για παράπονα).
  ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'question';
  ALTER TABLE messages ADD COLUMN booking_reference TEXT;
  `,

  // 5: Ασφαλής εκκαθάριση εγγυήσεων και παρακολούθηση επιστροφών χρημάτων στον πάροχο.
  `
  -- Μία εκκαθάριση/αποδέσμευση τη φορά, και το ποσό που ζητήθηκε από τον πάροχο
  -- (για να εφαρμοστεί σωστά ακόμη κι αν χαθεί η απάντηση του παρόχου).
  ALTER TABLE deposits ADD COLUMN settling_at TEXT;
  ALTER TABLE deposits ADD COLUMN capture_requested_cents INTEGER;
  ALTER TABLE deposits ADD COLUMN synced_at TEXT;
  ALTER TABLE deposits ADD COLUMN release_failed_at TEXT;
  -- Η επιστροφή στον πάροχο μπορεί να αποτύχει αργότερα (π.χ. κλειστή κάρτα).
  ALTER TABLE refunds ADD COLUMN provider_refund_id TEXT;
  ALTER TABLE refunds ADD COLUMN provider_status TEXT;
  ALTER TABLE refunds ADD COLUMN checked_at TEXT;
  `,

  // 6: Διορθώσεις δεδομένων για βάσεις που αναβαθμίζονται από παλαιότερη έκδοση.
  `
  -- Μηνύματα: σύνδεση με τον λογαριασμό που τα έστειλε (η λήψη δεδομένων δεν βασίζεται σε
  -- email, που δεν επιβεβαιώνεται κατά την εγγραφή).
  ALTER TABLE messages ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
  -- Πιστωτικό που αντιστοιχεί σε επιστροφή χρημάτων (για αναίρεση αν η επιστροφή αποτύχει).
  ALTER TABLE fiscal_docs ADD COLUMN refund_id INTEGER;

  -- Το LIKE της SQLite αγνοεί πεζά/κεφαλαία μόνο για λατινικούς χαρακτήρες.
  UPDATE extras SET kind = 'child_seat' WHERE kind = 'other' AND (name LIKE '%κάθισμα%' OR name LIKE '%Κάθισμα%' OR name LIKE '%booster%');
  UPDATE extras SET kind = 'damage_waiver' WHERE kind = 'other'
    AND (name LIKE '%απαλλαγή%' OR name LIKE '%Απαλλαγή%' OR name LIKE '%ασφάλεια%' OR name LIKE '%Ασφάλεια%' OR name LIKE '%FDW%');
  UPDATE extras SET kind = 'prepaid_fuel' WHERE kind = 'other' AND (name LIKE '%ρεζερβουάρ%' OR name LIKE '%Ρεζερβουάρ%');
  UPDATE extras SET kind = 'driver' WHERE kind = 'other' AND (name LIKE '%οδηγός%' OR name LIKE '%Οδηγός%');
  -- Η πλήρης απαλλαγή δεν αλλάζει την εγγύηση (η παλιά περιγραφή έλεγε το αντίθετο).
  UPDATE extras SET description = 'Μηδενίζει τη συμμετοχή σας σε ζημιές του οχήματος, με τις εξαιρέσεις των όρων (§7). Δεν είναι ασφαλιστικό προϊόν: είναι συμβατική παραίτηση της εταιρείας από αξιώσεις για ζημιές. Η εγγύηση δεν αλλάζει.'
    WHERE kind = 'damage_waiver' AND description LIKE '%εγγύηση%' AND description NOT LIKE '%εγγύηση δεν αλλάζει%';

  -- Τα αρχικά ενδεικτικά πρόσθετα: η FDW δεν είναι «ασφάλεια» και το καύσιμο που δεν
  -- χρησιμοποιήθηκε δεν επιστρέφεται (αλλάζουν μόνο αν έχουν ακόμη το αρχικό όνομα/κείμενο).
  UPDATE extras SET name = 'Πλήρης Απαλλαγή Ευθύνης για Ζημιές (FDW) - συμμετοχή 0 €' WHERE name = 'Πλήρης ασφάλεια (μηδενική απαλλαγή)';
  UPDATE extras SET name = 'Προπληρωμένο γεμάτο ρεζερβουάρ',
    description = 'Παραλαμβάνετε με γεμάτο ρεζερβουάρ και επιστρέφετε με όσο καύσιμο θέλετε. Το καύσιμο που δεν χρησιμοποιήθηκε δεν επιστρέφεται. Εναλλακτικά, επιστρέψτε με την ίδια στάθμη χωρίς χρέωση.'
    WHERE name = 'Γεμάτο ρεζερβουάρ κατά την παραλαβή' AND description = 'Επιστρέψτε το αυτοκίνητο με όσο καύσιμο θέλετε.';

  -- Κρατήσεις πριν τη μετάβαση 4: δεν γνωστοποιήθηκε χρέωση ακύρωσης, άρα δεν οφείλεται.
  UPDATE bookings SET late_cancel_fee_cents = 0 WHERE late_cancel_fee_cents IS NULL;
  UPDATE bookings SET excess_cents = CASE
      WHEN EXISTS (SELECT 1 FROM booking_extras be JOIN extras e ON e.id = be.extra_id
                   WHERE be.booking_id = bookings.id AND e.kind = 'damage_waiver') THEN 0
      ELSE (SELECT COALESCE(c.excess_cents, c.deposit_cents) FROM cars c WHERE c.id = bookings.car_id) END
    WHERE excess_cents IS NULL;
  `,

  // 7: Γλώσσα πελάτη (ελληνικά, αγγλικά, ισπανικά): emails και σύνδεσμοι στη γλώσσα του.
  `
  ALTER TABLE bookings ADD COLUMN locale TEXT NOT NULL DEFAULT 'el';
  ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'el';
  -- Μεταφράσεις του περιεχομένου που γράφει το γραφείο (κενό = εμφανίζεται το ελληνικό).
  ALTER TABLE extras ADD COLUMN name_en TEXT;
  ALTER TABLE extras ADD COLUMN name_es TEXT;
  ALTER TABLE extras ADD COLUMN description_en TEXT;
  ALTER TABLE extras ADD COLUMN description_es TEXT;
  ALTER TABLE locations ADD COLUMN name_en TEXT;
  ALTER TABLE locations ADD COLUMN name_es TEXT;
  ALTER TABLE locations ADD COLUMN address_en TEXT;
  ALTER TABLE locations ADD COLUMN address_es TEXT;
  ALTER TABLE cars ADD COLUMN description_en TEXT;
  ALTER TABLE cars ADD COLUMN description_es TEXT;
  -- Μεταφράσεις των αρχικών ενδεικτικών δεδομένων (μόνο αν δεν έχουν αλλάξει).
  UPDATE locations SET name_en = 'Office - City centre', name_es = 'Oficina - Centro de la ciudad', address_en = NULL, address_es = NULL WHERE name = 'Γραφείο - Κέντρο πόλης' AND name_en IS NULL;
  UPDATE locations SET name_en = 'Airport', name_es = 'Aeropuerto', address_en = 'Arrivals hall', address_es = 'Sala de llegadas' WHERE name = 'Αεροδρόμιο' AND name_en IS NULL;
  UPDATE locations SET name_en = 'Port', name_es = 'Puerto', address_en = 'Passenger terminal', address_es = 'Terminal de pasajeros' WHERE name = 'Λιμάνι' AND name_en IS NULL;
  UPDATE locations SET name_en = 'Hotel delivery (within the city)', name_es = 'Entrega en el hotel (dentro de la ciudad)', address_en = 'At the address you give us', address_es = 'En la dirección que nos indique' WHERE name = 'Παράδοση σε ξενοδοχείο (εντός πόλης)' AND name_en IS NULL;
  UPDATE extras SET name_en = 'Full Damage Waiver (FDW) - €0 excess', name_es = 'Exención total por daños (FDW) - franquicia 0 €', description_en = 'Reduces your liability for damage to the vehicle to zero, subject to the exclusions in the terms (§7). It is not an insurance product: it is a contractual waiver by the company of claims for damage. The deposit does not change.', description_es = 'Reduce a cero su responsabilidad por daños al vehículo, salvo las exclusiones de las condiciones (§7). No es un seguro: es una renuncia contractual de la empresa a reclamar por daños. La fianza no cambia.' WHERE name = 'Πλήρης Απαλλαγή Ευθύνης για Ζημιές (FDW) - συμμετοχή 0 €' AND name_en IS NULL;
  UPDATE extras SET name_en = 'Additional driver', name_es = 'Conductor adicional', description_en = 'The additional driver must be present at pick-up with their driving licence and meet the same age and licence requirements.', description_es = 'El conductor adicional debe estar presente en la recogida con su permiso de conducir y cumplir los mismos requisitos de edad y permiso.' WHERE name = 'Επιπλέον οδηγός' AND name_en IS NULL;
  UPDATE extras SET name_en = 'Child seat (0-4 years)', name_es = 'Silla infantil (0-4 años)', description_en = 'Approved to ECE R44/04 or R129 (i-Size).', description_es = 'Homologada según ECE R44/04 o R129 (i-Size).' WHERE name = 'Παιδικό κάθισμα (0-4 ετών)' AND name_en IS NULL;
  UPDATE extras SET name_en = 'Booster seat (4-12 years)', name_es = 'Elevador (4-12 años)', description_en = 'Approved to ECE R44/04 or R129 (i-Size).', description_es = 'Homologado según ECE R44/04 o R129 (i-Size).' WHERE name = 'Κάθισμα booster (4-12 ετών)' AND name_en IS NULL;
  UPDATE extras SET name_en = 'GPS navigation', name_es = 'Navegador GPS', description_en = NULL, description_es = NULL WHERE name = 'GPS πλοήγηση' AND name_en IS NULL;
  UPDATE extras SET name_en = 'Prepaid full tank', name_es = 'Depósito lleno prepagado', description_en = 'Pick up with a full tank and return with as much fuel as you like. Unused fuel is not refunded. Alternatively, return at the same level at no charge.', description_es = 'Recoge el coche con el depósito lleno y lo devuelve con el combustible que quiera. El combustible no utilizado no se reembolsa. También puede devolverlo con el mismo nivel sin coste.' WHERE name = 'Προπληρωμένο γεμάτο ρεζερβουάρ' AND name_en IS NULL;
  UPDATE cars SET description_en = 'Ideal for the city, easy to park and very economical.', description_es = 'Ideal para la ciudad, fácil de aparcar y muy económico.' WHERE description = 'Ιδανικό για την πόλη, εύκολο στο παρκάρισμα και πολύ οικονομικό.' AND description_en IS NULL;
  UPDATE cars SET description_en = 'Small automatic, ideal for new drivers.', description_es = 'Pequeño automático, ideal para conductores noveles.' WHERE description = 'Μικρό αυτόματο, ιδανικό για αρχάριους οδηγούς.' AND description_en IS NULL;
  UPDATE cars SET description_en = 'Comfortable and economical in town and in the countryside.', description_es = 'Cómodo y económico en ciudad y carretera.' WHERE description = 'Άνετο και οικονομικό για πόλη και επαρχία.' AND description_en IS NULL;
  UPDATE cars SET description_en = 'DSG automatic gearbox, Apple CarPlay / Android Auto.', description_es = 'Cambio automático DSG, Apple CarPlay / Android Auto.' WHERE description = 'Αυτόματο κιβώτιο DSG, Apple CarPlay / Android Auto.' AND description_en IS NULL;
  UPDATE cars SET description_en = 'Hybrid with very low fuel consumption, ideal for long distances.', description_es = 'Híbrido de muy bajo consumo, ideal para largas distancias.' WHERE description = 'Υβριδικό με πολύ χαμηλή κατανάλωση, ιδανικό για μεγάλες αποστάσεις.' AND description_en IS NULL;
  UPDATE cars SET description_en = 'Estate car with a large boot for family holidays.', description_es = 'Familiar con un gran maletero para las vacaciones en familia.' WHERE description = 'Station wagon με μεγάλο πορτμπαγκάζ για οικογενειακές διακοπές.' AND description_en IS NULL;
  UPDATE cars SET description_en = 'SUV with a high driving position and modern safety systems.', description_es = 'SUV con posición de conducción elevada y sistemas de seguridad modernos.' WHERE description = 'SUV με ψηλή θέση οδήγησης και σύγχρονα συστήματα ασφαλείας.' AND description_en IS NULL;
  UPDATE cars SET description_en = 'Four-wheel drive for dirt roads and mountain routes.', description_es = 'Tracción a las cuatro ruedas para caminos de tierra y rutas de montaña.' WHERE description = 'Τετρακίνητο για χωματόδρομους και ορεινές διαδρομές.' AND description_en IS NULL;
  UPDATE cars SET description_en = 'Nine-seater for large groups and families.', description_es = 'Nueve plazas para grupos grandes y familias.' WHERE description = 'Εννιαθέσιο για μεγάλες παρέες και οικογένειες.' AND description_en IS NULL;
  UPDATE cars SET description_en = 'Luxury and comfort for business trips.', description_es = 'Lujo y confort para viajes de negocios.' WHERE description = 'Πολυτέλεια και άνεση για επαγγελματικά ταξίδια.' AND description_en IS NULL;
  UPDATE cars SET description_en = 'A convertible for summer drives.', description_es = 'Un descapotable para los paseos de verano.' WHERE description = 'Ανοιχτό αυτοκίνητο για τις καλοκαιρινές βόλτες.' AND description_en IS NULL;

  `,
];

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current >= MIGRATIONS.length) return;
  // Οι αναδομήσεις πινάκων απαιτούν προσωρινή απενεργοποίηση των foreign keys
  // (το PRAGMA δεν έχει αποτέλεσμα μέσα σε συναλλαγή).
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (let v = current; v < MIGRATIONS.length; v += 1) {
      transaction(db, () => {
        db.exec(MIGRATIONS[v]);
        const broken = db.prepare('PRAGMA foreign_key_check').all();
        if (broken.length) throw new Error(`Η μετάβαση ${v + 1} άφησε σπασμένες αναφορές: ${JSON.stringify(broken[0])}`);
        db.exec(`PRAGMA user_version = ${v + 1}`);
      });
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

// Κανονικοποίηση κειμένου για αναζήτηση: πεζά, χωρίς τόνους, ς -> σ.
function normalizeText(value) {
  if (value === null || value === undefined) return null;
  return String(value).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('el').replace(/ς/g, 'σ');
}

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.function('norm', { deterministic: true }, normalizeText);
  migrate(db);
  return db;
}

// Εκτελεί τη συνάρτηση μέσα σε συναλλαγή με αποκλειστικό κλείδωμα εγγραφής,
// ώστε δύο ταυτόχρονες κρατήσεις να μην μπορούν να πάρουν το ίδιο αυτοκίνητο.
// Οι εμφωλευμένες κλήσεις εκτελούνται μέσα στην εξωτερική συναλλαγή.
const depth = new WeakMap();

function transaction(db, fn) {
  const level = depth.get(db) || 0;
  if (level > 0) {
    depth.set(db, level + 1);
    try {
      return fn();
    } finally {
      depth.set(db, level);
    }
  }
  db.exec('BEGIN IMMEDIATE');
  depth.set(db, 1);
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Η συναλλαγή έχει ήδη τερματιστεί.
    }
    throw err;
  } finally {
    depth.set(db, 0);
  }
}

module.exports = { openDb, transaction, normalizeText };
