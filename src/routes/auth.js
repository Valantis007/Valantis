'use strict';

const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const mailer = require('../lib/mailer');
const { str, isEmail, isPhone, passwordProblems } = require('../lib/validation');
const { limits } = require('../middleware/security');
const { safeReturnTo } = require('../middleware/auth');

const BCRYPT_ROUNDS = config.isTest ? 4 : 12;
// Χρησιμοποιείται όταν δεν υπάρχει ο χρήστης, ώστε ο χρόνος απάντησης να είναι ίδιος.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Νέο session ID μετά τη σύνδεση (προστασία από session fixation),
// κρατώντας την πρόσβαση σε κρατήσεις που είχε ήδη ο επισκέπτης.
function logIn(req, userId) {
  return new Promise((resolve, reject) => {
    const keep = { bookingAccess: req.session.bookingAccess, returnTo: req.session.returnTo };
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      if (keep.bookingAccess) req.session.bookingAccess = keep.bookingAccess;
      resolve(safeReturnTo(keep.returnTo, '/account'));
    });
  });
}

module.exports = function authRoutes(db) {
  const router = express.Router();

  router.get('/login', (req, res) => {
    if (req.user) return res.redirect('/account');
    res.render('auth/login', { title: 'Σύνδεση', values: {}, error: null });
  });

  router.post('/login', limits.login, async (req, res) => {
    const email = str(req.body.email, 254).toLowerCase();
    const password = String(req.body.password || '').slice(0, 200);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) {
      return res.status(401).render('auth/login', {
        title: 'Σύνδεση',
        values: { email },
        error: 'Λάθος email ή κωδικός.',
      });
    }
    const target = await logIn(req, user.id);
    res.redirect(303, user.role === 'admin' && target === '/account' ? '/admin' : target);
  });

  router.get('/register', (req, res) => {
    if (req.user) return res.redirect('/account');
    res.render('auth/register', { title: 'Δημιουργία λογαριασμού', values: {}, errors: {} });
  });

  router.post('/register', limits.register, async (req, res) => {
    const values = {
      first_name: str(req.body.first_name, 80),
      last_name: str(req.body.last_name, 80),
      email: str(req.body.email, 254).toLowerCase(),
      phone: str(req.body.phone, 30),
    };
    const password = String(req.body.password || '');
    const errors = {};
    if (!values.first_name) errors.first_name = 'Συμπληρώστε το όνομα.';
    if (!values.last_name) errors.last_name = 'Συμπληρώστε το επώνυμο.';
    if (!isEmail(values.email)) errors.email = 'Συμπληρώστε έγκυρο email.';
    if (values.phone && !isPhone(values.phone)) errors.phone = 'Μη έγκυρο τηλέφωνο.';
    const pwProblem = passwordProblems(password);
    if (pwProblem) errors.password = pwProblem;
    else if (password !== req.body.password_confirm) errors.password_confirm = 'Οι κωδικοί δεν ταιριάζουν.';
    if (!req.body.terms) errors.terms = 'Πρέπει να αποδεχθείτε την πολιτική απορρήτου.';
    if (!errors.email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(values.email)) {
      errors.email = 'Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδεθείτε ή επαναφέρετε τον κωδικό σας.';
    }
    if (Object.keys(errors).length) {
      return res.status(422).render('auth/register', { title: 'Δημιουργία λογαριασμού', values, errors });
    }
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = db
      .prepare('INSERT INTO users (email, password_hash, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?)')
      .run(values.email, hash, values.first_name, values.last_name, values.phone || null);
    await mailer.send({
      to: values.email,
      subject: `Καλώς ήρθατε στην ${config.company.name}`,
      template: 'welcome',
      data: { user: values },
    });
    const target = await logIn(req, Number(result.lastInsertRowid));
    req.flash('success', 'Ο λογαριασμός σας δημιουργήθηκε.');
    res.redirect(303, target);
  });

  router.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('sid');
      res.redirect(303, '/');
    });
  });

  router.get('/forgot-password', (req, res) => {
    res.render('auth/forgot', { title: 'Ξέχασα τον κωδικό', sent: false, email: '' });
  });

  router.post('/forgot-password', limits.passwordReset, async (req, res) => {
    const email = str(req.body.email, 254).toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      db.prepare('UPDATE users SET reset_token_hash = ?, reset_expires_at = ? WHERE id = ?').run(
        sha256(token),
        Date.now() + 60 * 60 * 1000,
        user.id,
      );
      await mailer.send({
        to: user.email,
        subject: 'Επαναφορά κωδικού πρόσβασης',
        template: 'password-reset',
        data: { user, link: `${config.baseUrl}/reset-password/${token}` },
      });
    }
    // Ίδιο μήνυμα είτε υπάρχει ο λογαριασμός είτε όχι (δεν αποκαλύπτουμε ποια emails είναι εγγεγραμμένα).
    res.render('auth/forgot', { title: 'Ξέχασα τον κωδικό', sent: true, email });
  });

  function userForToken(token) {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    return db.prepare('SELECT * FROM users WHERE reset_token_hash = ? AND reset_expires_at > ?').get(sha256(token), Date.now()) || null;
  }

  router.get('/reset-password/:token', (req, res) => {
    const user = userForToken(req.params.token);
    res.render('auth/reset', { title: 'Νέος κωδικός', valid: Boolean(user), token: req.params.token, errors: {} });
  });

  router.post('/reset-password/:token', limits.passwordReset, async (req, res) => {
    const user = userForToken(req.params.token);
    if (!user) return res.render('auth/reset', { title: 'Νέος κωδικός', valid: false, token: '', errors: {} });
    const password = String(req.body.password || '');
    const errors = {};
    const problem = passwordProblems(password);
    if (problem) errors.password = problem;
    else if (password !== req.body.password_confirm) errors.password_confirm = 'Οι κωδικοί δεν ταιριάζουν.';
    if (Object.keys(errors).length) {
      return res.status(422).render('auth/reset', { title: 'Νέος κωδικός', valid: true, token: req.params.token, errors });
    }
    db.prepare('UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_expires_at = NULL WHERE id = ?').run(
      await bcrypt.hash(password, BCRYPT_ROUNDS),
      user.id,
    );
    // Αποσύνδεση από όλες τις άλλες συσκευές.
    db.prepare(`DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?`).run(user.id);
    await logIn(req, user.id);
    req.flash('success', 'Ο κωδικός σας άλλαξε.');
    res.redirect(303, '/account');
  });

  return router;
};

module.exports.BCRYPT_ROUNDS = BCRYPT_ROUNDS;
