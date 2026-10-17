'use strict';

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const config = require('./config');
const format = require('./lib/format');
const i18n = require('./lib/i18n');
const time = require('./lib/time');
const providers = require('./lib/providers');
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
          // Μετά την υποβολή της φόρμας γίνεται ανακατεύθυνση στη σελίδα πληρωμής του παρόχου
          // (οι browsers εφαρμόζουν το form-action και στις ανακατευθύνσεις).
          'form-action': ["'self'", 'https://checkout.stripe.com', 'https://checkout.revolut.com', 'https://sandbox-checkout.revolut.com'],
          'upgrade-insecure-requests': config.isProduction ? [] : null,
        },
      },
    }),
  );

  // Γλώσσα από το πρόθεμα της διαδρομής (/en, /es)· πριν από όλα τα υπόλοιπα.
  app.use(i18n.middleware);

  // Τα webhooks των παρόχων πληρωμών χρειάζονται το «ωμό» σώμα του αιτήματος για τον έλεγχο υπογραφής.
  app.use('/webhooks', require('./routes/webhooks')(db));

  // redirect: false — αλλιώς το /en (αρχική στα αγγλικά) ανακατευθύνεται σε /en/ ως «φάκελος».
  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: config.isProduction ? '7d' : 0, redirect: false }));
  app.use('/uploads', express.static(uploadDir, { maxAge: config.isProduction ? '30d' : 0 }));

  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  // Χωρίς σώμα (π.χ. multipart σε διαδρομή που δεν το δέχεται) το req.body είναι κενό αντικείμενο.
  app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
  });

  // Έλεγχος λειτουργίας για monitoring / Docker, χωρίς session.
  app.get('/healthz', (req, res) => {
    db.prepare('SELECT 1').get();
    res.type('text').send('ok');
  });

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
        // Χωρίς maxAge: το cookie διαγράφεται όταν κλείσει ο browser («Να με θυμάσαι» => 30 ημέρες).
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
    res.locals.format = format.forLocale(req.locale);
    res.locals.time = time;
    res.locals.currentPath = req.path;
    const activeProvider = providers.active();
    res.locals.paymentsEnabled = Boolean(activeProvider);
    res.locals.paymentProviderLabel = activeProvider ? activeProvider.label : '';
    // Δοκιμαστικά κλειδιά (Stripe test / Revolut Sandbox): εμφανίζεται ένδειξη σε κάθε σελίδα.
    res.locals.paymentsTestMode = Boolean(activeProvider && activeProvider.mode && activeProvider.mode() === 'test');
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
      title: req.t('Η σελίδα δεν βρέθηκε'),
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
    const locale = req.locale || 'el';
    Object.assign(res.locals, {
      config,
      company: config.company,
      format: format.forLocale(locale),
      time,
      locale,
      t: res.locals.t ?? ((v, p) => i18n.t(locale, v, p)),
      th: res.locals.th ?? ((v, p) => i18n.th(locale, v, p)),
      u: res.locals.u ?? ((p) => i18n.localizePath(locale, p)),
      lt: res.locals.lt ?? ((name) => i18n.fileFor(name, locale)),
      tf: res.locals.tf ?? ((row, name) => i18n.field(row, name, locale)),
      languages: res.locals.languages ?? [],
      langPrefix: res.locals.langPrefix ?? '',
      currentPath: req.path,
      user: res.locals.user ?? null,
      csrfToken: res.locals.csrfToken ?? (() => ''),
      takeFlash: res.locals.takeFlash ?? (() => []),
    });
    res.status(status);
    if (req.path.startsWith('/api/')) return res.json({ error: i18n.t(locale, message) });
    res.render('pages/error', { title: i18n.t(locale, 'Σφάλμα'), status, message });
  });

  return app;
}

module.exports = { createApp };
