'use strict';

// Μικρές βοηθητικές συναρτήσεις ελέγχου δεδομένων φόρμας.
// Κάθε συνάρτηση επιστρέφει { value, errors } ώστε η φόρμα να ξαναεμφανίζεται
// με τα στοιχεία του χρήστη και τα μηνύματα λάθους δίπλα στα πεδία.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()-]{8,20}$/;

function str(value, max = 200) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

function isEmail(value) {
  return value.length <= 254 && EMAIL_RE.test(value);
}

function isPhone(value) {
  return PHONE_RE.test(value) && value.replace(/\D/g, '').length >= 8;
}

function intOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value).trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  return Number.isSafeInteger(n) ? n : null;
}

function checkbox(value) {
  return value === 'on' || value === '1' || value === 'true' || value === true;
}

function passwordProblems(password) {
  if (password.length < 10) return 'Ο κωδικός πρέπει να έχει τουλάχιστον 10 χαρακτήρες.';
  if (password.length > 200) return 'Ο κωδικός είναι πολύ μεγάλος.';
  if (!/[A-Za-zΑ-Ωα-ω]/.test(password) || !/\d/.test(password)) {
    return 'Ο κωδικός πρέπει να περιέχει γράμματα και αριθμούς.';
  }
  return null;
}

module.exports = { str, isEmail, isPhone, intOrNull, checkbox, passwordProblems };
