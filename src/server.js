'use strict';

const config = require('./config');
const { openDb } = require('./db');
const { createApp } = require('./app');
const { expireStaleHolds } = require('./lib/bookings');
const mailer = require('./lib/mailer');
const payments = require('./lib/payments');

const db = openDb(config.dbPath);
const app = createApp({ db });

// Περιοδικές εργασίες: λήξη απλήρωτων κρατήσεων και καθαρισμός παλιών sessions.
const maintenance = setInterval(() => {
  try {
    expireStaleHolds(db);
    app.locals.sessionStore.prune();
  } catch (err) {
    console.error('[maintenance]', err);
  }
}, 60 * 1000);
maintenance.unref();

const server = app.listen(config.port, () => {
  console.log(`${config.company.name} - διαθέσιμο στο ${config.baseUrl} (port ${config.port}, ${config.env})`);
  if (!payments.enabled()) console.log('• Το Stripe δεν έχει ρυθμιστεί: διαθέσιμη μόνο η πληρωμή κατά την παραλαβή.');
  if (!mailer.smtpConfigured) console.log('• Το SMTP δεν έχει ρυθμιστεί: τα emails καταγράφονται αντί να αποστέλλονται.');
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
