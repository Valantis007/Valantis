'use strict';

const express = require('express');
const payments = require('../lib/payments');
const bookings = require('../lib/bookings');
const { transaction } = require('../db');

// Το Stripe ειδοποιεί εδώ για πληρωμές, ακόμη κι αν ο πελάτης κλείσει τον browser
// πριν επιστρέψει στη σελίδα μας. Ρυθμίστε στο Stripe Dashboard το endpoint
// https://<domain>/webhooks/stripe με τα γεγονότα checkout.session.completed,
// checkout.session.async_payment_succeeded και checkout.session.expired.
module.exports = function webhookRoutes(db) {
  const router = express.Router();

  router.post('/stripe', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    if (!payments.enabled()) return res.status(404).end();
    let event;
    try {
      event = payments.constructEvent(req.body, req.get('stripe-signature'));
    } catch (err) {
      console.warn('[webhook] Μη έγκυρη υπογραφή:', err.message);
      return res.status(400).send('Invalid signature');
    }

    const seen = db.prepare('SELECT 1 FROM processed_webhooks WHERE event_id = ?').get(event.id);
    if (seen) return res.json({ received: true, duplicate: true });

    const session = event.data && event.data.object;
    const reference = session && session.metadata && session.metadata.booking_reference;
    try {
      if (reference && ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
        if (session.payment_status === 'paid') {
          await bookings.markPaidOnline(db, reference, {
            amountCents: session.amount_total,
            paymentIntent: session.payment_intent,
            sessionId: session.id,
            actor: 'stripe-webhook',
          });
        }
      } else if (reference && event.type === 'checkout.session.expired') {
        transaction(db, () => {
          const booking = bookings.getByReference(db, reference);
          if (booking && booking.status === 'pending_payment' && booking.stripe_session_id === session.id) {
            db.prepare(`UPDATE bookings SET status = 'expired', hold_expires_at = NULL WHERE id = ?`).run(booking.id);
            bookings.logEvent(db, booking.id, 'stripe-webhook', 'expired', 'Η σελίδα πληρωμής έληξε');
          }
        });
      }
      db.prepare('INSERT OR IGNORE INTO processed_webhooks (event_id) VALUES (?)').run(event.id);
    } catch (err) {
      console.error('[webhook]', err);
      // 500 => το Stripe θα ξαναστείλει το γεγονός αργότερα.
      return res.status(500).send('Error');
    }
    res.json({ received: true });
  });

  return router;
};
