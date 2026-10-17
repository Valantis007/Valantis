'use strict';

// Γλώσσες της ιστοσελίδας.
//
//  - Ελληνικά (προεπιλογή): χωρίς πρόθεμα, π.χ. /cars
//  - Αγγλικά: /en/cars      - Ισπανικά: /es/cars
//
// Οι μεταφράσεις είναι λεξικά στον φάκελο src/locales/, με κλειδί το ΑΚΡΙΒΕΣ ελληνικό κείμενο:
//   module.exports = { en: { 'Στόλος': 'Fleet' }, es: { 'Στόλος': 'Flota' } };
// Μεταβλητά τμήματα γράφονται ως {όνομα}: t('Κράτηση {ref}', { ref }).
// Κείμενο χωρίς μετάφραση εμφανίζεται στα ελληνικά (και καταγράφεται στο `missing`).
//
// Η διαχείριση (/admin) και τα emails προς το γραφείο είναι πάντα στα ελληνικά.

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

const LOCALES = ['el', 'en', 'es'];
const DEFAULT_LOCALE = 'el';
const NAMES = { el: 'Ελληνικά', en: 'English', es: 'Español' };
const SHORT = { el: 'ΕΛ', en: 'EN', es: 'ES' };
// Για Intl (αριθμοί, ημερομηνίες) και για τη σελίδα πληρωμής του παρόχου.
const INTL = { el: 'el-GR', en: 'en-GB', es: 'es-ES' };
// Διαδρομές που δεν έχουν γλωσσικό πρόθεμα.
const UNPREFIXED = /^\/(admin|webhooks|css|js|img|uploads|healthz)(\/|$|\?)/;

const dictionaries = { en: {}, es: {} };
const missing = new Set();

function loadDictionaries(dir = path.join(__dirname, '..', 'locales')) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
    const mod = require(path.join(dir, file));
    for (const locale of Object.keys(dictionaries)) Object.assign(dictionaries[locale], mod[locale] || {});
  }
}
loadDictionaries();

// Μήνυμα που μεταφράζεται εκεί όπου εμφανίζεται (π.χ. σφάλματα από τη λογική της κράτησης).
class Msg {
  constructor(key, params = {}) {
    this.key = key;
    this.params = params;
  }

  toString() {
    return interpolate(this.key, this.params);
  }

  toJSON() {
    return { key: this.key, params: this.params };
  }
}

function msg(key, params) {
  return new Msg(key, params);
}

function interpolate(text, params) {
  if (!params) return text;
  return String(text).replace(/\{(\w+)\}/g, (m, name) => (params[name] === undefined || params[name] === null ? m : String(params[name])));
}

function isLocale(value) {
  return LOCALES.includes(value);
}

/**
 * Μετάφραση. Δέχεται κείμενο, Msg ή αντικείμενο { key, params } (π.χ. από το session).
 */
function t(locale, value, params) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.key !== undefined) return t(locale, value.key, value.params || params);
  const key = String(value);
  if (locale === DEFAULT_LOCALE || !dictionaries[locale]) return interpolate(key, params);
  const translated = dictionaries[locale][key];
  if (translated === undefined) {
    if (/[Α-Ωα-ωΆ-ώ]/.test(key)) missing.add(`${locale}: ${key}`);
    return interpolate(key, params);
  }
  return interpolate(translated, params);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Μετάφραση για κείμενο με απλά HTML tags (π.χ. <strong>, <a href="{url}">). Η μετάφραση είναι
 * δικό μας κείμενο· οι τιμές των {πεδίων} γίνονται escape. Χρήση: <%- th('...', { ... }) %>.
 */
function th(locale, value, params) {
  const safe = {};
  for (const [k, v] of Object.entries(params || {})) safe[k] = v === null || v === undefined ? v : escapeHtml(v);
  if (value && typeof value === 'object' && value.key !== undefined) return th(locale, value.key, value.params || params);
  return t(locale, value, safe);
}

function prefix(locale) {
  return !locale || locale === DEFAULT_LOCALE ? '' : `/${locale}`;
}

// Διαδρομή της ιστοσελίδας στη γλώσσα `locale` (οι εξωτερικοί σύνδεσμοι μένουν ως έχουν).
function localizePath(locale, p) {
  if (typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//')) return p;
  if (UNPREFIXED.test(p)) return p;
  const stripped = p.replace(/^\/(en|es)(?=\/|\?|#|$)/, '') || '/';
  const pre = prefix(locale);
  if (!pre) return stripped;
  return stripped === '/' ? pre : `${pre}${stripped.startsWith('/?') || stripped.startsWith('/#') ? stripped.slice(1) : stripped}`;
}

// Πλήρης διεύθυνση της ιστοσελίδας για τη γλώσσα (για emails και σελίδες πληρωμής).
function siteUrl(locale) {
  return `${config.baseUrl}${prefix(locale)}`;
}

// Πεδίο περιεχομένου στη γλώσσα: row.name_en / row.name_es, αλλιώς το ελληνικό row.name.
function field(row, name, locale) {
  if (!row) return '';
  if (locale && locale !== DEFAULT_LOCALE) {
    const value = row[`${name}_${locale}`];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return row[name] ?? '';
}

// Αρχείο template ανά γλώσσα, με την κατάληξη .ejs (αλλιώς το EJS θεωρεί το «.en» κατάληξη):
// lt('../partials/terms-content') -> '../partials/terms-content.en.ejs'
function fileFor(name, locale) {
  const base = String(name).replace(/\.ejs$/, '');
  return !locale || locale === DEFAULT_LOCALE ? `${base}.ejs` : `${base}.${locale}.ejs`;
}

// Σύνδεσμοι της επιλογής γλώσσας για μια διαδρομή της ιστοσελίδας (χωρίς πρόθεμα γλώσσας).
function languageLinks(locale, here) {
  return LOCALES.map((code) => ({
    code,
    name: NAMES[code],
    short: SHORT[code],
    href: localizePath(code, here),
    current: code === locale,
  }));
}

/**
 * Express middleware: διαβάζει το πρόθεμα γλώσσας, το αφαιρεί από τη διαδρομή και ετοιμάζει
 * τα t(), u() κ.λπ. για τα templates. Οι ανακατευθύνσεις μένουν αυτόματα στην ίδια γλώσσα.
 */
function middleware(req, res, next) {
  const m = /^\/(en|es)(?=\/|\?|$)/.exec(req.url);
  let locale = DEFAULT_LOCALE;
  if (m) {
    locale = m[1];
    req.url = req.url.slice(m[0].length) || '/';
    if (req.url.startsWith('?')) req.url = `/${req.url}`;
    // Η διαχείριση είναι μόνο στα ελληνικά.
    if (UNPREFIXED.test(req.url)) return res.redirect(301, req.url);
  }
  req.locale = locale;
  req.t = (value, params) => t(locale, value, params);

  const redirect = res.redirect.bind(res);
  res.redirect = function localizedRedirect(a, b) {
    if (typeof a === 'number') return redirect(a, localizePath(locale, b));
    return redirect(localizePath(locale, a));
  };

  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const here = req.url.split('?')[0];
  Object.assign(res.locals, {
    locale,
    intlLocale: INTL[locale],
    t: req.t,
    th: (value, params) => th(locale, value, params),
    u: (p) => localizePath(locale, p),
    lt: (name) => fileFor(name, locale),
    tf: (row, name) => field(row, name, locale),
    langPrefix: prefix(locale),
    // Μετά από POST (π.χ. φόρμα με σφάλματα) η διαδρομή μπορεί να μην ανοίγει με GET: η σελίδα
    // ορίζει τότε τη σωστή με res.locals.languages = languageLinks(req.locale, '/...').
    languages: languageLinks(locale, here + query),
  });
  next();
}

module.exports = {
  LOCALES,
  DEFAULT_LOCALE,
  NAMES,
  INTL,
  Msg,
  msg,
  t,
  th,
  escapeHtml,
  isLocale,
  prefix,
  localizePath,
  siteUrl,
  fileFor,
  field,
  languageLinks,
  middleware,
  missing,
  dictionaries,
  loadDictionaries,
};
