'use strict';

// Ενσωμάτωση με το Stripe Checkout. Ο πελάτης πληρώνει σε σελίδα του Stripe,
// άρα τα στοιχεία της κάρτας δεν περνούν ποτέ από τον δικό μας server.

const config = require('../config');

let client = null;
if (config.stripe.secretKey) {
  const Stripe = require('stripe');
  client = new Stripe(config.stripe.secretKey);
}

function enabled() {
  return client !== null;
}

// Για τα tests: αντικατάσταση του Stripe με ψεύτικο αντικείμενο.
function setClient(fake) {
  client = fake;
}

async function createCheckoutSession(booking, car, holdExpiresAtMs) {
  return client.checkout.sessions.create({
    mode: 'payment',
    customer_email: booking.email,
    client_reference_id: booking.reference,
    metadata: { booking_reference: booking.reference },
    payment_intent_data: { metadata: { booking_reference: booking.reference } },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: booking.total_cents,
          product_data: {
            name: `Ενοικίαση ${car.make} ${car.model} - ${booking.days} ημέρες`,
            description: `Κράτηση ${booking.reference}`,
          },
        },
      },
    ],
    // Το Stripe δέχεται λήξη από 30 λεπτά και πάνω.
    expires_at: Math.floor(holdExpiresAtMs / 1000) - 60,
    success_url: `${config.baseUrl}/booking/${booking.reference}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.baseUrl}/booking/${booking.reference}/payment/cancel`,
    locale: 'el',
  });
}

async function retrieveSession(sessionId) {
  return client.checkout.sessions.retrieve(sessionId);
}

async function refund(paymentIntentId, amountCents) {
  return client.refunds.create({ payment_intent: paymentIntentId, amount: amountCents });
}

function constructEvent(rawBody, signature) {
  return client.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}

module.exports = { enabled, setClient, createCheckoutSession, retrieveSession, refund, constructEvent };
