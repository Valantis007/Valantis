'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { requireLogin } = require('../middleware/auth');
const { str, isPhone, passwordProblems } = require('../lib/validation');
const { BCRYPT_ROUNDS } = require('./auth');
const { transaction } = require('../db');
const time = require('../lib/time');
const { languageLinks } = require('../lib/i18n');

module.exports = function accountRoutes(db) {
  const router = express.Router();
  router.use(requireLogin);

  function render(req, res, extra = {}) {
    const list = db
      .prepare(
        `SELECT b.*, c.make, c.model, c.image, c.category, pl.name AS pickup_location_name,
           pl.name_en AS pickup_location_name_en, pl.name_es AS pickup_location_name_es
         FROM bookings b JOIN cars c ON c.id = b.car_id JOIN locations pl ON pl.id = b.pickup_location_id
         WHERE b.user_id = ? ORDER BY b.pickup_at DESC`,
      )
      .all(req.user.id);
    // Μετά από POST (/account/profile, /account/password) η επιλογή γλώσσας οδηγεί στον λογαριασμό.
    if (req.method !== 'GET') res.locals.languages = languageLinks(req.locale, '/account');
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

  // Φορητότητα / πρόσβαση (άρθρα 15 και 20 ΓΚΠΔ): όλα τα δεδομένα του λογαριασμού σε JSON.
  router.get('/export', (req, res) => {
    const user = db.prepare('SELECT id, email, first_name, last_name, phone, created_at FROM users WHERE id = ?').get(req.user.id);
    const list = db
      .prepare(
        `SELECT b.reference, b.status, b.created_at, b.pickup_at, b.return_at, c.make, c.model,
           pl.name AS pickup_location, rl.name AS return_location,
           b.first_name, b.last_name, b.email, b.phone, b.birth_date, b.license_number, b.license_country, b.license_issued,
           b.flight_number, b.notes, b.child_info, b.invoice_requested, b.invoice_vat, b.invoice_name, b.invoice_address,
           b.invoice_tax_office, b.invoice_activity, b.total_cents, b.paid_cents, b.refunded_cents, b.payment_status,
           b.payment_method, b.terms_version, b.terms_accepted_at, b.id
         FROM bookings b JOIN cars c ON c.id = b.car_id
           JOIN locations pl ON pl.id = b.pickup_location_id JOIN locations rl ON rl.id = b.return_location_id
         WHERE b.user_id = ? ORDER BY b.id`,
      )
      .all(req.user.id);
    const bookingsOut = list.map(({ id, ...b }) => ({
      ...b,
      extras: db.prepare('SELECT name, qty, total_cents FROM booking_extras WHERE booking_id = ?').all(id),
      charges: db.prepare('SELECT category, description, amount_cents, status, paid_cents, created_at FROM booking_charges WHERE booking_id = ?').all(id),
      deposits: db
        .prepare('SELECT method, status, amount_cents, captured_cents, card_brand, card_last4, held_at, settled_at FROM deposits WHERE booking_id = ?')
        .all(id),
    }));
    // Μόνο μηνύματα που στάλθηκαν από τον λογαριασμό (το email δεν επιβεβαιώνεται στην εγγραφή).
    const messages = db
      .prepare('SELECT name, email, phone, subject, body, kind, booking_reference, created_at FROM messages WHERE user_id = ?')
      .all(user.id);
    res.set('Content-Disposition', `attachment; filename="ta-dedomena-mou-${new Date().toISOString().slice(0, 10)}.json"`);
    res.type('application/json').send(JSON.stringify({ exportedAt: new Date().toISOString(), account: user, bookings: bookingsOut, messages }, null, 2));
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
    // Όσο εκκρεμεί κράτηση, εγγύηση ή χρέωση, ο λογαριασμός χρειάζεται για την εκτέλεσή της.
    const open = db
      .prepare(
        `SELECT 1 FROM bookings b WHERE b.user_id = ? AND (
           b.status IN ('pending_payment', 'active')
           OR (b.status = 'confirmed' AND b.return_at > ?)
           OR EXISTS (SELECT 1 FROM deposits d WHERE d.booking_id = b.id AND d.status IN ('awaiting', 'held'))
           OR EXISTS (SELECT 1 FROM booking_charges c WHERE c.booking_id = b.id
                      AND (c.status IN ('proposed', 'disputed') OR (c.status = 'accepted' AND c.paid_cents < c.amount_cents))))
         LIMIT 1`,
      )
      .get(req.user.id, time.nowLocal());
    if (open) {
      req.flash('error', 'Έχετε ενεργή κράτηση, εγγύηση ή εκκρεμή χρέωση. Ο λογαριασμός μπορεί να διαγραφεί μόλις ολοκληρωθούν (ή ακυρώστε πρώτα την κράτηση).');
      return res.redirect(303, '/account');
    }
    transaction(db, () => {
      // Κρατήσεις χωρίς καμία πληρωμή (ακυρωμένες/ληγμένες) δεν χρειάζονται για φορολογικούς λόγους:
      // διαγράφουμε τα προσωπικά τους στοιχεία. Οι υπόλοιπες διατηρούνται όπως απαιτεί ο νόμος.
      db.prepare(
        `UPDATE bookings SET first_name = 'Διαγραμμένος', last_name = 'πελάτης', email = 'deleted@invalid',
           phone = '', birth_date = '', license_number = '', license_country = '', license_issued = '',
           flight_number = NULL, notes = NULL, child_info = NULL, invoice_vat = NULL, invoice_name = NULL,
           invoice_address = NULL, invoice_tax_office = NULL, invoice_activity = NULL, personal_data_purged_at = datetime('now')
         WHERE user_id = ? AND paid_cents = 0 AND status IN ('cancelled', 'expired')`,
      ).run(req.user.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
      db.prepare(`DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?`).run(req.user.id);
    });
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('sid');
      res.redirect(303, '/');
    });
  });

  return router;
};
