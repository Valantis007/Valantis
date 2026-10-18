'use strict';

// Στοιχεία της επιχείρησης (από το .env) στη γλώσσα της σελίδας / του email.
//
// Στα ελληνικά εμφανίζονται όπως γράφτηκαν. Στα αγγλικά και στα ισπανικά, για κάθε στοιχείο:
//   1. η μετάφραση από το .env, αν υπάρχει (π.χ. COMPANY_ADDRESS_EN, COMPANY_AUTHORITY_ES)·
//   2. αλλιώς η μετάφραση του λεξικού, για τις προεπιλεγμένες τιμές (π.χ. η αρμόδια αρχή)·
//   3. αλλιώς μεταγραφή με λατινικούς χαρακτήρες (ΕΛΟΤ 743, όπως στα διαβατήρια):
//      «Οδός 1, 54600 Θεσσαλονίκη» → "Odos 1, 54600 Thessaloniki", «Ι.Κ.Ε.» → "I.K.E.".
// Έτσι ο ξένος πελάτης δεν βλέπει ποτέ ελληνικά γράμματα. Η διαχείριση μένει στα ελληνικά.

const config = require('../config');
const i18n = require('./i18n');
const { transliterate, hasGreek } = require('./translit');

// Στοιχεία με κείμενο (μεταφράζονται)· τα υπόλοιπα (ΑΦΜ, ΓΕΜΗ, ΜΗΤΕ, τηλέφωνο) μόνο μεταγράφονται,
// αν έχουν ελληνικά γράμματα (π.χ. «Ε» σε αριθμό ΜΗΤΕ).
const TEXT_FIELDS = ['name', 'legalName', 'seat', 'address', 'taxOffice', 'authority'];
const CODE_FIELDS = ['vat', 'gemi', 'mhte', 'phone'];
// Μεταβλητή του .env για κάθε στοιχείο (για τις οδηγίες της διαχείρισης).
const ENV_NAMES = {
  name: 'COMPANY_NAME',
  legalName: 'COMPANY_LEGAL_NAME',
  seat: 'COMPANY_SEAT',
  address: 'COMPANY_ADDRESS',
  taxOffice: 'COMPANY_TAX_OFFICE',
  authority: 'COMPANY_AUTHORITY',
};
const LABELS = {
  name: 'Διακριτικός τίτλος',
  legalName: 'Επωνυμία',
  seat: 'Έδρα',
  address: 'Διεύθυνση γραφείου',
  taxOffice: 'ΔΟΥ',
  authority: 'Αρμόδια αρχή',
};
// Η συντομογραφία «ΔΟΥ» μεταφράζεται· το όνομα της ΔΟΥ μεταγράφεται («ΔΟΥ Α΄ Θεσσαλονίκης» →
// "Tax Office A' Thessalonikis").
const TAX_OFFICE_RE = /(^|[\s(])Δ\.?\s?Ο\.?\s?Υ\.?(?=$|[\s,)])/g;
const TAX_OFFICE = { en: 'Tax Office', es: 'Oficina de Hacienda' };

/**
 * Ένα στοιχείο στη γλώσσα: { text, source } με source 'original' (ελληνικά ή χωρίς ελληνικά
 * γράμματα), 'env', 'dictionary' ή 'transliteration'.
 */
function localizeField(company, key, locale) {
  const value = String(company[key] || '');
  if (!value || locale === i18n.DEFAULT_LOCALE || !i18n.isLocale(locale)) return { text: value, source: 'original' };
  const override = ((company.translations || {})[locale] || {})[key];
  if (override) return { text: hasGreek(override) ? transliterate(override) : override, source: 'env' };
  if (!hasGreek(value)) return { text: value, source: 'original' };
  const translated = (i18n.dictionaries[locale] || {})[value];
  if (translated !== undefined) return { text: translated, source: 'dictionary' };
  const prepared = key === 'taxOffice' ? value.replace(TAX_OFFICE_RE, (m, before) => `${before}${TAX_OFFICE[locale] || TAX_OFFICE.en}`) : value;
  return { text: transliterate(prepared), source: 'transliteration' };
}

/** Τα στοιχεία της επιχείρησης για μια γλώσσα (ίδια πεδία με το config.company). */
function forLocale(locale, company = config.company) {
  if (locale === i18n.DEFAULT_LOCALE || !i18n.isLocale(locale)) return company;
  const out = { ...company };
  for (const key of TEXT_FIELDS) out[key] = localizeField(company, key, locale).text;
  for (const key of CODE_FIELDS) if (hasGreek(company[key])) out[key] = transliterate(company[key]);
  return out;
}

/**
 * Για τη διαχείριση: στοιχεία που εμφανίζονται στα αγγλικά/ισπανικά με αυτόματη μεταγραφή
 * (μπορεί να θέλετε δική σας μετάφραση στο .env).
 */
function transliterated(company = config.company) {
  const rows = [];
  for (const key of TEXT_FIELDS) {
    for (const locale of ['en', 'es']) {
      const r = localizeField(company, key, locale);
      if (r.source === 'transliteration') rows.push({ key, label: LABELS[key], locale, original: company[key], text: r.text, env: `${ENV_NAMES[key]}_${locale.toUpperCase()}` });
    }
  }
  return rows;
}

// Αποστολέας email: το όνομα (π.χ. ελληνικός διακριτικός τίτλος) στη γλώσσα του παραλήπτη.
function mailFrom(from, locale) {
  if (!from || locale === i18n.DEFAULT_LOCALE || !hasGreek(from)) return from;
  const m = /^\s*"?([^"<]*?)"?\s*<([^<>]+)>\s*$/.exec(from);
  if (!m) return transliterate(from);
  const name = m[1].trim() === config.company.name ? forLocale(locale).name : transliterate(m[1].trim());
  return { name, address: m[2].trim() };
}

module.exports = { forLocale, localizeField, transliterated, mailFrom, TEXT_FIELDS, LABELS, ENV_NAMES };
