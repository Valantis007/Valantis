'use strict';

const express = require('express');
const providers = require('../lib/providers');
const payments = require('../lib/payments');
const deposits = require('../lib/deposits');

// Ειδοποιήσεις (webhooks) από τους παρόχους πληρωμών. Ενημερώνουν για πληρωμές ακόμη
// κι αν ο πελάτης κλείσει τον browser πριν επιστρέψει στη σελίδα μας.
//
// Stripe:  https://<domain>/webhooks/stripe  — γεγονότα checkout.session.*, payment_intent.*, charge.expired
// Revolut: https://<domain>/webhooks/revolut — γεγονότα ORDER_* (εγγραφή με: npm run revolut:webhook)
//
// Το περιεχόμενο της ειδοποίησης δεν θεωρείται αξιόπιστο: ελέγχεται η υπογραφή και
// η πραγματική κατάσταση διαβάζεται πάντα από τον πάροχο.
module.exports = function webhookRoutes(db) {
  const router = express.Router();

  const knownProvider = (req, res, next) => (providers.get(req.params.provider) ? next() : res.status(404).end());

  router.post('/:provider', knownProvider, express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    const provider = providers.get(req.params.provider);

    let info;
    try {
      info = provider.parseWebhook(req.body, req.headers);
    } catch (err) {
      console.warn(`[webhook ${provider.name}] Μη έγκυρη υπογραφή:`, err.message);
      return res.status(400).send('Invalid signature');
    }
    if (!info || !info.eventId) return res.status(204).end();
    if (db.prepare('SELECT 1 FROM processed_webhooks WHERE event_id = ?').get(info.eventId)) {
      return res.status(204).end();
    }

    try {
      if (info.checkoutId && payments.getCheckoutRow(db, info.checkoutId)) {
        await payments.reconcileCheckout(db, info.checkoutId, { actor: `${provider.name}-webhook` });
      }
      if (info.holdRef) {
        const dep = db.prepare(`SELECT id FROM deposits WHERE hold_ref = ? AND status = 'held'`).get(info.holdRef);
        if (dep) await deposits.syncHold(db, dep.id);
      }
      db.prepare('INSERT OR IGNORE INTO processed_webhooks (event_id) VALUES (?)').run(info.eventId);
    } catch (err) {
      console.error(`[webhook ${provider.name}]`, err);
      // 500 => ο πάροχος θα ξαναστείλει την ειδοποίηση αργότερα.
      return res.status(500).send('Error');
    }
    res.status(204).end();
  });

  return router;
};
