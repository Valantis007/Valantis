'use strict';

const config = require('./config');
const { openDb } = require('./db');
const { createApp } = require('./app');
const mailer = require('./lib/mailer');
const providers = require('./lib/providers');
const { runMaintenance } = require('./lib/maintenance');

const db = openDb(config.dbPath);
// «Επανεκκίνηση» από τις Ρυθμίσεις δοκιμών: ομαλός τερματισμός με κωδικό 75, και τα
// start-windows.bat / start-mac.command ξεκινούν ξανά την ιστοσελίδα με το νέο .env.
const app = createApp({ db, onRestart: (code) => shutdown(code) });

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
    // Στον υπολογιστή (localhost) το Stripe δεν μπορεί να στείλει ειδοποιήσεις ούτως ή άλλως.
    if (providers.PROVIDERS.stripe.isLocalUrl(config.baseUrl)) console.log('• Χωρίς STRIPE_WEBHOOK_SECRET: στον υπολογιστή δεν πειράζει — οι πληρωμές συγχρονίζονται αυτόματα κάθε 5 λεπτά.');
    else console.warn('• ΠΡΟΣΟΧΗ: λείπει το STRIPE_WEBHOOK_SECRET — οι ειδοποιήσεις του Stripe θα απορρίπτονται (οι πληρωμές συγχρονίζονται μόνο περιοδικά).');
  }
  if (providers.get('revolut') && !config.revolut.webhookSecret) {
    console.warn('• ΠΡΟΣΟΧΗ: λείπει το REVOLUT_WEBHOOK_SECRET — τρέξτε: npm run revolut:webhook');
  }
  if (!mailer.smtpConfigured) {
    console.log(`• Το SMTP δεν έχει ρυθμιστεί: τα emails καταγράφονται αντί να αποστέλλονται.${config.isProduction ? '' : ` Ρύθμιση: ${config.baseUrl}/admin/settings`}`);
  }
  if (!config.mail.adminNotify) console.warn('• ΠΡΟΣΟΧΗ: δεν έχει οριστεί ADMIN_NOTIFY_EMAIL — το γραφείο δεν θα λαμβάνει ειδοποιήσεις (νέες κρατήσεις, επιστροφές, εγγυήσεις).');
  runMaintenance(db, { store: app.locals.sessionStore, force: true });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nΗ θύρα ${config.port} χρησιμοποιείται ήδη: πιθανότατα η ιστοσελίδα τρέχει ήδη σε άλλο παράθυρο.`);
    console.error('Κλείστε εκείνο το παράθυρο (ή επανεκκινήστε τον υπολογιστή) και ξεκινήστε ξανά.\n');
    process.exit(1);
  }
  throw err;
});

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    await mailer.flush();
    db.close();
    process.exit(code);
  });
  // Αν κάτι καθυστερεί το κλείσιμο: τερματισμός μετά από 10 δευτερόλεπτα (με τον ίδιο κωδικό σε επανεκκίνηση).
  setTimeout(() => process.exit(code || 1), 10000).unref();
}
process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());
