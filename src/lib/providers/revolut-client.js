'use strict';

// Ελάχιστος client για το Revolut Business Merchant API.
// Τεκμηρίωση: https://developer.revolut.com/docs/api/merchant
// (πηγή αλήθειας: github.com/revolut-engineering/revolut-openapi, έκδοση 2026-08-17)

const crypto = require('node:crypto');

const API_VERSION = '2026-08-17';
const BASE_URLS = {
  production: 'https://merchant.revolut.com',
  sandbox: 'https://sandbox-merchant.revolut.com',
};

class RevolutError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function createClient({ secretKey, sandbox = false, fetchImpl = globalThis.fetch }) {
  const base = sandbox ? BASE_URLS.sandbox : BASE_URLS.production;

  async function request(method, path, body, { idempotencyKey } = {}) {
    const headers = {
      Authorization: `Bearer ${secretKey}`,
      'Revolut-Api-Version': API_VERSION,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey.slice(0, 50);
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const message = (json && (json.message || json.code)) || `HTTP ${res.status}`;
      throw new RevolutError(`Revolut: ${message}`, { status: res.status, code: json && json.code, body: json });
    }
    return json;
  }

  return {
    createOrder: (params) => request('POST', '/api/orders', params),
    getOrder: (id) => request('GET', `/api/orders/${encodeURIComponent(id)}`),
    // Μία μόνο σύλληψη ανά παραγγελία· μερική σύλληψη ακυρώνει αυτόματα το υπόλοιπο.
    captureOrder: (id, amount) =>
      request('POST', `/api/orders/${encodeURIComponent(id)}/capture`, amount === undefined ? {} : { amount }),
    cancelOrder: (id) => request('POST', `/api/orders/${encodeURIComponent(id)}/cancel`),
    refundOrder: (id, { amount, currency = 'EUR', description, idempotencyKey }) =>
      request(
        'POST',
        `/api/orders/${encodeURIComponent(id)}/refund`,
        { amount, currency, ...(description ? { description } : {}) },
        { idempotencyKey },
      ),
    createWebhook: (url, events) => request('POST', '/api/webhooks', { url, events }),
    listWebhooks: () => request('GET', '/api/webhooks'),
  };
}

/**
 * Έλεγχος υπογραφής webhook.
 * payload_to_sign = "v1.{Revolut-Request-Timestamp}.{raw body}", HMAC-SHA256 με το signing secret (hex).
 * Η κεφαλίδα Revolut-Signature μπορεί να περιέχει πολλές τιμές "v1=..." χωρισμένες με κόμμα.
 */
function verifyWebhookSignature({ rawBody, timestamp, signatureHeader, secrets, nowMs = Date.now(), toleranceMs = 5 * 60 * 1000 }) {
  if (!rawBody || !timestamp || !signatureHeader) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs - ts) > toleranceMs) return false;
  const payload = Buffer.concat([Buffer.from(`v1.${timestamp}.`), Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody)]);
  const provided = String(signatureHeader)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('v1='))
    .map((s) => s.slice(3));
  for (const secret of secrets.filter(Boolean)) {
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    for (const sig of provided) {
      if (sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return true;
    }
  }
  return false;
}

// Η πληρωμή (απόπειρα) που ενέκρινε/ολοκλήρωσε την παραγγελία.
function successfulPayment(order) {
  const payments = (order && order.payments) || [];
  return (
    payments.find((p) => ['authorised', 'captured', 'completed'].includes(p.state)) ||
    payments.find((p) => p.state === 'authorisation_passed') ||
    null
  );
}

module.exports = { API_VERSION, BASE_URLS, RevolutError, createClient, verifyWebhookSignature, successfulPayment };
