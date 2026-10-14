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

async function render(template, data) {
  const locals = { ...data, config, format, company: config.company, baseUrl: config.baseUrl };
  return ejs.renderFile(path.join(templatesDir, `${template}.ejs`), locals);
}

/**
 * Στέλνει email από πρότυπο του φακέλου views/emails.
 * Δεν «πετάει» σφάλμα: μια αποτυχία αποστολής δεν πρέπει να χαλάσει μια κράτηση.
 */
async function send({ to, subject, template, data = {}, replyTo }) {
  if (!to) return false;
  try {
    const html = await render(template, { ...data, subject });
    const message = { from: config.mail.from, to, subject, html, replyTo };
    if (config.isTest) {
      outbox.push(message);
      return true;
    }
    await transport.sendMail(message);
    if (!smtpConfigured) console.log(`[email δεν στάλθηκε - δεν έχει ρυθμιστεί SMTP] Προς: ${to} | Θέμα: ${subject}`);
    return true;
  } catch (err) {
    console.error(`[email] Αποτυχία αποστολής προς ${to}:`, err.message);
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

module.exports = { send, sendInBackground, flush, outbox, smtpConfigured };
