'use strict';

process.env.NODE_ENV = 'test';
process.env.ONE_WAY_FEE = '30';

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

module.exports = { setup, daysFromNow, searchParams, driver, csrf, post, createUser, login, agent, request, mailer, time };
