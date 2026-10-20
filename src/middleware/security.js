'use strict';

const crypto = require('node:crypto');
const rateLimit = require('express-rate-limit');
const config = require('../config');

// ---------- CSRF ----------
// Κάθε φόρμα περιέχει ένα κρυφό token που ταιριάζει με αυτό του session.
// Έτσι μια κακόβουλη ιστοσελίδα δεν μπορεί να υποβάλει φόρμες εκ μέρους του χρήστη.

function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

const TOKEN_RE = /^[a-f0-9]{64}$/;

function tokenMatches(req) {
  const expected = req.session && req.session.csrfToken;
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token');
  if (!expected || typeof sent !== 'string' || !TOKEN_RE.test(sent)) return false;
  return crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}

// Μόνο αυτές οι διαδρομές δέχονται multipart (ανέβασμα φωτογραφίας) και ελέγχουν το token μετά το multer.
const MULTIPART_ROUTES = /^\/admin\/cars(\/\d+)?$/;

function csrfError() {
  const err = new Error('Η φόρμα έληξε. Ανανεώστε τη σελίδα και δοκιμάστε ξανά.');
  err.status = 403;
  return err;
}

// Το token δημιουργείται μόνο όταν μια σελίδα έχει φόρμα (csrfToken() στο template),
// ώστε οι απλές επισκέψεις να μη δημιουργούν session.
function csrfProtection(req, res, next) {
  res.locals.csrfToken = () => csrfToken(req);
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.method === 'POST' && req.is('multipart/form-data') && MULTIPART_ROUTES.test(req.path)) return next();
  if (!tokenMatches(req)) return next(csrfError());
  return next();
}

function verifyCsrf(req, res, next) {
  if (!tokenMatches(req)) return next(csrfError());
  return next();
}

// ---------- Όρια αιτημάτων ----------
function limiter(windowMinutes, limit) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: config.isTest ? 10000 : limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).render('pages/error', {
        title: 'Πολλές προσπάθειες',
        status: 429,
        message: 'Κάνατε πολλές προσπάθειες σε λίγο χρόνο. Περιμένετε λίγα λεπτά και δοκιμάστε ξανά.',
      });
    },
  });
}

const limits = {
  login: limiter(15, 10),
  register: limiter(60, 10),
  passwordResetRequest: limiter(60, 5),
  passwordResetSubmit: limiter(15, 20),
  lookup: limiter(15, 20),
  // Σύνδεσμος «Η κράτησή μου» από το email (/b/<token>): ίδιο όριο με την αναζήτηση κράτησης (/manage).
  bookingLink: limiter(15, 20),
  contact: limiter(60, 5),
  booking: limiter(15, 20),
};

module.exports = { csrfProtection, verifyCsrf, limits };
