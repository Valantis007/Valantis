'use strict';

process.env.NODE_ENV = 'test';
process.env.ONE_WAY_FEE = '30';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.REVOLUT_WEBHOOK_SECRET = 'wsk_test_secret';
process.env.BASE_URL = 'https://rent.example.gr';
process.env.ADMIN_NOTIFY_EMAIL = 'office@example.gr';
process.env.COMPANY_MHTE = '0933E60000123400';
process.env.COMPANY_GEMI = '123456789000';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { openDb } = require('../src/db');
const { seedIfEmpty } = require('../src/db/seed-data');
const { createApp } = require('../src/app');
const time = require('../src/lib/time');
const mailer = require('../src/lib/mailer');

function setup() {
  const db = openDb(':memory:');
  seedIfEmpty(db);
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rental-uploads-'));
  const app = createApp({ db, uploadDir });
  mailer.outbox.length = 0;
  return { db, app };
}

// Ημερομηνία N ημέρες από σήμερα (τοπική ώρα καταστήματος).
function daysFromNow(n) {
  return time.addDaysToDate(time.datePart(time.nowLocal()), n);
}

function searchParams({ car = 1, from = 30, days = 3, pickupLocation = 1, returnLocation = 1, pickupTime = '10:00', returnTime = '10:00' } = {}) {
  return {
    car_id: String(car),
    pickup_location: String(pickupLocation),
    return_location: String(returnLocation),
    pickup_date: daysFromNow(from),
    pickup_time: pickupTime,
    return_date: daysFromNow(from + days),
    return_time: returnTime,
  };
}

function driver(overrides = {}) {
  return {
    first_name: 'Γιώργος',
    last_name: 'Παπαδόπουλος',
    email: 'giorgos@example.com',
    phone: '+30 6900000000',
    birth_date: '1990-05-10',
    license_number: 'AB123456',
    license_country: 'Ελλάδα',
    license_issued: '2010-01-01',
    payment_method: 'pay_at_pickup',
    terms: '1',
    ...overrides,
  };
}

async function csrf(agent, url = '/contact') {
  const res = await agent.get(url);
  const m = /name="_csrf" value="([a-f0-9]+)"/.exec(res.text);
  if (!m) throw new Error(`Δεν βρέθηκε CSRF token στο ${url} (status ${res.status})`);
  return m[1];
}

async function post(agent, url, data, tokenUrl) {
  const token = await csrf(agent, tokenUrl);
  return agent.post(url).type('form').send({ ...data, _csrf: token });
}

async function createUser(db, { email = 'user@example.com', password = 'Password123', role = 'customer' } = {}) {
  const hash = await bcrypt.hash(password, 4);
  const res = db
    .prepare('INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)')
    .run(email, hash, 'Test', 'User', role);
  return { id: Number(res.lastInsertRowid), email, password };
}

async function login(agent, { email, password }) {
  return post(agent, '/login', { email, password }, '/login');
}

function agent(app) {
  return request.agent(app);
}

// Ενεργοποιεί ψεύτικο Stripe/Revolut για ένα test και τον απενεργοποιεί στο τέλος.
function useStripe(t) {
  const { fakeStripe } = require('./fakes');
  const providers = require('../src/lib/providers');
  const fake = fakeStripe();
  providers.PROVIDERS.stripe.setClient(fake.client);
  providers.PROVIDERS.revolut.setClient(null);
  t.after(() => providers.PROVIDERS.stripe.setClient(null));
  return fake;
}

function useRevolut(t) {
  const { fakeRevolut } = require('./fakes');
  const providers = require('../src/lib/providers');
  const fake = fakeRevolut();
  providers.PROVIDERS.revolut.setClient(fake.client);
  providers.PROVIDERS.stripe.setClient(null);
  t.after(() => providers.PROVIDERS.revolut.setClient(null));
  return fake;
}

function bookingRef(res) {
  const m = /\/booking\/([A-Z0-9]{8})/.exec(res.headers.location || '');
  return m ? m[1] : null;
}

module.exports = {
  setup,
  daysFromNow,
  searchParams,
  driver,
  csrf,
  post,
  createUser,
  login,
  agent,
  request,
  mailer,
  time,
  useStripe,
  useRevolut,
  bookingRef,
};
