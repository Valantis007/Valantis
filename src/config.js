'use strict';

const path = require('node:path');
const { internationalDigits } = require('./lib/phone');

// Μεταβλητές που ορίστηκαν στο περιβάλλον του υπολογιστή/server πριν διαβαστεί το .env: αυτές
// υπερισχύουν του αρχείου (το dotenv δεν τις αλλάζει). Χρειάζεται στη σελίδα «Ρυθμίσεις δοκιμών».
const systemEnvKeys = new Set(Object.keys(process.env));
require('dotenv').config({ quiet: true });

const env = process.env;
const PLACEHOLDER_LEGAL_NAME = 'Επωνυμία Επιχείρησης';
const DEFAULT_AUTHORITY = 'Περιφερειακή Υπηρεσία Τουρισμού Κεντρικής Μακεδονίας - Υπουργείο Τουρισμού';
const root = path.resolve(__dirname, '..');

function int(name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Η μεταβλητή ${name} πρέπει να είναι ακέραιος αριθμός`);
  return n;
}

function euros(name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n) || n < 0) throw new Error(`Η μεταβλητή ${name} πρέπει να είναι ποσό σε ευρώ`);
  return Math.round(n * 100);
}

function parseDurationDiscounts(raw) {
  return String(raw)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [days, pct] = part.split(':').map((x) => Number.parseInt(x, 10));
      if (!(days > 0) || !(pct >= 0 && pct < 100)) {
        throw new Error(`Μη έγκυρη τιμή στο DURATION_DISCOUNTS: "${part}"`);
      }
      return { minDays: days, percent: pct };
    })
    .sort((a, b) => a.minDays - b.minDays);
}

// COMPANY_<ΠΕΔΙΟ>_EN / _ES: μετάφραση ενός στοιχείου της επιχείρησης. Η έδρα, όταν δεν
// ορίζεται χωριστά (= διεύθυνση γραφείου), παίρνει και τη μετάφραση της διεύθυνσης.
function companyTranslations(lang) {
  const get = (name) => (env[`COMPANY_${name}_${lang}`] || '').trim();
  return {
    name: get('NAME'),
    legalName: get('LEGAL_NAME'),
    seat: get('SEAT') || (env.COMPANY_SEAT ? '' : get('ADDRESS')),
    address: get('ADDRESS'),
    taxOffice: get('TAX_OFFICE'),
    authority: get('AUTHORITY'),
  };
}

const nodeEnv = env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

const config = {
  env: nodeEnv,
  isProduction,
  isTest,
  systemEnvKeys,
  port: int('PORT', 3000),
  baseUrl: (env.BASE_URL || `http://localhost:${int('PORT', 3000)}`).replace(/\/+$/, ''),
  sessionSecret: env.SESSION_SECRET || '',
  dbPath: env.DB_PATH ? path.resolve(root, env.DB_PATH) : path.join(root, 'data', 'app.db'),
  uploadDir: env.UPLOAD_DIR ? path.resolve(root, env.UPLOAD_DIR) : path.join(root, 'data', 'uploads'),
  trustProxy: int('TRUST_PROXY', 0),

  // Στοιχεία επιχείρησης: υποχρεωτικά για ιστοσελίδα ηλεκτρονικού εμπορίου (ΠΔ 131/2003, ν. 2251/1994).
  company: {
    name: env.COMPANY_NAME || 'Rent a Car',
    legalName: env.COMPANY_LEGAL_NAME || PLACEHOLDER_LEGAL_NAME,
    seat: env.COMPANY_SEAT || env.COMPANY_ADDRESS || '',
    vat: env.COMPANY_VAT || '',
    taxOffice: env.COMPANY_TAX_OFFICE || '',
    gemi: env.COMPANY_GEMI || '',
    mhte: env.COMPANY_MHTE || '',
    authority: env.COMPANY_AUTHORITY || DEFAULT_AUTHORITY,
    address: env.COMPANY_ADDRESS || '',
    phone: env.COMPANY_PHONE || '',
    // WhatsApp (προαιρετικό): διεθνής μορφή, μόνο ψηφία, π.χ. 306941234567. Κενό = χωρίς WhatsApp.
    whatsapp: internationalDigits(env.COMPANY_WHATSAPP) || '',
    email: env.COMPANY_EMAIL || '',
    privacyEmail: env.COMPANY_PRIVACY_EMAIL || env.COMPANY_EMAIL || '',
    // Δηλώστε true ΜΟΝΟ αν υπάρχει σύμβαση οδικής βοήθειας για όλο τον στόλο.
    roadsideAssistance: env.ROADSIDE_ASSISTANCE === 'true',
    // Δέσμευση συμμετοχής σε εξωδικαστική επίλυση (Συνήγορος του Καταναλωτή).
    adrCommitment: env.ADR_COMMITMENT === 'true',
    // Προαιρετικές μεταφράσεις για τις σελίδες/emails στα αγγλικά και στα ισπανικά
    // (π.χ. COMPANY_ADDRESS_EN). Χωρίς αυτές: λεξικό για τις προεπιλογές, αλλιώς μεταγραφή
    // με λατινικούς χαρακτήρες (src/lib/company.js).
    translations: Object.fromEntries(['EN', 'ES'].map((lang) => [lang.toLowerCase(), companyTranslations(lang)])),
  },

  // Έκδοση των όρων ενοικίασης: αλλάξτε την κάθε φορά που αλλάζουν οι όροι.
  termsVersion: env.TERMS_VERSION || '2026-10',

  // Τιμοκατάλογος χρεώσεων μετά την επιστροφή (εμφανίζεται στους όρους πριν την κράτηση).
  tariff: {
    fuelPerLitreCents: euros('FUEL_PRICE_PER_LITRE', 250),
    refuelFeeCents: euros('REFUEL_FEE', 1500),
    cleaningFeeCents: euros('CLEANING_FEE', 5000),
    finesAdminFeeCents: euros('FINES_ADMIN_FEE', 2000),
    lostKeyFeeCents: euros('LOST_KEY_FEE', 25000),
    ferryFeeCents: euros('FERRY_FEE', 0),
    // Χρέωση ακύρωσης εντός του ορίου δωρεάν ακύρωσης ή μη εμφάνισης (0 = το μίσθωμα μίας ημέρας).
    lateCancelFeeCents: euros('LATE_CANCEL_FEE', 0),
    // Ανώτατο όριο πληρωμής με μετρητά (ν. 4446/2016) — να επιβεβαιωθεί από τον λογιστή.
    cashLimitCents: euros('CASH_LIMIT', 49999),
  },

  retention: {
    // Μήνες μετά την επιστροφή που κρατάμε στοιχεία διπλώματος, γέννησης, τηλέφωνο, σημειώσεις.
    operationalMonths: int('RETENTION_OPERATIONAL_MONTHS', 12),
    messagesMonths: int('RETENTION_MESSAGES_MONTHS', 12),
  },

  rules: {
    timezone: env.TIMEZONE || 'Europe/Athens',
    openingHour: int('OPENING_HOUR', 8),
    closingHour: int('CLOSING_HOUR', 22),
    minLeadMinutes: int('MIN_LEAD_MINUTES', 120),
    // Πάνω από 30 ημέρες αλλάζει ο τόπος παροχής για ΦΠΑ (μακροχρόνια μίσθωση): μόνο με προσφορά.
    maxRentalDays: Math.min(int('MAX_RENTAL_DAYS', 30), 30),
    maxAdvanceDays: int('MAX_ADVANCE_DAYS', 365),
    turnaroundMinutes: int('TURNAROUND_MINUTES', 60),
    freeCancellationHours: int('FREE_CANCELLATION_HOURS', 48),
    oneWayFeeCents: euros('ONE_WAY_FEE', 3000),
    minLicenseYears: int('MIN_LICENSE_YEARS', 1),
    vatPercent: int('VAT_PERCENT', 24),
    durationDiscounts: parseDurationDiscounts(env.DURATION_DISCOUNTS || '7:5,14:10,28:15'),
    // Το Stripe απαιτεί η σελίδα πληρωμής να ισχύει τουλάχιστον 30 λεπτά, άρα ελάχιστο 35.
    paymentHoldMinutes: Math.min(Math.max(int('PAYMENT_HOLD_MINUTES', 35), 35), 600),
    // Περίοδος χάριτος: μια καθυστέρηση έως 59 λεπτά δεν χρεώνεται ως επιπλέον ημέρα.
    graceMinutes: 59,
  },

  payments: {
    // 'stripe' ή 'revolut'. Αν μείνει κενό, χρησιμοποιείται όποιος πάροχος έχει ρυθμιστεί (πρώτα το Stripe).
    provider: (env.PAYMENT_PROVIDER || '').trim().toLowerCase(),
  },

  stripe: {
    secretKey: env.STRIPE_SECRET_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    // Δέσμευση εγγύησης έως 30 ημέρες (απαιτεί έγκριση από το Stripe — τιμολόγηση IC+).
    extendedAuthorization: env.STRIPE_EXTENDED_AUTHORIZATION === 'true',
  },

  revolut: {
    secretKey: env.REVOLUT_SECRET_KEY || '',
    webhookSecret: env.REVOLUT_WEBHOOK_SECRET || '',
    sandbox: env.REVOLUT_SANDBOX === 'true',
  },

  deposits: {
    // Το online link εγγύησης μπορεί να χρησιμοποιηθεί από τόσες ώρες πριν την παραλαβή.
    linkOpensHoursBeforePickup: int('DEPOSIT_LINK_OPENS_HOURS', 48),
    // Ημέρες που έχει ο πελάτης για να αποδεχθεί ή να αμφισβητήσει μια χρέωση ζημιάς.
    damageResponseDays: Math.max(int('DAMAGE_RESPONSE_DAYS', 14), 7),
    // Αυτόματη αποδέσμευση εγγύησης Χ ώρες μετά την επιστροφή αν δεν υπάρχουν χρεώσεις (0 = ποτέ).
    autoReleaseHours: int('DEPOSIT_AUTO_RELEASE_HOURS', 48),
  },

  mail: {
    host: env.SMTP_HOST || '',
    port: int('SMTP_PORT', 587),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'Rent a Car <no-reply@example.gr>',
    adminNotify: env.ADMIN_NOTIFY_EMAIL || env.COMPANY_EMAIL || '',
  },

  admin: {
    email: env.ADMIN_EMAIL || '',
    password: env.ADMIN_PASSWORD || '',
  },
};

// Σε παραγωγή η ιστοσελίδα δεν ξεκινά χωρίς τα υποχρεωτικά στοιχεία της επιχείρησης.
if (isProduction) {
  const missing = [];
  if (config.company.legalName === PLACEHOLDER_LEGAL_NAME) missing.push('COMPANY_LEGAL_NAME');
  for (const [key, value] of Object.entries({
    COMPANY_VAT: config.company.vat,
    COMPANY_GEMI: config.company.gemi,
    COMPANY_MHTE: config.company.mhte,
    COMPANY_ADDRESS: config.company.address,
    COMPANY_PHONE: config.company.phone,
    COMPANY_EMAIL: config.company.email,
  })) {
    if (!value) missing.push(key);
  }
  if (missing.length) {
    throw new Error(`Συμπληρώστε στο .env τα υποχρεωτικά στοιχεία της επιχείρησης: ${missing.join(', ')}`);
  }
}

if (!config.sessionSecret) {
  if (isProduction) {
    throw new Error('Ορίστε SESSION_SECRET στο αρχείο .env πριν την εκκίνηση σε παραγωγή.');
  }
  config.sessionSecret = 'dev-only-insecure-secret';
}

module.exports = config;
