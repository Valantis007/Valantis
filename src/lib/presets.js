'use strict';

// Κείμενα που γράφει το γραφείο και διαβάζει ο πελάτης (αιτία ακύρωσης, περιγραφή χρέωσης).
//  - Έτοιμες επιλογές: αποθηκεύονται στα ελληνικά και εμφανίζονται μεταφρασμένες στη γλώσσα
//    του πελάτη (σελίδες και emails)· οι μεταφράσεις είναι στο src/locales/81-everything.js.
//  - Ελεύθερο κείμενο: ο πελάτης το διαβάζει όπως γράφτηκε, άρα γράφεται στη γλώσσα του.
//    Για πελάτη στα αγγλικά/ισπανικά δεν γίνεται δεκτό κείμενο με ελληνικά.

const { looksGreek } = require('./translit');

// Αιτία ακύρωσης από το γραφείο (email «Ακύρωση κράτησης» προς τον πελάτη).
const CANCEL_REASONS = [
  { code: 'office', text: 'Ακύρωση από το γραφείο' },
  { code: 'car_unavailable', text: 'Βλάβη ή μη διαθεσιμότητα του αυτοκινήτου' },
  { code: 'customer_request', text: 'Κατόπιν αιτήματος του πελάτη' },
  { code: 'no_show', text: 'Μη εμφάνιση κατά την παραλαβή' },
  // Χωρίς έτοιμο κείμενο: η αιτία γράφεται στη σημείωση (στη γλώσσα του πελάτη).
  { code: 'other', text: null, label: 'Άλλος λόγος (γράψτε τον στη σημείωση)' },
];

// Έτοιμες περιγραφές χρεώσεων μετά την επιστροφή, ανά κατηγορία (η ζημιά περιγράφεται πάντα).
const CHARGE_DESCRIPTIONS = {
  fuel: ['Καύσιμο που έλειπε κατά την επιστροφή'],
  late_return: ['Επιστροφή μετά την ώρα της κράτησης'],
  cleaning: ['Ειδικός καθαρισμός του αυτοκινήτου'],
  fines_admin: ['Διαχείριση κλήσης / προστίμου', 'Διαχείριση διοδίων που δεν πληρώθηκαν'],
  other: ['Απώλεια κλειδιού του αυτοκινήτου'],
};
const ALL_CHARGE_DESCRIPTIONS = new Set(Object.values(CHARGE_DESCRIPTIONS).flat());

const LANGUAGE = { el: 'ελληνικά', en: 'αγγλικά', es: 'ισπανικά' };

function cancelReason(code) {
  return CANCEL_REASONS.find((r) => r.code === code) || null;
}

function isChargeDescription(text) {
  return ALL_CHARGE_DESCRIPTIONS.has(text);
}

function languageName(locale) {
  return LANGUAGE[locale] || LANGUAGE.el;
}

// Οδηγία δίπλα σε κάθε ελεύθερο κείμενο που φτάνει στον πελάτη (διαχείριση).
function languageHint(locale) {
  return `Ο πελάτης μιλά ${languageName(locale)} — γράψτε το κείμενο σε αυτή τη γλώσσα.`;
}

/**
 * Ελεύθερα κείμενα προς πελάτη στα αγγλικά/ισπανικά: επιστρέφει μήνυμα σφάλματος (ελληνικά, για
 * τη διαχείριση) αν κάποιο έχει ελληνικό κείμενο, αλλιώς null. `fields`: { 'Περιγραφή': '...' }.
 * Οι πινακίδες (π.χ. «ΝΒΑ1001») δεν μετράνε ως ελληνικό κείμενο.
 */
function foreignTextProblem(locale, fields) {
  if (!locale || locale === 'el') return null;
  const greek = Object.entries(fields)
    .filter(([, value]) => value && looksGreek(value))
    .map(([label]) => `«${label}»`);
  if (!greek.length) return null;
  const lang = languageName(locale);
  return `Ο πελάτης μιλά ${lang}: γράψτε ${greek.length > 1 ? 'τα πεδία' : 'το πεδίο'} ${greek.join(', ')} στα ${lang} (π.χ. με DeepL ή Google Translate) — το διαβάζει όπως το γράφετε. Μπορείτε επίσης να διαλέξετε έτοιμο κείμενο, που μεταφράζεται αυτόματα.`;
}

module.exports = { CANCEL_REASONS, CHARGE_DESCRIPTIONS, cancelReason, isChargeDescription, languageName, languageHint, foreignTextProblem };
