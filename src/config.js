'use strict';

const path = require('node:path');
require('dotenv').config({ quiet: true });

const env = process.env;
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

const nodeEnv = env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

const config = {
  env: nodeEnv,
  isProduction,
  isTest,
  port: int('PORT', 3000),
  baseUrl: (env.BASE_URL || `http://localhost:${int('PORT', 3000)}`).replace(/\/+$/, ''),
  sessionSecret: env.SESSION_SECRET || '',
  dbPath: env.DB_PATH ? path.resolve(root, env.DB_PATH) : path.join(root, 'data', 'app.db'),
  uploadDir: env.UPLOAD_DIR ? path.resolve(root, env.UPLOAD_DIR) : path.join(root, 'data', 'uploads'),
  trustProxy: int('TRUST_PROXY', 0),

  company: {
    name: env.COMPANY_NAME || 'Rent a Car',
    legalName: env.COMPANY_LEGAL_NAME || 'Επωνυμία Επιχείρησης',
    vat: env.COMPANY_VAT || '',
    taxOffice: env.COMPANY_TAX_OFFICE || '',
    gemi: env.COMPANY_GEMI || '',
    address: env.COMPANY_ADDRESS || '',
    phone: env.COMPANY_PHONE || '',
    email: env.COMPANY_EMAIL || '',
  },

  rules: {
    timezone: env.TIMEZONE || 'Europe/Athens',
    openingHour: int('OPENING_HOUR', 8),
    closingHour: int('CLOSING_HOUR', 22),
    minLeadMinutes: int('MIN_LEAD_MINUTES', 120),
    maxRentalDays: int('MAX_RENTAL_DAYS', 90),
    maxAdvanceDays: int('MAX_ADVANCE_DAYS', 365),
    turnaroundMinutes: int('TURNAROUND_MINUTES', 60),
    freeCancellationHours: int('FREE_CANCELLATION_HOURS', 48),
    oneWayFeeCents: euros('ONE_WAY_FEE', 3000),
    minLicenseYears: int('MIN_LICENSE_YEARS', 1),
    vatPercent: int('VAT_PERCENT', 24),
    durationDiscounts: parseDurationDiscounts(env.DURATION_DISCOUNTS || '7:5,14:10,28:15'),
    paymentHoldMinutes: Math.max(int('PAYMENT_HOLD_MINUTES', 35), 31),
    // Περίοδος χάριτος: μια καθυστέρηση έως 59 λεπτά δεν χρεώνεται ως επιπλέον ημέρα.
    graceMinutes: 59,
  },

  stripe: {
    secretKey: env.STRIPE_SECRET_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
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

if (!config.sessionSecret) {
  if (isProduction) {
    throw new Error('Ορίστε SESSION_SECRET στο αρχείο .env πριν την εκκίνηση σε παραγωγή.');
  }
  config.sessionSecret = 'dev-only-insecure-secret';
}

module.exports = config;
