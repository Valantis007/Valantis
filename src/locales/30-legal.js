'use strict';

// Νομικά κείμενα: όροι ενοικίασης, πολιτική απορρήτου και το συνημμένο των όρων στα emails.
// Τα ίδια τα κείμενα είναι σε ξεχωριστά αρχεία ανά γλώσσα (views/partials/terms-content.en.ejs,
// privacy-content.es.ejs κ.λπ.)· εδώ μόνο οι σύντομες φράσεις των σελίδων.
// Οι τίτλοι 'Όροι ενοικίασης' και 'Πολιτική απορρήτου & cookies' είναι στο 00-common.js,
// ο τίτλος σελίδας 'Πολιτική απορρήτου' στο 10-pages.js.

module.exports = {
  en: {
    // ---------- views/pages/terms.ejs, views/emails/terms-document.ejs ----------
    'Έκδοση {version}': 'Version {version}',
    'Το κείμενο πρέπει να ελεγχθεί από νομικό σύμβουλο πριν τη δημοσίευση της ιστοσελίδας (αυτή η σημείωση δεν εμφανίζεται σε παραγωγή).':
      'This text must be reviewed by a legal adviser before the website goes live (this note is not shown in production).',

    // ---------- views/pages/privacy.ejs ----------
    'Το κείμενο πρέπει να ελεγχθεί από νομικό σύμβουλο πριν τη δημοσίευση (αυτή η σημείωση δεν εμφανίζεται σε παραγωγή).':
      'This text must be reviewed by a legal adviser before publication (this note is not shown in production).',
  },
  es: {
    // ---------- views/pages/terms.ejs, views/emails/terms-document.ejs ----------
    'Έκδοση {version}': 'Versión {version}',
    'Το κείμενο πρέπει να ελεγχθεί από νομικό σύμβουλο πριν τη δημοσίευση της ιστοσελίδας (αυτή η σημείωση δεν εμφανίζεται σε παραγωγή).':
      'Este texto debe ser revisado por un asesor jurídico antes de publicar el sitio web (esta nota no se muestra en producción).',

    // ---------- views/pages/privacy.ejs ----------
    'Το κείμενο πρέπει να ελεγχθεί από νομικό σύμβουλο πριν τη δημοσίευση (αυτή η σημείωση δεν εμφανίζεται σε παραγωγή).':
      'Este texto debe ser revisado por un asesor jurídico antes de su publicación (esta nota no se muestra en producción).',
  },
};
