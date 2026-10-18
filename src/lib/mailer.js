'use strict';

const path = require('node:path');
const ejs = require('ejs');
const nodemailer = require('nodemailer');
const config = require('../config');
const format = require('./format');
const i18n = require('./i18n');
const company = require('./company');

const templatesDir = path.join(__dirname, '..', '..', 'views', 'emails');
const smtpConfigured = Boolean(config.mail.host);

const transport = smtpConfigured
  ? nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
      // Ένας αργός/μπλοκαρισμένος SMTP server δεν πρέπει να «κρεμάει» την εφαρμογή.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    })
  : nodemailer.createTransport({ jsonTransport: true });

// Στα tests κρατάμε τα emails εδώ για να ελέγχουμε τι στάλθηκε.
const outbox = [];

// Τα τελευταία emails για τη σελίδα «Έλεγχος συστήματος» (μόνο στη μνήμη, χάνονται με την επανεκκίνηση).
// Το περιεχόμενο κρατιέται μόνο σε δοκιμές (εκτός παραγωγής ή χωρίς SMTP), για προεπισκόπηση.
const recent = [];
let lastId = 0;
const keepContent = () => !config.isProduction || !smtpConfigured;
function remember(entry, message = null) {
  lastId += 1;
  const item = { id: lastId, at: new Date().toISOString(), ...entry };
  if (message && keepContent()) {
    item.html = message.html;
    item.attachments = (message.attachments || []).map((a) => a.filename).filter(Boolean);
  }
  recent.unshift(item);
  recent.length = Math.min(recent.length, 30);
}

// Γλώσσα ενός email: ρητή, αλλιώς της κράτησης. Τα emails προς το γραφείο (admin-*) πάντα ελληνικά.
function localeFor(template, data = {}, locale = null) {
  if (template.startsWith('admin-')) return i18n.DEFAULT_LOCALE;
  const candidate = locale || data.locale || (data.booking && data.booking.locale) || (data.user && data.user.locale);
  return i18n.isLocale(candidate) ? candidate : i18n.DEFAULT_LOCALE;
}

async function render(template, data = {}, locale = null) {
  // Το providers φορτώνεται εδώ για να μην υπάρχει κυκλική εξάρτηση κατά την εκκίνηση.
  const providers = require('./providers');
  const active = providers.active();
  const lang = localeFor(template, data, locale);
  const locals = {
    ...data,
    config,
    format: format.forLocale(lang),
    // Στοιχεία επιχείρησης στη γλώσσα του email (στα αγγλικά/ισπανικά χωρίς ελληνικά γράμματα).
    company: company.forLocale(lang),
    locale: lang,
    t: (value, params) => i18n.t(lang, value, params),
    th: (value, params) => i18n.th(lang, value, params),
    lt: (name) => i18n.fileFor(name, lang),
    tf: (row, name) => i18n.field(row, name, lang),
    // Σύνδεσμοι στη γλώσσα του παραλήπτη (π.χ. https://.../en/manage).
    baseUrl: i18n.siteUrl(lang),
    siteUrl: config.baseUrl,
    paymentsEnabled: Boolean(active),
    paymentProviderLabel: active ? active.label : '',
  };
  return ejs.renderFile(path.join(templatesDir, `${template}.ejs`), locals);
}

/**
 * Στέλνει email από πρότυπο του φακέλου views/emails.
 * Δεν «πετάει» σφάλμα: μια αποτυχία αποστολής δεν πρέπει να χαλάσει μια κράτηση.
 */
async function send({ to, subject, template, data = {}, replyTo, attachments, locale = null }) {
  if (!to) return false;
  const lang = localeFor(template, data, locale);
  // Το θέμα μπορεί να είναι Msg (i18n.msg) ή ελληνικό κείμενο: μεταφράζεται στη γλώσσα του email.
  subject = i18n.t(lang, subject);
  try {
    const html = await render(template, { ...data, subject }, lang);
    // Το όνομα του αποστολέα (αν είναι ελληνικό) στη γλώσσα του παραλήπτη.
    const message = { from: company.mailFrom(config.mail.from, lang), to, subject, html, replyTo, attachments };
    if (config.isTest) {
      outbox.push(message);
      remember({ to, subject, locale: lang, status: 'sent' }, message);
      return true;
    }
    await transport.sendMail(message);
    if (!smtpConfigured) console.log(`[email δεν στάλθηκε - δεν έχει ρυθμιστεί SMTP] Προς: ${to} | Θέμα: ${subject}`);
    remember({ to, subject, locale: lang, status: smtpConfigured ? 'sent' : 'not_configured' }, message);
    return true;
  } catch (err) {
    console.error(`[email] Αποτυχία αποστολής προς ${to}:`, err.message);
    remember({ to, subject, locale: lang, status: 'failed', error: String(err.message).slice(0, 200) });
    return false;
  }
}

// Αποστολή στο παρασκήνιο: η απάντηση στον χρήστη δεν περιμένει τον SMTP server.
const pending = new Set();
function sendInBackground(message) {
  const p = send(message).finally(() => pending.delete(p));
  pending.add(p);
  return p;
}

// Για tests και ομαλό τερματισμό: περιμένει να σταλούν όσα είναι σε εξέλιξη.
async function flush() {
  while (pending.size) await Promise.allSettled([...pending]);
}

// Ονόματα των συνημμένων με τους όρους στη γλώσσα του email ({v}: έκδοση των όρων).
const TERMS_FILES = {
  en: { translation: 'rental-terms-{v}-en.html', original: 'rental-terms-{v}-greek-original.html' },
  es: { translation: 'condiciones-de-alquiler-{v}-es.html', original: 'condiciones-de-alquiler-{v}-original-griego.html' },
};

// Οι όροι ενοικίασης ως συνημμένο (σταθερό μέσο - ν. 2251/1994 άρθ. 3δ). Σε άλλη γλώσσα
// επισυνάπτεται η μετάφραση ΚΑΙ το ελληνικό κείμενο, που υπερισχύει.
async function termsAttachments(locale = i18n.DEFAULT_LOCALE) {
  const files = [];
  const greek = await render('terms-document', {}, i18n.DEFAULT_LOCALE);
  const foreign = i18n.isLocale(locale) && locale !== i18n.DEFAULT_LOCALE;
  const names = foreign ? TERMS_FILES[locale] || { ...TERMS_FILES.en, translation: `rental-terms-{v}-${locale}.html` } : null;
  const name = (pattern) => pattern.replace('{v}', config.termsVersion);
  files.push({ filename: names ? name(names.original) : `oroi-enoikiasis-${config.termsVersion}.html`, content: greek, contentType: 'text/html; charset=utf-8' });
  if (names) {
    const translated = await render('terms-document', {}, locale);
    files.unshift({ filename: name(names.translation), content: translated, contentType: 'text/html; charset=utf-8' });
  }
  return files;
}

async function termsAttachment() {
  return (await termsAttachments())[0];
}

// Έλεγχος σύνδεσης με τον SMTP server (στοιχεία, θύρα, κρυπτογράφηση).
async function verifySmtp() {
  if (!smtpConfigured) return { ok: false, message: 'Δεν έχει ρυθμιστεί SMTP (SMTP_HOST κενό): τα emails δεν στέλνονται.' };
  try {
    await transport.verify();
    return { ok: true, message: `Σύνδεση με ${config.mail.host}:${config.mail.port} επιτυχής.` };
  } catch (err) {
    return { ok: false, message: `Αποτυχία σύνδεσης με ${config.mail.host}:${config.mail.port}: ${err.message}` };
  }
}

module.exports = { send, sendInBackground, flush, outbox, recent, smtpConfigured, render, termsAttachment, termsAttachments, verifySmtp, localeFor };
