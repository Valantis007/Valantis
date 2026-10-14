'use strict';

// Όλες οι ώρες παραλαβής/επιστροφής αποθηκεύονται ως «τοπική ώρα καταστήματος»
// σε μορφή ΕΕΕΕ-ΜΜ-ΗΗTΩΩ:ΛΛ (π.χ. 2026-07-15T10:30). Έτσι η σύγκριση κειμένου
// ισοδυναμεί με χρονολογική σύγκριση και ο πελάτης βλέπει ακριβώς την ώρα που επέλεξε.

const config = require('../config');

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

function fromMs(ms) {
  return new Date(ms).toISOString().slice(0, 16);
}

// Επιστρέφει «ψευδο-UTC» χιλιοστά ώστε να γίνονται πράξεις με ημερομηνίες.
function toMs(local) {
  if (typeof local !== 'string') return Number.NaN;
  const m = LOCAL_RE.exec(local);
  if (!m) return Number.NaN;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  // Απορρίπτει μη υπαρκτές ημερομηνίες όπως 2026-02-30.
  return fromMs(ms) === local ? ms : Number.NaN;
}

function isValidLocal(local) {
  return !Number.isNaN(toMs(local));
}

function combine(date, time) {
  if (!DATE_RE.test(String(date || '')) || !TIME_RE.test(String(time || ''))) return null;
  const local = `${date}T${time}`;
  return isValidLocal(local) ? local : null;
}

function nowLocal(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.rules.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function addMinutes(local, minutes) {
  return fromMs(toMs(local) + minutes * MINUTE);
}

function minutesBetween(a, b) {
  return Math.round((toMs(b) - toMs(a)) / MINUTE);
}

// Ημέρες χρέωσης: κάθε 24ωρο μετράει ως ημέρα, ελάχιστο 1,
// με περιθώριο χάριτος για μικρές καθυστερήσεις.
function rentalDays(pickupAt, returnAt, graceMinutes = config.rules.graceMinutes) {
  const minutes = minutesBetween(pickupAt, returnAt);
  if (!(minutes > 0)) return 0;
  return Math.max(1, Math.ceil((minutes - graceMinutes) / (24 * 60)));
}

function datePart(local) {
  return local.slice(0, 10);
}

function timePart(local) {
  return local.slice(11, 16);
}

function addDaysToDate(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

// Ηλικία (σε πλήρη έτη) σε μια συγκεκριμένη ημερομηνία.
function yearsBetween(fromDate, toDate) {
  const [y1, m1, d1] = fromDate.split('-').map(Number);
  const [y2, m2, d2] = toDate.split('-').map(Number);
  let years = y2 - y1;
  if (m2 < m1 || (m2 === m1 && d2 < d1)) years -= 1;
  return years;
}

function isValidDate(date) {
  return DATE_RE.test(String(date || '')) && isValidLocal(`${date}T00:00`);
}

// Επιλογές ώρας ανά 30 λεπτά μέσα στο ωράριο λειτουργίας.
function timeSlots() {
  const slots = [];
  for (let h = config.rules.openingHour; h <= config.rules.closingHour; h += 1) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    if (h < config.rules.closingHour) slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

function isWithinOpeningHours(local) {
  const [h, m] = timePart(local).split(':').map(Number);
  const minutes = h * 60 + m;
  return minutes >= config.rules.openingHour * 60 && minutes <= config.rules.closingHour * 60;
}

module.exports = {
  toMs,
  fromMs,
  isValidLocal,
  isValidDate,
  combine,
  nowLocal,
  addMinutes,
  minutesBetween,
  rentalDays,
  datePart,
  timePart,
  addDaysToDate,
  yearsBetween,
  timeSlots,
  isWithinOpeningHours,
};
