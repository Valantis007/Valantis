'use strict';

const moneyFmt = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });

function money(cents) {
  return moneyFmt.format((cents || 0) / 100);
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
function utcTimestamp(value, timezone = 'Europe/Athens') {
  if (!value) return '';
  const d = new Date(`${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('el-GR', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' });
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
  },
};

function label(group, key) {
  return (labels[group] && labels[group][key]) || key;
}

module.exports = { money, centsToInput, parseMoneyToCents, date, dateTime, utcTimestamp, labels, label };
