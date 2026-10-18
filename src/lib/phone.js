'use strict';

// Τηλέφωνο σε διεθνή μορφή, μόνο ψηφία (π.χ. «+30 694 123 4567» → "306941234567"), όπως το
// χρειάζεται το WhatsApp (https://wa.me/306941234567). Χωρίς εξαρτήσεις: το χρησιμοποιεί και το config.
//
//  - «+…» ή «00…»: ήδη με κωδικό χώρας.
//  - Ελληνικό κινητό ή σταθερό χωρίς κωδικό (69…, 2…, 10 ψηφία): μπαίνει το 30 μπροστά.
//  - Αριθμός που ξεκινά με 0 (εθνική μορφή άλλης χώρας, π.χ. 07700 900123): δεν ξέρουμε τη χώρα → null.
//  - Αλλιώς θεωρείται ότι γράφτηκε ήδη με κωδικό χώρας χωρίς το «+» (π.χ. 447700900123).
// Αποτέλεσμα: 8 έως 15 ψηφία (όριο του διεθνούς προτύπου E.164), αλλιώς null.

function internationalDigits(raw) {
  const text = String(raw === undefined || raw === null ? '' : raw).trim();
  if (!text) return null;
  const plus = /^\+/.test(text);
  let digits = text.replace(/\D/g, '');
  if (!digits) return null;
  if (!plus) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (/^(69\d{8}|2\d{9})$/.test(digits)) digits = `30${digits}`;
    else if (digits.startsWith('0')) return null;
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return digits;
}

module.exports = { internationalDigits };
