'use strict';

// Επιλογή παρόχου online πληρωμών (Stripe ή Revolut).

const config = require('../../config');
const stripe = require('./stripe');
const revolut = require('./revolut');

const PROVIDERS = { stripe, revolut };

// Πάροχος με το όνομα αυτό, αν είναι ρυθμισμένος.
function get(name) {
  const p = PROVIDERS[name];
  return p && p.enabled() ? p : null;
}

// Ο πάροχος για τις νέες online πληρωμές.
function active() {
  const preferred = get(config.payments.provider);
  if (preferred) return preferred;
  return get('stripe') || get('revolut');
}

function onlineEnabled() {
  return active() !== null;
}

function all() {
  return Object.values(PROVIDERS);
}

module.exports = { get, active, onlineEnabled, all, PROVIDERS };
