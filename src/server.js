'use strict';

const config = require('./config');
const { openDb } = require('./db');
const { createApp } = require('./app');
const mailer = require('./lib/mailer');
const providers = require('./lib/providers');
const { runMaintenance } = require('./lib/maintenance');

const db = openDb(config.dbPath);
const app = createApp({ db });

// Περιοδικές εργασίες (βλ. src/lib/maintenance.js).
const maintenance = setInterval(() => runMaintenance(db, { store: app.locals.sessionStore }), 60 * 1000);
maintenance.unref();

const server = app.listen(config.port, () => {
  console.log(`${config.company.name} - διαθέσιμο στο ${config.baseUrl} (port ${config.port}, ${config.env})`);
  const active = providers.active();
  if (!active) {
    console.log('• Δεν έχει ρυθμιστεί πάροχος online πληρωμών: διαθέσιμη μόνο η πληρωμή κατά την παραλαβή και η εγγύηση μέσω POS.');
  } else {
    console.log(`• Online πληρωμές μέσω ${active.label}.`);
  }
  if (providers.get('stripe') && !config.stripe.webhookSecret) {
    console.warn('• ΠΡΟΣΟΧΗ: λείπει το STRIPE_WEBHOOK_SECRET — οι ειδοποιήσεις του Stripe θα απορρίπτονται (οι πληρωμές συγχρονίζονται μόνο περιοδικά).');
  }
  if (providers.get('revolut') && !config.revolut.webhookSecret) {
    console.warn('• ΠΡΟΣΟΧΗ: λείπει το REVOLUT_WEBHOOK_SECRET — τρέξτε: npm run revolut:webhook');
  }
  if (!mailer.smtpConfigured) console.log('• Το SMTP δεν έχει ρυθμιστεί: τα emails καταγράφονται αντί να αποστέλλονται.');
  if (!config.mail.adminNotify) console.warn('• ΠΡΟΣΟΧΗ: δεν έχει οριστεί ADMIN_NOTIFY_EMAIL — το γραφείο δεν θα λαμβάνει ειδοποιήσεις (νέες κρατήσεις, επιστροφές, εγγυήσεις).');
  runMaintenance(db, { store: app.locals.sessionStore, force: true });
});

function shutdown() {
  server.close(async () => {
    await mailer.flush();
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
