'use strict';

const mileage = require('./mileage');

const moneyFmts = {};
function moneyFormatter(intl) {
  if (!moneyFmts[intl]) moneyFmts[intl] = new Intl.NumberFormat(intl, { style: 'currency', currency: 'EUR' });
  return moneyFmts[intl];
}

function money(cents, intl = 'el-GR') {
  return moneyFormatter(intl).format((cents || 0) / 100);
}

// Για πεδία φόρμας: 1234 λεπτά -> "12.34"
function centsToInput(cents) {
  return ((cents || 0) / 100).toFixed(2);
}

function parseMoneyToCents(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number.parseFloat(normalized) * 100);
}

function date(local) {
  if (!local) return '';
  const [y, m, d] = local.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function dateTime(local) {
  if (!local) return '';
  return `${date(local)} ${local.slice(11, 16)}`;
}

// Για χρονοσφραγίδες SQLite σε UTC (π.χ. created_at).
function utcTimestamp(value, timezone = 'Europe/Athens', intl = 'el-GR') {
  if (!value) return '';
  const d = new Date(`${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(intl, { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' });
}

const labels = {
  category: {
    mini: 'Μίνι',
    economy: 'Οικονομικό',
    compact: 'Compact',
    family: 'Οικογενειακό',
    suv: 'SUV',
    van: 'Van / 7-9 θέσεων',
    luxury: 'Πολυτελείας',
    convertible: 'Cabrio',
  },
  transmission: { manual: 'Χειροκίνητο', automatic: 'Αυτόματο' },
  fuel: { petrol: 'Βενζίνη', diesel: 'Diesel', hybrid: 'Υβριδικό', electric: 'Ηλεκτρικό', lpg: 'Υγραέριο' },
  status: {
    pending_payment: 'Αναμονή πληρωμής',
    confirmed: 'Επιβεβαιωμένη',
    active: 'Σε εξέλιξη',
    completed: 'Ολοκληρώθηκε',
    cancelled: 'Ακυρώθηκε',
    expired: 'Έληξε',
  },
  paymentMethod: { card: 'Κάρτα (online)', pay_at_pickup: 'Κατά την παραλαβή' },
  paymentStatus: {
    unpaid: 'Απλήρωτη',
    paid: 'Εξοφλημένη',
    refunded: 'Επιστράφηκαν τα χρήματα',
    partially_refunded: 'Μερική επιστροφή',
  },
  pricing: { per_day: 'ανά ημέρα', per_rental: 'ανά ενοικίαση' },
  event: {
    created: 'Δημιουργία',
    paid: 'Πληρωμή',
    picked_up: 'Παράδοση αυτοκινήτου',
    returned: 'Επιστροφή αυτοκινήτου',
    cancelled: 'Ακύρωση',
    expired: 'Λήξη',
    refunded: 'Επιστροφή χρημάτων',
    refund_due: 'Οφειλόμενη επιστροφή',
    payment_returned: 'Αυτόματη επιστροφή πληρωμής',
    charges_paid: 'Πληρωμή χρεώσεων',
    deposit_link: 'Σύνδεσμος εγγύησης',
    deposit_link_cancelled: 'Ακύρωση συνδέσμου εγγύησης',
    deposit_held: 'Δέσμευση εγγύησης',
    deposit_rejected: 'Απόρριψη κάρτας εγγύησης',
    deposit_expired: 'Λήξη δέσμευσης εγγύησης',
    deposit_released: 'Αποδέσμευση εγγύησης',
    deposit_settled: 'Εκκαθάριση εγγύησης',
    charge_added: 'Νέα χρέωση',
    charge_accepted: 'Αποδοχή χρέωσης από πελάτη',
    charge_disputed: 'Αμφισβήτηση χρέωσης από πελάτη',
    charge_accept: 'Καταγραφή συναίνεσης για χρέωση',
    charge_withdraw: 'Απόσυρση χρέωσης',
    charge_mark_paid: 'Εξόφληση χρέωσης εκτός συστήματος',
  },
  depositStatus: {
    awaiting: 'Αναμονή έγκρισης από τον πελάτη',
    held: 'Δεσμευμένη',
    released: 'Αποδεσμεύτηκε',
    captured: 'Εκκαθαρίστηκε (με παρακράτηση)',
    expired: 'Έληξε',
    failed: 'Απέτυχε',
    cancelled: 'Ακυρώθηκε',
  },
  depositMethod: { pos: 'POS γραφείου', stripe: 'Online (Stripe)', revolut: 'Online (Revolut)' },
  chargeCategory: {
    fuel: 'Καύσιμο',
    late_return: 'Καθυστέρηση επιστροφής',
    cleaning: 'Ειδικός καθαρισμός',
    fines_admin: 'Διαχείριση προστίμου / διοδίων',
    damage: 'Ζημιά',
    other: 'Άλλη χρέωση (με αποδοχή πελάτη)',
  },
  fiscalKind: {
    receipt: 'Απόδειξη (ΑΠΥ)',
    invoice: 'Τιμολόγιο παροχής υπηρεσιών',
    credit: 'Πιστωτικό',
  },
  chargeStatus: {
    proposed: 'Αναμονή απάντησης πελάτη',
    accepted: 'Αποδεκτή',
    disputed: 'Αμφισβητείται',
    withdrawn: 'Αποσύρθηκε',
    charged: 'Εξοφλήθηκε',
  },
  // Είδος μηνύματος της φόρμας επικοινωνίας.
  messageKind: {
    question: 'Ερώτηση',
    complaint: 'Παράπονο',
    charge_dispute: 'Αμφισβήτηση χρέωσης',
    change_request: 'Αίτημα αλλαγής κράτησης',
  },
  refundStatus: { pending: 'Σε εξέλιξη', done: 'Ολοκληρώθηκε', failed: 'Απέτυχε' },
  checkoutKind: { rental: 'Ενοικίαση', deposit: 'Εγγύηση', charge: 'Χρεώσεις' },
  checkoutStatus: {
    open: 'Ανοιχτή',
    paid: 'Πληρώθηκε',
    authorised: 'Δεσμεύτηκε',
    expired: 'Έκλεισε',
    refund_pending: 'Επιστρέφεται',
    refunded: 'Επιστράφηκε',
  },
};

// Χρονοσφραγίδα σε χιλιοστά (π.χ. λήξη δέσμευσης) σε τοπική ώρα.
function msDateTime(ms, timezone = 'Europe/Athens', intl = 'el-GR') {
  if (!ms) return '';
  return new Date(ms).toLocaleString(intl, { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' });
}

function label(group, key) {
  return (labels[group] && labels[group][key]) || key;
}

/**
 * Το ίδιο API για μια γλώσσα: ποσά (π.χ. «€75.00» στα αγγλικά) και μεταφρασμένες ετικέτες.
 * Οι ημερομηνίες μένουν ηη/μμ/εεεε σε όλες τις γλώσσες.
 */
const localized = {};
function forLocale(locale = 'el') {
  if (localized[locale]) return localized[locale];
  // Φορτώνεται εδώ για να μην υπάρχει κυκλική εξάρτηση.
  const i18n = require('./i18n');
  const intl = i18n.INTL[locale] || 'el-GR';
  localized[locale] = {
    ...module.exports,
    locale,
    money: (cents) => money(cents, intl),
    utcTimestamp: (value, timezone) => utcTimestamp(value, timezone, intl),
    msDateTime: (ms, timezone) => msDateTime(ms, timezone, intl),
    label: (group, key) => i18n.t(locale, label(group, key)),
    // Χιλιόμετρα αυτοκινήτου ή κράτησης: «Απεριόριστα χιλιόμετρα» / «Όριο: 200 χλμ. ανά ημέρα».
    mileage: (row) => mileage.label(row, (v, p) => i18n.t(locale, v, p), intl),
    // Μέσα σε πρόταση: «απεριόριστα χιλιόμετρα» / «έως 200 χλμ. ανά ημέρα».
    mileageInline: (row) => mileage.inline(row, (v, p) => i18n.t(locale, v, p), intl),
  };
  return localized[locale];
}

module.exports = { money, centsToInput, parseMoneyToCents, date, dateTime, utcTimestamp, msDateTime, labels, label, forLocale };
