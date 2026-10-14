'use strict';

// Πληρωμές μέσω Revolut Business (Merchant API, σελίδα πληρωμής του Revolut).

const config = require('../../config');
const time = require('../time');
const { createClient, verifyWebhookSignature, successfulPayment } = require('./revolut-client');

let client = config.revolut.secretKey
  ? createClient({ secretKey: config.revolut.secretKey, sandbox: config.revolut.sandbox })
  : null;

const name = 'revolut';
const label = 'Revolut';

function enabled() {
  return client !== null;
}

function mode() {
  return config.revolut.sandbox ? 'test' : 'live';
}

const WEBHOOK_EVENTS = ['ORDER_COMPLETED', 'ORDER_AUTHORISED', 'ORDER_CANCELLED', 'ORDER_FAILED'];

// Έλεγχος από τη σελίδα «Έλεγχος συστήματος»: ισχύει το κλειδί; υπάρχει webhook προς εμάς;
async function checkConnection() {
  const lines = [];
  let ok = true;
  const list = await client.listWebhooks();
  lines.push(`Το κλειδί ισχύει (${mode() === 'live' ? 'πραγματικές πληρωμές' : 'Sandbox - δοκιμαστική λειτουργία'}).`);
  const hooks = Array.isArray(list) ? list : (list && list.webhooks) || [];
  const url = `${config.baseUrl}/webhooks/revolut`;
  const hook = hooks.find((w) => w.url === url);
  if (!hook) {
    ok = false;
    lines.push(`Δεν βρέθηκε webhook προς ${url}. Τρέξτε: npm run revolut:webhook`);
  } else {
    const missing = WEBHOOK_EVENTS.filter((e) => !(hook.events || []).includes(e));
    if (missing.length) {
      ok = false;
      lines.push(`Στο webhook λείπουν τα γεγονότα: ${missing.join(', ')}.`);
    } else {
      lines.push(`Webhook ${url}: ενεργό με όλα τα απαραίτητα γεγονότα.`);
    }
  }
  if (!config.revolut.webhookSecret) {
    ok = false;
    lines.push('Λείπει το REVOLUT_WEBHOOK_SECRET (τρέξτε: npm run revolut:webhook).');
  }
  if (!config.baseUrl.startsWith('https://')) {
    ok = false;
    lines.push('Το BASE_URL δεν είναι https: το Revolut δεν επιστρέφει τον πελάτη στην ιστοσελίδα μετά την πληρωμή.');
  }
  return { ok, lines };
}

// Για τα tests: αντικατάσταση με ψεύτικο client.
function setClient(fake) {
  client = fake;
}

const STATE_MAP = {
  pending: 'open',
  processing: 'processing',
  authorised: 'authorised',
  completed: 'paid',
  cancelled: 'cancelled',
  failed: 'expired',
};

function cardInfo(order) {
  const payment = successfulPayment(order);
  const pm = payment && payment.payment_method;
  if (!pm) return { card: null, captureDeadlineMs: null };
  return {
    card: { brand: pm.card_brand || null, last4: pm.card_last_four || null, funding: pm.funding || null },
    captureDeadlineMs: pm.capture_deadline ? Date.parse(pm.capture_deadline) : null,
  };
}

// Οι επιχειρήσεις ενοικίασης αυτοκινήτων πρέπει να στέλνουν στοιχεία της ενοικίασης σε κάθε παραγγελία.
function carRentalData(booking, refundability) {
  const pickup = time.localToDate(booking.pickup_at);
  const dropoff = time.localToDate(booking.return_at);
  return {
    car_rental: {
      booking_id: booking.reference,
      pick_up_date: pickup ? pickup.toISOString() : undefined,
      drop_off_date: dropoff ? dropoff.toISOString() : undefined,
      refundability,
    },
  };
}

async function createCheckout({ kind, booking, amountCents, description, expiresAtMs, successUrl, refId = null, hold = false, holdDays = 30 }) {
  const body = {
    amount: amountCents,
    currency: 'EUR',
    description: `${description} (${booking.reference})`,
    merchant_order_data: { reference: `${booking.reference}-${kind}${refId === null ? '' : `-${refId}`}` },
    metadata: { booking_reference: booking.reference, kind, ref_id: refId === null ? '' : String(refId) },
    // Το Revolut δεν δέχεται localhost/IP: χωρίς https ο πελάτης μένει στη σελίδα του Revolut.
    ...(successUrl.startsWith('https://') ? { redirect_url: successUrl } : {}),
    industry_data: carRentalData(booking, kind === 'rental' ? 'partially_refundable' : 'refundable'),
  };
  if (hold) {
    // Προέγκριση: το ποσό δεσμεύεται έως 30 ημέρες και χρεώνεται (μερικώς) ή αποδεσμεύεται αργότερα.
    body.capture_mode = 'manual';
    body.authorisation_type = 'pre_authorisation';
    body.cancel_authorised_after = `P${Math.min(Math.max(holdDays, 1), 30)}D`;
    body.enforce_challenge = 'forced';
  } else {
    body.capture_mode = 'automatic';
  }
  const minutes = Math.max(1, Math.floor((expiresAtMs - Date.now()) / 60000));
  body.expire_pending_after = `PT${Math.min(minutes, 720)}M`;
  const order = await client.createOrder(body);
  return { id: order.id, url: order.checkout_url };
}

async function getCheckout(id) {
  const order = await client.getOrder(id);
  const meta = order.metadata || {};
  let status = STATE_MAP[order.state] || 'processing';
  // Αν έληξε μια προέγκριση, η παραγγελία μπορεί να επιστρέψει σε «pending».
  if (order.state === 'pending' && (order.payments || []).some((p) => ['cancelled', 'failed'].includes(p.state)) && order.capture_mode === 'manual') {
    status = 'open';
  }
  return {
    id: order.id,
    status,
    amountCents: order.amount,
    currency: order.currency,
    paymentRef: order.id,
    reference: meta.booking_reference || null,
    kind: meta.kind || null,
    refId: meta.ref_id ? Number(meta.ref_id) : null,
    ...cardInfo(order),
  };
}

async function expireCheckout(id) {
  try {
    const order = await client.getOrder(id);
    if (order.state === 'pending') await client.cancelOrder(id);
  } catch {
    // Τίποτα να γίνει.
  }
}

function refundStatus(state) {
  if (state === 'completed') return 'succeeded';
  if (['failed', 'cancelled', 'declined'].includes(state)) return 'failed';
  return 'pending';
}

// Το Revolut δέχεται Idempotency-Key στις επιστροφές: το ίδιο κλειδί δεν κάνει ποτέ δεύτερη.
async function refund(paymentRef, amountCents, key) {
  const r = await client.refundOrder(paymentRef, { amount: amountCents, currency: 'EUR', idempotencyKey: key });
  return { id: (r && r.id) || null, status: refundStatus(r && r.state) };
}

async function getRefund(id) {
  const order = await client.getOrder(id);
  return { status: refundStatus(order.state), reason: null };
}

async function getHold(holdRef) {
  const order = await client.getOrder(holdRef);
  const payment = successfulPayment(order);
  let status = 'pending';
  if (order.state === 'authorised') status = 'held';
  else if (order.state === 'completed') status = 'captured';
  else if (order.state === 'cancelled') status = 'released';
  else if (order.state === 'pending' && (order.payments || []).length) status = 'expired';
  else if (order.state === 'failed') status = 'expired';
  return {
    status,
    authorisedCents: (payment && payment.authorised_amount) || order.amount,
    capturedCents: order.state === 'completed' ? (payment && payment.settled_amount) || null : 0,
    ...cardInfo(order),
  };
}

async function captureHold(holdRef, amountCents) {
  // Η σύλληψη είναι idempotent στο Revolut για το ίδιο ποσό.
  await client.captureOrder(holdRef, amountCents);
}

async function releaseHold(holdRef) {
  await client.cancelOrder(holdRef);
}

function parseWebhook(rawBody, headers) {
  const ok = verifyWebhookSignature({
    rawBody,
    timestamp: headers['revolut-request-timestamp'],
    signatureHeader: headers['revolut-signature'],
    secrets: [config.revolut.webhookSecret],
  });
  if (!ok) throw new Error('Invalid Revolut webhook signature');
  const payload = JSON.parse(rawBody.toString('utf8'));
  if (!payload.order_id) return { eventId: null };
  return {
    eventId: `revolut:${payload.event}:${payload.order_id}:${headers['revolut-request-timestamp']}`,
    checkoutId: payload.order_id,
    holdRef: payload.order_id,
  };
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
