'use strict';

// Ψεύτικοι πάροχοι πληρωμών για τα tests. Μιμούνται τους κανόνες των πραγματικών
// (π.χ. το Stripe απορρίπτει expires_at < 30', η σύλληψη δεν ξεπερνά τη δέσμευση).

function fakeStripe({ webhookSecret = 'whsec_test' } = {}) {
  let n = 0;
  const sessions = {};
  const intents = {};
  const refunds = [];
  const refundKeys = new Map();
  const state = { failRefunds: 0, failCreate: false };

  function makeIntent(session, funding) {
    const id = `pi_${++n}`;
    const manual = session.payment_intent_data && session.payment_intent_data.capture_method === 'manual';
    intents[id] = {
      id,
      amount: session.amount_total,
      amount_capturable: manual ? session.amount_total : 0,
      amount_received: manual ? 0 : session.amount_total,
      status: manual ? 'requires_capture' : 'succeeded',
      cancellation_reason: null,
      latest_charge: {
        payment_method_details: {
          card: { brand: 'visa', last4: '4242', funding, capture_before: Math.floor(Date.now() / 1000) + 7 * 86400 },
        },
      },
    };
    return intents[id];
  }

  const client = {
    checkout: {
      sessions: {
        async create(params) {
          if (state.failCreate) throw new Error('Stripe unavailable');
          const nowS = Math.floor(Date.now() / 1000);
          if (params.expires_at < nowS + 30 * 60 - 5 || params.expires_at > nowS + 24 * 3600) {
            throw new Error('expires_at must be 30 minutes to 24 hours from now');
          }
          const id = `cs_${++n}`;
          sessions[id] = {
            id,
            url: `https://checkout.stripe.com/c/pay/${id}`,
            status: 'open',
            payment_status: 'unpaid',
            amount_total: params.line_items[0].price_data.unit_amount,
            currency: 'eur',
            metadata: params.metadata,
            client_reference_id: params.client_reference_id,
            payment_intent: null,
            payment_intent_data: params.payment_intent_data,
            payment_method_options: params.payment_method_options,
            params,
          };
          return sessions[id];
        },
        async retrieve(id) {
          const s = sessions[id];
          if (!s) throw new Error('No such session');
          return { ...s, payment_intent: s.payment_intent ? intents[s.payment_intent] : null };
        },
        async expire(id) {
          const s = sessions[id];
          if (!s || s.status !== 'open') throw new Error('Session is not open');
          s.status = 'expired';
          return s;
        },
      },
    },
    paymentIntents: {
      async retrieve(id) {
        return intents[id];
      },
      async capture(id, { amount_to_capture }) {
        const pi = intents[id];
        if (pi.status !== 'requires_capture') throw new Error('PaymentIntent cannot be captured');
        if (amount_to_capture > pi.amount_capturable) throw new Error('amount_to_capture exceeds amount_capturable');
        pi.status = 'succeeded';
        pi.amount_received = amount_to_capture;
        pi.amount_capturable = 0;
        return pi;
      },
      async cancel(id) {
        const pi = intents[id];
        if (pi.status !== 'requires_capture') throw new Error('PaymentIntent cannot be canceled');
        pi.status = 'canceled';
        pi.cancellation_reason = 'requested_by_customer';
        pi.amount_capturable = 0;
        return pi;
      },
    },
    refunds: {
      async create(params, opts = {}) {
        if (state.failRefunds > 0) {
          state.failRefunds -= 1;
          throw new Error('Temporary Stripe error');
        }
        if (opts.idempotencyKey && refundKeys.has(opts.idempotencyKey)) return refundKeys.get(opts.idempotencyKey);
        const pi = intents[params.payment_intent];
        const already = refunds.filter((r) => r.payment_intent === params.payment_intent).reduce((s, r) => s + r.amount, 0);
        if (!pi || already + params.amount > pi.amount_received) throw new Error('Refund exceeds charge');
        const refund = { id: `re_${++n}`, status: 'succeeded', ...params };
        refunds.push(refund);
        if (opts.idempotencyKey) refundKeys.set(opts.idempotencyKey, refund);
        return refund;
      },
      async list({ payment_intent: pi }) {
        return { data: refunds.filter((r) => r.payment_intent === pi) };
      },
      async retrieve(id) {
        return refunds.find((r) => r.id === id);
      },
    },
    accounts: {
      async retrieve() {
        return { business_profile: { name: 'Δοκιμή' }, charges_enabled: true };
      },
    },
    balance: {
      async retrieve() {
        return { available: [] };
      },
    },
    webhookEndpoints: {
      async list() {
        return { data: state.webhookEndpoints || [] };
      },
    },
    webhooks: {
      constructEvent(raw, sig) {
        if (sig !== webhookSecret) throw new Error('bad signature');
        return JSON.parse(raw.toString());
      },
    },
  };

  // Ο «πελάτης» ολοκληρώνει τη σελίδα πληρωμής.
  function pay(sessionId, { funding = 'credit' } = {}) {
    const s = sessions[sessionId];
    if (s.status !== 'open') throw new Error(`session ${sessionId} is ${s.status}`);
    const pi = makeIntent(s, funding);
    s.payment_intent = pi.id;
    s.status = 'complete';
    s.payment_status = pi.status === 'succeeded' ? 'paid' : 'unpaid';
    return pi;
  }

  function event(type, object) {
    return JSON.stringify({ id: `evt_${++n}`, type, data: { object } });
  }

  return { client, sessions, intents, refunds, state, pay, event, webhookSecret };
}

function fakeRevolut() {
  let n = 0;
  const orders = {};
  const refunds = [];
  const webhooks = [];
  const client = {
    async listWebhooks() {
      return webhooks;
    },
    async createOrder(body) {
      const id = `ord_${++n}`;
      orders[id] = {
        id,
        state: 'pending',
        amount: body.amount,
        currency: body.currency,
        capture_mode: body.capture_mode,
        metadata: body.metadata,
        merchant_order_data: body.merchant_order_data,
        checkout_url: `https://checkout.revolut.com/payment-link/${id}`,
        payments: [],
        body,
      };
      return orders[id];
    },
    async getOrder(id) {
      if (!orders[id]) throw new Error('not found');
      return JSON.parse(JSON.stringify(orders[id]));
    },
    async captureOrder(id, amount) {
      const o = orders[id];
      if (o.state !== 'authorised') throw new Error('bad_state');
      if (amount > o.amount) throw new Error('amount exceeds authorised');
      o.state = 'completed';
      o.captured = amount;
      o.payments[0].state = 'captured';
      return o;
    },
    async cancelOrder(id) {
      const o = orders[id];
      if (!['pending', 'authorised'].includes(o.state)) throw new Error('bad_state');
      o.state = 'cancelled';
      return o;
    },
    async refundOrder(id, { amount, idempotencyKey }) {
      const o = orders[id];
      if (o.state !== 'completed') throw new Error('Only completed orders can be refunded');
      if (refunds.some((r) => r.key === idempotencyKey)) return {};
      refunds.push({ order: id, amount, key: idempotencyKey });
      return { type: 'refund', state: 'processing' };
    },
  };
  function pay(orderId, { funding = 'credit' } = {}) {
    const o = orders[orderId];
    const manual = o.capture_mode === 'manual';
    o.state = manual ? 'authorised' : 'completed';
    o.payments.push({
      id: `pay_${++n}`,
      state: manual ? 'authorised' : 'completed',
      authorised_amount: o.amount,
      payment_method: { type: 'card', card_brand: 'mastercard', card_last_four: '5454', funding, capture_deadline: new Date(Date.now() + 29 * 86400000).toISOString() },
    });
    return o;
  }
  return { client, orders, refunds, pay, webhooks };
}

module.exports = { fakeStripe, fakeRevolut };
