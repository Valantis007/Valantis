'use strict';

require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const time = require('../src/lib/time');
const { computeQuote, seasonPercentFor, durationDiscountPercent, vatIncluded } = require('../src/lib/pricing');

const car = { id: 1, daily_rate_cents: 3000, deposit_cents: 30000 };
const office = { id: 1, name: 'Γραφείο', fee_cents: 0 };
const airport = { id: 2, name: 'Αεροδρόμιο', fee_cents: 2000 };

test('ημέρες χρέωσης: ανά 24ωρο με περιθώριο χάριτος', () => {
  assert.equal(time.rentalDays('2026-03-01T10:00', '2026-03-04T10:00'), 3);
  assert.equal(time.rentalDays('2026-03-01T10:00', '2026-03-04T10:59'), 3);
  assert.equal(time.rentalDays('2026-03-01T10:00', '2026-03-04T11:00'), 4);
  assert.equal(time.rentalDays('2026-03-01T10:00', '2026-03-01T14:00'), 1);
  assert.equal(time.rentalDays('2026-03-01T10:00', '2026-03-01T09:00'), 0);
});

test('απορρίπτονται μη υπαρκτές ημερομηνίες', () => {
  assert.equal(time.combine('2026-02-30', '10:00'), null);
  assert.equal(time.combine('2026-02-28', '10:00'), '2026-02-28T10:00');
  assert.equal(time.combine('x', '10:00'), null);
});

test('ηλικία σε πλήρη έτη', () => {
  assert.equal(time.yearsBetween('2000-06-15', '2021-06-14'), 20);
  assert.equal(time.yearsBetween('2000-06-15', '2021-06-15'), 21);
});

test('εποχικές τιμές, και περίοδοι που περνούν την αλλαγή έτους', () => {
  const seasons = [
    { start_md: '07-01', end_md: '08-31', percent: 140 },
    { start_md: '12-20', end_md: '01-06', percent: 115 },
  ];
  assert.equal(seasonPercentFor('2026-07-15', seasons), 140);
  assert.equal(seasonPercentFor('2026-06-30', seasons), 100);
  assert.equal(seasonPercentFor('2026-12-31', seasons), 115);
  assert.equal(seasonPercentFor('2027-01-03', seasons), 115);
});

test('έκπτωση διάρκειας', () => {
  assert.equal(durationDiscountPercent(6), 0);
  assert.equal(durationDiscountPercent(7), 5);
  assert.equal(durationDiscountPercent(14), 10);
  assert.equal(durationDiscountPercent(40), 15);
});

test('υπολογισμός προσφοράς με πρόσθετα, χρεώσεις σημείου και διαφορετική επιστροφή', () => {
  const q = computeQuote({
    car,
    pickupAt: '2026-06-29T10:00',
    returnAt: '2026-07-02T10:00',
    pickupLocation: airport,
    returnLocation: office,
    extras: [
      { extra: { id: 1, name: 'Κάθισμα', price_cents: 500, pricing: 'per_day' }, qty: 2 },
      { extra: { id: 2, name: 'Ρεζερβουάρ', price_cents: 6000, pricing: 'per_rental' }, qty: 1 },
    ],
    seasons: [{ start_md: '07-01', end_md: '08-31', percent: 140 }],
  });
  assert.equal(q.days, 3);
  // 29/6, 30/6 κανονική τιμή, 1/7 +40%
  assert.equal(q.baseCents, 3000 + 3000 + 4200);
  assert.equal(q.extrasCents, 500 * 3 * 2 + 6000);
  assert.equal(q.feesCents, 2000 + 3000);
  assert.equal(q.totalCents, q.baseCents + q.extrasCents + q.feesCents);
  assert.equal(q.vatCents, vatIncluded(q.totalCents));
});

test('ΦΠΑ που περιλαμβάνεται στην τιμή', () => {
  assert.equal(vatIncluded(12400, 24), 2400);
});
