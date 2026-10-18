'use strict';

// Διαχείριση → «Ρυθμίσεις δοκιμών»: email και δοκιμαστικές πληρωμές με κάρτα χωρίς να ανοίξει
// κανείς το .env. Λειτουργεί μόνο εκτός παραγωγής· σε παραγωγή δείχνει μόνο οδηγίες.
// Οι κωδικοί και τα κλειδιά δεν επιστρέφονται ποτέ στη σελίδα και δεν γράφονται στο log.

const crypto = require('node:crypto');
const express = require('express');
const config = require('../config');
const settings = require('../lib/settings');
const envFile = require('../lib/env-file');

// Ταυτότητα αυτής της εκκίνησης: η σελίδα «Επανεκκίνηση» καταλαβαίνει έτσι πότε ξεκίνησε η νέα.
const BOOT_ID = crypto.randomBytes(8).toString('hex');

// Κωδικός εξόδου που ζητά από τα start-windows.bat / start-mac.command να ξεκινήσουν ξανά την ιστοσελίδα.
const RESTART_EXIT_CODE = 75;

module.exports = function settingsRoutes({ envPath = null, onRestart = null } = {}) {
  const router = express.Router();
  const file = () => settings.envPath(envPath);

  const wantsJson = (req) => /^application\/json/.test(req.get('accept') || '');

  function refuseInProduction(req, res, next) {
    if (!config.isProduction) return next();
    const err = new Error('Σε κανονική λειτουργία οι ρυθμίσεις δεν αλλάζουν από τη Διαχείριση: ορίζονται στον server (δείτε τη σελίδα «Ρυθμίσεις δοκιμών»).');
    err.status = 403;
    return next(err);
  }

  function render(req, res, extra = {}, status = 200) {
    if (config.isProduction) {
      return res.render('admin/settings-production', { title: 'Ρυθμίσεις δοκιμών', guide: settings.serverGuide() });
    }
    const st = settings.state(file());
    res.status(status).render('admin/settings', {
      title: 'Ρυθμίσεις δοκιμών',
      envPath: file(),
      st,
      mask: settings.mask,
      gmailHost: settings.GMAIL.host,
      mailForm: settings.mailForm(st.current),
      mailErrors: {},
      mailResult: null,
      stripeErrors: {},
      stripeResult: null,
      restarted: req.query.restarted === '1',
      retypeSecret: false,
      retypeKey: false,
      ...extra,
    });
  }

  // Αποτέλεσμα «Δοκιμής σύνδεσης»: JSON για τη σελίδα (χωρίς να χαθούν όσα γράφτηκαν), αλλιώς ολόκληρη σελίδα.
  function testResult(req, res, section, result, extra = {}) {
    if (wantsJson(req)) return res.json(result);
    return render(req, res, { ...extra, [section === 'mail' ? 'mailResult' : 'stripeResult']: result }, result.ok ? 200 : 400);
  }

  function save(req, res, section, updates) {
    try {
      envFile.update(file(), updates, { template: settings.TEMPLATE });
    } catch (err) {
      const result = {
        ok: false,
        title: 'Αποθήκευση',
        lines:
          err instanceof envFile.EnvValueError
            ? [err.message]
            : [`Δεν ήταν δυνατή η εγγραφή στο αρχείο ${file()} (${err.code || 'σφάλμα'}). Ελέγξτε ότι το αρχείο δεν είναι «μόνο για ανάγνωση».`],
      };
      return render(req, res, section === 'mail' ? { mailResult: result } : { stripeResult: result }, 500);
    }
    // Μόνο τα ονόματα των ρυθμίσεων, ποτέ οι τιμές.
    if (!config.isTest) console.log(`[ρυθμίσεις] Αποθηκεύτηκαν στο ${file()}: ${Object.keys(updates).join(', ')}`);
    req.flash('success', 'Αποθηκεύτηκε — πατήστε Επανεκκίνηση για να ισχύσει.');
    return res.redirect(303, `/admin/settings#${section}`);
  }

  router.get('/', (req, res) => render(req, res));

  // Για τη σελίδα επανεκκίνησης: ποια εκκίνηση απαντά.
  router.get('/ping', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ boot: BOOT_ID });
  });

  // ---------------- Email ----------------
  router.post('/mail/test', refuseInProduction, async (req, res) => {
    const cur = settings.state(file()).current;
    const parsed = settings.parseMail(req.body, cur);
    const errors = Object.values(parsed.errors);
    if (errors.length) {
      const result = { ok: false, title: 'Δοκιμή σύνδεσης email', lines: errors };
      if (wantsJson(req)) return res.json(result);
      return render(req, res, { mailForm: parsed.form, mailErrors: parsed.errors, mailResult: result, retypeSecret: parsed.typedPass && !parsed.errors.gmail_pass && !parsed.errors.smtp_pass }, 400);
    }
    const check = await settings.verifyMail(parsed.transport, { gmail: parsed.gmail });
    if (check.ok) check.lines.push('Πατήστε «Αποθήκευση» και μετά «Επανεκκίνηση». Ύστερα στείλτε ένα δοκιμαστικό email από τον «Έλεγχο συστήματος».');
    return testResult(req, res, 'mail', { title: 'Δοκιμή σύνδεσης email', ...check }, { mailForm: parsed.form, retypeSecret: parsed.typedPass });
  });

  router.post('/mail', refuseInProduction, (req, res) => {
    const cur = settings.state(file()).current;
    const parsed = settings.parseMail(req.body, cur);
    if (Object.keys(parsed.errors).length) {
      const result = { ok: false, title: 'Αποθήκευση', lines: ['Διορθώστε τα πεδία με κόκκινο.'] };
      return render(req, res, { mailForm: parsed.form, mailErrors: parsed.errors, mailResult: result, retypeSecret: parsed.typedPass && !parsed.errors.gmail_pass && !parsed.errors.smtp_pass }, 400);
    }
    return save(req, res, 'mail', parsed.updates);
  });

  // ---------------- Πληρωμές με κάρτα (Stripe, μόνο δοκιμαστικά κλειδιά) ----------------
  router.post('/stripe/test', refuseInProduction, async (req, res) => {
    const cur = settings.state(file()).current;
    const parsed = settings.parseStripe(req.body, cur);
    let lines = Object.values(parsed.errors);
    // Και ένα live κλειδί που μπήκε με το χέρι στο .env δεν δοκιμάζεται από εδώ.
    if (!lines.length && !parsed.key) lines = ['Επικολλήστε πρώτα το «Secret key» (sk_test_…).'];
    else if (!lines.length && settings.stripeKeyProblem(parsed.key)) lines = [settings.stripeKeyProblem(parsed.key)];
    if (lines.length) {
      const result = { ok: false, title: 'Δοκιμή σύνδεσης Stripe', lines };
      if (wantsJson(req)) return res.json(result);
      return render(req, res, { stripeErrors: parsed.errors, stripeResult: result, retypeKey: parsed.typedKey && !parsed.errors.stripe_key }, 400);
    }
    const check = await settings.verifyStripe({ key: parsed.key, webhookSecret: parsed.webhookSecret });
    if (check.ok && Object.keys(parsed.updates).length) check.lines.push('Πατήστε «Αποθήκευση» και μετά «Επανεκκίνηση».');
    return testResult(req, res, 'stripe', { title: 'Δοκιμή σύνδεσης Stripe', ...check }, { retypeKey: parsed.typedKey });
  });

  router.post('/stripe', refuseInProduction, (req, res) => {
    const cur = settings.state(file()).current;
    const parsed = settings.parseStripe(req.body, cur);
    const errors = { ...parsed.errors };
    if (!Object.keys(errors).length && !Object.keys(parsed.updates).length) {
      errors.stripe_key = 'Δεν αλλάξατε κάτι: επικολλήστε το κλειδί ή επιλέξτε «Αφαίρεση».';
    }
    if (Object.keys(errors).length) {
      return render(req, res, { stripeErrors: errors, stripeResult: { ok: false, title: 'Αποθήκευση', lines: Object.values(errors) }, retypeKey: parsed.typedKey && !parsed.errors.stripe_key }, 400);
    }
    return save(req, res, 'stripe', parsed.updates);
  });

  // ---------------- Επανεκκίνηση ----------------
  function requestRestart() {
    // Στα tests η διεργασία δεν τερματίζεται ποτέ.
    if (config.isTest) {
      if (onRestart) onRestart();
      return;
    }
    console.log('Επανεκκίνηση από τη Διαχείριση → Ρυθμίσεις δοκιμών...');
    if (onRestart) onRestart(RESTART_EXIT_CODE);
    else process.exit(RESTART_EXIT_CODE);
  }

  router.post('/restart', refuseInProduction, (req, res) => {
    res.set('Cache-Control', 'no-store');
    // Πρώτα φεύγει η σελίδα αναμονής, μετά τερματίζεται η ιστοσελίδα.
    res.on('finish', () => {
      if (config.isTest) requestRestart();
      else setTimeout(requestRestart, 300);
    });
    const target = '/admin/settings?restarted=1';
    // Χωρίς JavaScript η σελίδα ανανεώνεται με <meta refresh> μετά από λίγα δευτερόλεπτα.
    res.render('admin/restarting', { title: 'Επανεκκίνηση', bootId: BOOT_ID, target, refreshUrl: target });
  });

  return router;
};

module.exports.RESTART_EXIT_CODE = RESTART_EXIT_CODE;
