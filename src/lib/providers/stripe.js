'use strict';

// Πληρωμές μέσω Stripe Checkout. Τα στοιχεία της κάρτας δεν περνούν ποτέ από τον server μας.

const config = require('../../config');

let client = null;
if (config.stripe.secretKey) {
  const Stripe = require('stripe');
  client = new Stripe(config.stripe.secretKey);
}

const name = 'stripe';
const label = 'Stripe';

function enabled() {
  return client !== null;
}

// 'test' με κλειδιά sk_test_/rk_test_ (δοκιμαστικές κάρτες, καμία πραγματική χρέωση).
function mode() {
  const key = config.stripe.secretKey;
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  return 'unknown';
}

// Γεγονότα που πρέπει να στέλνει το webhook του Stripe (βλ. README).
const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.expired',
  'payment_intent.canceled',
  'payment_intent.succeeded',
  'charge.expired',
];

/**
 * Έλεγχος από τη σελίδα «Έλεγχος συστήματος»: ισχύει το κλειδί; υπάρχει webhook προς
 * τη διεύθυνσή μας με όλα τα γεγονότα;
 */
async function checkConnection() {
  const lines = [];
  let ok = true;
  const account = await client.accounts.retrieve().catch(() => null);
  await client.balance.retrieve();
  lines.push(`Το κλειδί ισχύει (${mode() === 'live' ? 'πραγματικές πληρωμές' : 'δοκιμαστική λειτουργία'})${account && account.business_profile && account.business_profile.name ? ` - λογαριασμός «${account.business_profile.name}»` : ''}.`);
  if (account && account.charges_enabled === false) {
    ok = false;
    lines.push('Ο λογαριασμός Stripe δεν μπορεί ακόμη να δεχτεί πληρωμές: ολοκληρώστε την επαλήθευση στο dashboard.');
  }
  const url = `${config.baseUrl}/webhooks/stripe`;
  const endpoints = await client.webhookEndpoints.list({ limit: 100 });
  const hook = (endpoints.data || []).find((e) => e.url === url);
  if (!hook) {
    ok = false;
    lines.push(`Δεν βρέθηκε webhook προς ${url}. Προσθέστε το στο Stripe → Developers → Webhooks.`);
  } else {
    const events = hook.enabled_events || [];
    const missing = events.includes('*') ? [] : WEBHOOK_EVENTS.filter((e) => !events.includes(e));
    if (hook.status !== 'enabled') {
      ok = false;
      lines.push(`Το webhook ${url} είναι απενεργοποιημένο.`);
    } else if (missing.length) {
      ok = false;
      lines.push(`Στο webhook λείπουν τα γεγονότα: ${missing.join(', ')}.`);
    } else {
      lines.push(`Webhook ${url}: ενεργό με όλα τα απαραίτητα γεγονότα.`);
    }
  }
  if (!config.stripe.webhookSecret) {
    ok = false;
    lines.push('Λείπει το STRIPE_WEBHOOK_SECRET (Signing secret του webhook).');
  }
  return { ok, lines };
}

// Για τα tests: αντικατάσταση του Stripe με ψεύτικο αντικείμενο.
function setClient(fake) {
  client = fake;
}

function cardInfo(pi) {
  const charge = pi && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const card = charge && charge.payment_method_details && charge.payment_method_details.card;
  if (!card) return { card: null, captureDeadlineMs: null };
  return {
    card: { brand: card.brand || null, last4: card.last4 || null, funding: card.funding || null },
    captureDeadlineMs: card.capture_before ? card.capture_before * 1000 : null,
  };
}

/**
 * @param {object} p
 * @param {'rental'|'deposit'|'charge'} p.kind
 * @param {object} p.booking
 * @param {number} p.amountCents
 * @param {string} p.description
 * @param {number} p.expiresAtMs        Λήξη της σελίδας πληρωμής (30' έως 24 ώρες από τώρα)
 * @param {string} p.successUrl
 * @param {string} p.cancelUrl
 * @param {number} [p.refId]
 * @param {boolean} [p.hold]            Δέσμευση ποσού (χωρίς χρέωση) — για την εγγύηση
 */
async function createCheckout({ kind, booking, amountCents, description, expiresAtMs, successUrl, cancelUrl, refId = null, hold = false }) {
  const metadata = { booking_reference: booking.reference, kind, ref_id: refId === null ? '' : String(refId) };
  const params = {
    mode: 'payment',
    customer_email: booking.email,
    client_reference_id: booking.reference,
    metadata,
    payment_intent_data: { metadata, description: `${description} (${booking.reference})` },
    line_items: [
      {
        quantity: 1,
        price_data: { currency: 'eur', unit_amount: amountCents, product_data: { name: description } },
      },
    ],
    expires_at: Math.floor(expiresAtMs / 1000),
    success_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    locale: 'el',
  };
  if (hold) {
    // Μόνο κάρτα (όχι PayPal, Klarna, Link κ.λπ.): η εγγύηση είναι δέσμευση σε πιστωτική κάρτα.
    params.payment_method_types = ['card'];
    params.payment_intent_data.capture_method = 'manual';
    params.payment_method_options = {
      card: {
        // Η εγγύηση δέχεται μόνο πιστωτικές κάρτες.
        restrictions: { funding_types_blocked: ['debit', 'prepaid'] },
        ...(config.stripe.extendedAuthorization ? { request_extended_authorization: 'if_available' } : {}),
      },
    };
  }
  const session = await client.checkout.sessions.create(params);
  return { id: session.id, url: session.url };
}

async function getCheckout(id) {
  const s = await client.checkout.sessions.retrieve(id, { expand: ['payment_intent.latest_charge'] });
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
  let status = 'open';
  if (s.status === 'expired') status = 'expired';
  else if (s.status === 'complete') {
    if (pi && pi.status === 'requires_capture') status = 'authorised';
    else if (s.payment_status === 'paid') status = 'paid';
    else if (pi && pi.status === 'canceled') status = 'cancelled';
    else status = 'processing';
  }
  const meta = s.metadata || {};
  return {
    id: s.id,
    status,
    amountCents: s.amount_total,
    currency: String(s.currency || 'eur').toUpperCase(),
    paymentRef: pi ? pi.id : typeof s.payment_intent === 'string' ? s.payment_intent : null,
    reference: meta.booking_reference || s.client_reference_id || null,
    kind: meta.kind || null,
    refId: meta.ref_id ? Number(meta.ref_id) : null,
    ...cardInfo(pi),
  };
}

async function expireCheckout(id) {
  try {
    await client.checkout.sessions.expire(id);
  } catch {
    // Ήδη ολοκληρωμένη ή ληγμένη: τίποτα να γίνει.
  }
}

function refundStatus(status) {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed' || status === 'canceled') return 'failed';
  return status === 'requires_action' ? 'requires_action' : 'pending';
}

/**
 * Επιστροφή χρημάτων. Το `key` αναγνωρίζει την επιστροφή σε όλες τις προσπάθειες: αν υπάρχει
 * ήδη επιστροφή με αυτό (π.χ. χάθηκε η απάντηση), δεν γίνεται δεύτερη. Το Stripe κρατά και τα
 * σφάλματα 5xx ανά idempotency key για 24 ώρες, γι' αυτό κάθε προσπάθεια έχει δικό της.
 */
async function refund(paymentRef, amountCents, key, { attempt = 0 } = {}) {
  const existing = await client.refunds.list({ payment_intent: paymentRef, limit: 100 });
  const found = (existing.data || []).find((r) => r.metadata && r.metadata.refund_key === key && refundStatus(r.status) !== 'failed');
  if (found) return { id: found.id, status: refundStatus(found.status) };
  const created = await client.refunds.create(
    { payment_intent: paymentRef, amount: amountCents, metadata: { refund_key: key } },
    // Η πρώτη προσπάθεια με το ίδιο κλειδί που χρησιμοποιούσαν οι παλαιότερες εκδόσεις.
    { idempotencyKey: attempt ? `${key}-a${attempt}` : key },
  );
  return { id: created.id, status: refundStatus(created.status) };
}

async function getRefund(id) {
  const r = await client.refunds.retrieve(id);
  return { status: refundStatus(r.status), reason: r.failure_reason || null };
}

async function getHold(holdRef) {
  const pi = await client.paymentIntents.retrieve(holdRef, { expand: ['latest_charge'] });
  let status = 'pending';
  if (pi.status === 'requires_capture') status = 'held';
  else if (pi.status === 'succeeded') status = 'captured';
  else if (pi.status === 'canceled') status = ['automatic', 'expired'].includes(pi.cancellation_reason) ? 'expired' : 'released';
  return {
    status,
    authorisedCents: pi.amount_capturable || pi.amount,
    capturedCents: pi.amount_received || 0,
    ...cardInfo(pi),
  };
}

async function captureHold(holdRef, amountCents, idempotencyKey) {
  await client.paymentIntents.capture(holdRef, { amount_to_capture: amountCents }, { idempotencyKey });
}

async function releaseHold(holdRef, idempotencyKey) {
  await client.paymentIntents.cancel(holdRef, { cancellation_reason: 'requested_by_customer' }, { idempotencyKey });
}

// Το webhook μάς λέει μόνο «κάτι άλλαξε»· την πραγματική κατάσταση τη διαβάζουμε από το Stripe.
function parseWebhook(rawBody, headers) {
  const event = client.webhooks.constructEvent(rawBody, headers['stripe-signature'], config.stripe.webhookSecret);
  const obj = (event.data && event.data.object) || {};
  if (event.type.startsWith('checkout.session.')) return { eventId: event.id, checkoutId: obj.id };
  if (event.type.startsWith('payment_intent.')) return { eventId: event.id, holdRef: obj.id };
  if (event.type.startsWith('charge.') && obj.payment_intent) return { eventId: event.id, holdRef: obj.payment_intent };
  return { eventId: event.id };
}

module.exports = {
  name,
  label,
  enabled,
  setClient,
  createCheckout,
  getCheckout,
  expireCheckout,
  refund,
  mode,
  checkConnection,
  getRefund,
  getHold,
  captureHold,
  releaseHold,
  parseWebhook,
};
