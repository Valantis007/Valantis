'use strict';

// Υπολογισμός τιμής κράτησης. Είναι «καθαρή» συνάρτηση (χωρίς βάση δεδομένων)
// ώστε να ελέγχεται εύκολα και να χρησιμοποιείται τόσο για την προσφορά που
// βλέπει ο πελάτης όσο και για την τελική χρέωση στον server.
// Όλα τα ποσά είναι σε λεπτά του ευρώ και περιλαμβάνουν ΦΠΑ.

const config = require('../config');
const time = require('./time');

function mdInSeason(md, season) {
  if (season.start_md <= season.end_md) return md >= season.start_md && md <= season.end_md;
  // Περίοδος που «περνάει» την αλλαγή του έτους (π.χ. 12-20 έως 01-06).
  return md >= season.start_md || md <= season.end_md;
}

function seasonPercentFor(date, seasons) {
  const md = date.slice(5, 10);
  let best = null;
  for (const season of seasons) {
    // Αν επικαλύπτονται περίοδοι, ισχύει η υψηλότερη.
    if (mdInSeason(md, season) && (best === null || season.percent > best)) best = season.percent;
  }
  return best ?? 100;
}

function durationDiscountPercent(days, tiers = config.rules.durationDiscounts) {
  let percent = 0;
  for (const tier of tiers) if (days >= tier.minDays) percent = tier.percent;
  return percent;
}

function vatIncluded(totalCents, vatPercent = config.rules.vatPercent) {
  return totalCents - Math.round((totalCents * 100) / (100 + vatPercent));
}

/**
 * @param {object} p
 * @param {object} p.car                 Γραμμή από τον πίνακα cars
 * @param {string} p.pickupAt            Τοπική ώρα παραλαβής
 * @param {string} p.returnAt            Τοπική ώρα επιστροφής
 * @param {object} p.pickupLocation      Γραμμή από τον πίνακα locations
 * @param {object} p.returnLocation      Γραμμή από τον πίνακα locations
 * @param {Array<{extra: object, qty: number}>} [p.extras]
 * @param {Array<object>} [p.seasons]
 */
function computeQuote({ car, pickupAt, returnAt, pickupLocation, returnLocation, extras = [], seasons = [] }) {
  const days = time.rentalDays(pickupAt, returnAt);
  if (days < 1) throw new Error('Η επιστροφή πρέπει να είναι μετά την παραλαβή');

  const startDate = time.datePart(pickupAt);
  const dayLines = [];
  let baseCents = 0;
  for (let i = 0; i < days; i += 1) {
    const date = time.addDaysToDate(startDate, i);
    const percent = seasonPercentFor(date, seasons);
    const cents = Math.round((car.daily_rate_cents * percent) / 100);
    dayLines.push({ date, percent, cents });
    baseCents += cents;
  }

  const discountPercent = durationDiscountPercent(days);
  const discountCents = Math.round((baseCents * discountPercent) / 100);

  const extraLines = [];
  let extrasCents = 0;
  for (const { extra, qty } of extras) {
    if (!(qty > 0)) continue;
    const units = extra.pricing === 'per_day' ? days : 1;
    const total = extra.price_cents * units * qty;
    extraLines.push({
      extra_id: extra.id,
      name: extra.name,
      qty,
      unit_price_cents: extra.price_cents,
      pricing: extra.pricing,
      total_cents: total,
    });
    extrasCents += total;
  }

  const feeLines = [];
  const locationFee = Math.max(pickupLocation.fee_cents, returnLocation.fee_cents);
  if (locationFee > 0) {
    const loc = pickupLocation.fee_cents >= returnLocation.fee_cents ? pickupLocation : returnLocation;
    feeLines.push({ name: `Χρέωση σημείου (${loc.name})`, cents: locationFee });
  }
  if (pickupLocation.id !== returnLocation.id && config.rules.oneWayFeeCents > 0) {
    feeLines.push({ name: 'Επιστροφή σε διαφορετικό σημείο', cents: config.rules.oneWayFeeCents });
  }
  const feesCents = feeLines.reduce((sum, f) => sum + f.cents, 0);

  const totalCents = baseCents - discountCents + extrasCents + feesCents;

  return {
    days,
    dayLines,
    baseCents,
    discountPercent,
    discountCents,
    extraLines,
    extrasCents,
    feeLines,
    feesCents,
    totalCents,
    vatCents: vatIncluded(totalCents),
    depositCents: car.deposit_cents,
    avgDailyCents: Math.round((baseCents - discountCents) / days),
  };
}

module.exports = { computeQuote, seasonPercentFor, durationDiscountPercent, vatIncluded };
