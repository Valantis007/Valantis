'use strict';

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const config = require('./config');
const format = require('./lib/format');
const time = require('./lib/time');
const payments = require('./lib/payments');
const SqliteStore = require('./lib/sessionStore');
const { csrfProtection } = require('./middleware/security');
const { loadUser } = require('./middleware/auth');

function createApp({ db, uploadDir = config.uploadDir }) {
  const app = express();
  const store = new SqliteStore(db);
  fs.mkdirSync(uploadDir, { recursive: true });

  app.locals.db = db;
  app.locals.uploadDir = uploadDir;
  app.locals.sessionStore = store;

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:'],
          // Μετά την υποβολή της κράτησης γίνεται ανακατεύθυνση στη σελίδα πληρωμής του Stripe.
          'form-action': ["'self'", 'https://checkout.stripe.com'],
          'upgrade-insecure-requests': config.isProduction ? [] : null,
        },
      },
    }),
  );

  // Το webhook του Stripe χρειάζεται το «ωμό» σώμα του αιτήματος για τον έλεγχο υπογραφής.
  app.use('/webhooks', require('./routes/webhooks')(db));

  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: config.isProduction ? '7d' : 0 }));
  app.use('/uploads', express.static(uploadDir, { maxAge: config.isProduction ? '30d' : 0 }));

  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use(
    session({
      name: 'sid',
      secret: config.sessionSecret,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProduction && Boolean(config.trustProxy || config.baseUrl.startsWith('https')),
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  // Μηνύματα που εμφανίζονται μία φορά (π.χ. «Η κράτηση ακυρώθηκε»).
  app.use((req, res, next) => {
    req.flash = (type, message) => {
      req.session.flash = req.session.flash || [];
      req.session.flash.push({ type, message });
    };
    res.locals.takeFlash = () => {
      const messages = req.session.flash || [];
      delete req.session.flash;
      return messages;
    };
    next();
  });

  app.use((req, res, next) => {
    res.locals.config = config;
    res.locals.company = config.company;
    res.locals.format = format;
    res.locals.time = time;
    res.locals.currentPath = req.path;
    res.locals.paymentsEnabled = payments.enabled();
    res.locals.errors = {};
    next();
  });

  app.use(csrfProtection);
  app.use(loadUser(db));

  app.use(require('./routes/public')(db));
  app.use(require('./routes/auth')(db));
  app.use('/account', require('./routes/account')(db));
  app.use('/booking', require('./routes/booking')(db));
  app.use('/admin', require('./routes/admin')(db, { uploadDir }));

  app.use((req, res) => {
    res.status(404).render('pages/error', {
      title: 'Η σελίδα δεν βρέθηκε',
      status: 404,
      message: 'Η σελίδα που ζητήσατε δεν υπάρχει.',
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    const message =
      status >= 500 ? 'Παρουσιάστηκε απρόσμενο σφάλμα. Δοκιμάστε ξανά ή επικοινωνήστε μαζί μας.' : err.expose === false ? 'Μη έγκυρο αίτημα.' : err.message;
    if (res.headersSent) return;
    // Το σφάλμα μπορεί να συνέβη πριν φορτωθούν όλα τα δεδομένα της σελίδας.
    Object.assign(res.locals, {
      config,
      company: config.company,
      format,
      time,
      currentPath: req.path,
      user: res.locals.user ?? null,
      csrfToken: res.locals.csrfToken ?? '',
      takeFlash: res.locals.takeFlash ?? (() => []),
    });
    res.status(status);
    if (req.path.startsWith('/api/')) return res.json({ error: message });
    res.render('pages/error', { title: 'Σφάλμα', status, message });
  });

  return app;
}

module.exports = { createApp };
