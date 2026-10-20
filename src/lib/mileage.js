'use strict';

// Χιλιόμετρα ενός αυτοκινήτου: «Απεριόριστα χιλιόμετρα» ή «Όριο: N χλμ. ανά ημέρα».
// Αποθηκεύονται με δομή (cars.mileage_limit_km), ώστε να εμφανίζονται μεταφρασμένα παντού
// (αποτελέσματα, σελίδα αυτοκινήτου, προσυμβατική ενημέρωση, emails, εκτύπωση).
// Παλιό ελεύθερο κείμενο που δεν αναγνωρίστηκε μένει στο cars.mileage_policy και εμφανίζεται
// στη λίστα «Μεταφράσεις που λείπουν» της διαχείρισης.
// Κάθε κράτηση κρατά ό,τι γνωστοποιήθηκε στον πελάτη (bookings.mileage_policy / mileage_limit_km).

const UNLIMITED = 'Απεριόριστα χιλιόμετρα';
const LIMIT = 'Όριο: {km} χλμ. ανά ημέρα';
const LIMIT_INLINE = 'έως {km} χλμ. ανά ημέρα';
const MAX_LIMIT_KM = 10000;

function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const UNLIMITED_RE = /^(απεριοριστ\S*|unlimited|ilimitad\S*)( (χιλιομετρα|χλμ\.?|km|mileage|kilometraje))?\.?$/;
// «200 χλμ/ημέρα», «200 km», «Όριο: 200 χλμ. ανά ημέρα», «1.000 km per day»…
const LIMIT_RE = new RegExp(
  [
    '^(?:οριο ?:? ?|limit ?:? ?|max\\.? ?|μεχρι ?|εως ?|up to ?|hasta ?)?',
    '(\\d{1,3}(?:[.,]\\d{3})+|\\d{1,6}) ?',
    '(?:χλμ|χιλιομετρα|χιλ|χμ|km|kms|kilometres|kilometers)\\.?',
    '(?: ?(?:/|ανα|την|τη|το|per|a|al|por) ?(?:ημερα|μερα|24ωρο|day|dia))?\\.?$',
  ].join(''),
);

/** Ελεύθερο κείμενο → { unlimited } | { limitKm } | { custom }. */
function parse(text) {
  const n = normalize(text);
  if (!n || UNLIMITED_RE.test(n)) return { unlimited: true };
  const m = LIMIT_RE.exec(n);
  if (m) {
    const km = Number.parseInt(m[1].replace(/[.,]/g, ''), 10);
    if (km > 0 && km <= MAX_LIMIT_KM) return { limitKm: km };
  }
  return { custom: String(text).trim() };
}

// Το κείμενο που αποθηκεύεται στο mileage_policy (ελληνικά, για τη διαχείριση και ως ιστορικό).
function policyText({ limitKm }) {
  return limitKm ? LIMIT.replace('{km}', String(limitKm)) : UNLIMITED;
}

/**
 * Τα χιλιόμετρα μιας γραμμής: αυτοκίνητο (cars.*) ή κράτηση (το στιγμιότυπο της κράτησης, αλλιώς
 * — παλιές κρατήσεις — του αυτοκινήτου: car_mileage_policy / car_mileage_limit_km).
 */
function of(row) {
  if (!row) return { unlimited: true };
  const snapshot = row.mileage_policy !== null && row.mileage_policy !== undefined;
  const limit = snapshot ? row.mileage_limit_km : row.car_mileage_limit_km;
  const text = snapshot ? row.mileage_policy : row.car_mileage_policy;
  if (limit > 0) return { limitKm: limit };
  if (!text || String(text).trim() === UNLIMITED) return { unlimited: true };
  return { custom: String(text).trim() };
}

function isUnlimited(row) {
  return Boolean(of(row).unlimited);
}

function number(km, intl) {
  return new Intl.NumberFormat(intl).format(km);
}

/** Ετικέτα, π.χ. «Απεριόριστα χιλιόμετρα» / «Όριο: 200 χλμ. ανά ημέρα» (t: μετάφραση της γλώσσας). */
function label(row, t, intl = 'el-GR') {
  const m = of(row);
  if (m.limitKm) return t(LIMIT, { km: number(m.limitKm, intl) });
  return t(m.unlimited ? UNLIMITED : m.custom);
}

/** Μέσα σε πρόταση («Περιλαμβάνονται: …, απεριόριστα χιλιόμετρα, ΦΠΑ»). */
function inline(row, t, intl = 'el-GR') {
  const m = of(row);
  if (m.limitKm) return t(LIMIT_INLINE, { km: number(m.limitKm, intl) });
  return t(m.unlimited ? UNLIMITED : m.custom).toLocaleLowerCase(intl);
}

module.exports = { UNLIMITED, LIMIT, LIMIT_INLINE, MAX_LIMIT_KM, parse, policyText, of, isUnlimited, label, inline };
