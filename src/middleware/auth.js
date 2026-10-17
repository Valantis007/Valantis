'use strict';

// Φορτώνει τον συνδεδεμένο χρήστη (αν υπάρχει) σε req.user / res.locals.user.
function loadUser(db) {
  const stmt = db.prepare('SELECT id, email, first_name, last_name, phone, role FROM users WHERE id = ?');
  return (req, res, next) => {
    req.user = null;
    if (req.session.userId) {
      req.user = stmt.get(req.session.userId) || null;
      if (!req.user) delete req.session.userId;
    }
    res.locals.user = req.user;
    next();
  };
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  req.session.returnTo = req.originalUrl;
  req.flash('info', 'Συνδεθείτε για να συνεχίσετε.');
  return res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  if (req.user.role !== 'admin') {
    const err = new Error('Δεν έχετε πρόσβαση σε αυτή τη σελίδα.');
    err.status = 403;
    return next(err);
  }
  return next();
}

// Επιτρέπει επιστροφή μόνο σε εσωτερικές διευθύνσεις (όχι σε ξένα sites).
function safeReturnTo(value, fallback = '/') {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) {
    return value;
  }
  return fallback;
}

module.exports = { loadUser, requireLogin, requireAdmin, safeReturnTo };
