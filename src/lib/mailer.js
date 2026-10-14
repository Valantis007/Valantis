'use strict';

const path = require('node:path');
const ejs = require('ejs');
const nodemailer = require('nodemailer');
const config = require('../config');
const format = require('./format');

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

// Τα τελευταία emails (μόνο παραλήπτης, θέμα, αποτέλεσμα) για τη σελίδα «Έλεγχος συστήματος».
const recent = [];
function remember(entry) {
  recent.unshift({ at: new Date().toISOString(), ...entry });
  recent.length = Math.min(recent.length, 30);
}

async function render(template, data) {
  // Το providers φορτώνεται εδώ για να μην υπάρχει κυκλική εξάρτηση κατά την εκκίνηση.
  const providers = require('./providers');
  const active = providers.active();
  const locals = {
    ...data,
    config,
    format,
    company: config.company,
    baseUrl: config.baseUrl,
    paymentsEnabled: Boolean(active),
    paymentProviderLabel: active ? active.label : '',
  };
  return ejs.renderFile(path.join(templatesDir, `${template}.ejs`), locals);
}

/**
 * Στέλνει email από πρότυπο του φακέλου views/emails.
 * Δεν «πετάει» σφάλμα: μια αποτυχία αποστολής δεν πρέπει να χαλάσει μια κράτηση.
 */
async function send({ to, subject, template, data = {}, replyTo, attachments }) {
  if (!to) return false;
  try {
    const html = await render(template, { ...data, subject });
    const message = { from: config.mail.from, to, subject, html, replyTo, attachments };
    if (config.isTest) {
      outbox.push(message);
      remember({ to, subject, status: 'sent' });
      return true;
    }
    await transport.sendMail(message);
    if (!smtpConfigured) console.log(`[email δεν στάλθηκε - δεν έχει ρυθμιστεί SMTP] Προς: ${to} | Θέμα: ${subject}`);
    remember({ to, subject, status: smtpConfigured ? 'sent' : 'not_configured' });
    return true;
  } catch (err) {
    console.error(`[email] Αποτυχία αποστολής προς ${to}:`, err.message);
    remember({ to, subject, status: 'failed', error: String(err.message).slice(0, 200) });
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

// Οι όροι ενοικίασης ως συνημμένο (σταθερό μέσο - ν. 2251/1994 άρθ. 3δ).
async function termsAttachment() {
  const html = await render('terms-document', {});
  return { filename: `oroi-enoikiasis-${config.termsVersion}.html`, content: html, contentType: 'text/html; charset=utf-8' };
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

module.exports = { send, sendInBackground, flush, outbox, recent, smtpConfigured, render, termsAttachment, verifySmtp };
