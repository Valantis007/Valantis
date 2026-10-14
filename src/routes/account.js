'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { requireLogin } = require('../middleware/auth');
const { str, isPhone, passwordProblems } = require('../lib/validation');
const { BCRYPT_ROUNDS } = require('./auth');

module.exports = function accountRoutes(db) {
  const router = express.Router();
  router.use(requireLogin);

  function render(req, res, extra = {}) {
    const list = db
      .prepare(
        `SELECT b.*, c.make, c.model, c.image, c.category, pl.name AS pickup_location_name
         FROM bookings b JOIN cars c ON c.id = b.car_id JOIN locations pl ON pl.id = b.pickup_location_id
         WHERE b.user_id = ? ORDER BY b.pickup_at DESC`,
      )
      .all(req.user.id);
    res.render('account/index', {
      title: 'Ο λογαριασμός μου',
      bookings: list,
      profile: { first_name: req.user.first_name, last_name: req.user.last_name, phone: req.user.phone || '' },
      profileErrors: {},
      passwordErrors: {},
      ...extra,
    });
  }

  router.get('/', (req, res) => render(req, res));

  router.post('/profile', (req, res) => {
    const profile = {
      first_name: str(req.body.first_name, 80),
      last_name: str(req.body.last_name, 80),
      phone: str(req.body.phone, 30),
    };
    const errors = {};
    if (!profile.first_name) errors.first_name = 'Συμπληρώστε το όνομα.';
    if (!profile.last_name) errors.last_name = 'Συμπληρώστε το επώνυμο.';
    if (profile.phone && !isPhone(profile.phone)) errors.phone = 'Μη έγκυρο τηλέφωνο.';
    if (Object.keys(errors).length) {
      res.status(422);
      return render(req, res, { profile, profileErrors: errors });
    }
    db.prepare('UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?').run(
      profile.first_name,
      profile.last_name,
      profile.phone || null,
      req.user.id,
    );
    req.flash('success', 'Τα στοιχεία σας ενημερώθηκαν.');
    res.redirect(303, '/account');
  });

  router.post('/password', async (req, res) => {
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    const errors = {};
    if (!(await bcrypt.compare(String(req.body.current_password || ''), user.password_hash))) {
      errors.current_password = 'Ο τρέχων κωδικός είναι λάθος.';
    }
    const password = String(req.body.password || '');
    const problem = passwordProblems(password);
    if (problem) errors.password = problem;
    else if (password !== req.body.password_confirm) errors.password_confirm = 'Οι κωδικοί δεν ταιριάζουν.';
    if (Object.keys(errors).length) {
      res.status(422);
      return render(req, res, { passwordErrors: errors });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(password, BCRYPT_ROUNDS), req.user.id);
    // Αποσύνδεση από τις υπόλοιπες συσκευές.
    db.prepare(`DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ? AND sid != ?`).run(req.user.id, req.sessionID);
    req.flash('success', 'Ο κωδικός σας άλλαξε.');
    res.redirect(303, '/account');
  });

  // Διαγραφή λογαριασμού (δικαίωμα διαγραφής - GDPR). Οι κρατήσεις διατηρούνται
  // χωρίς σύνδεση με τον λογαριασμό, επειδή απαιτούνται για φορολογικούς λόγους.
  router.post('/delete', async (req, res, next) => {
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (req.user.role === 'admin') {
      req.flash('error', 'Ο λογαριασμός διαχειριστή δεν μπορεί να διαγραφεί από εδώ.');
      return res.redirect(303, '/account');
    }
    if (!(await bcrypt.compare(String(req.body.current_password || ''), user.password_hash))) {
      req.flash('error', 'Ο κωδικός είναι λάθος. Ο λογαριασμός δεν διαγράφηκε.');
      return res.redirect(303, '/account');
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    db.prepare(`DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?`).run(req.user.id);
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('sid');
      res.redirect(303, '/');
    });
  });

  return router;
};
