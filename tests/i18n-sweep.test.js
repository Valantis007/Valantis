'use strict';

// Γλώσσες: κείμενα που παράγει ο κώδικας (JavaScript του browser, ενδείξεις στη βάση,
// ονόματα αρχείων) εμφανίζονται κι αυτά στη γλώσσα της σελίδας / του email.

const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bookingsLib = require('../src/lib/bookings');
const deposits = require('../src/lib/deposits');
const mailer = require('../src/lib/mailer');

const GREEK = /[Ͱ-Ͽἀ-῿]/;
const LATIN_DRIVER = { first_name: 'John', last_name: 'Smith', email: 'john@example.com', license_country: 'United Kingdom' };

function decode(attr) {
  return attr.replace(/&#34;|&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

for (const locale of ['en', 'es']) {
  const p = (x) => `/${locale}${x}`;

  test(`[${locale}] ημερολόγιο και πεδία ημερομηνίας: όλα τα κείμενα του public/js/dates.js έρχονται μεταφρασμένα`, async () => {
    const { app } = h.setup();
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dates.js'), 'utf8');
    const used = [...new Set([...js.matchAll(/texts\.(\w+)/g)].map((m) => m[1]))];
    assert.ok(used.length >= 8, 'βρέθηκαν τα κείμενα του ημερολογίου');
    const search = new URLSearchParams(h.searchParams()).toString();
    for (const page of ['/', '/cars', `/cars?${search}`, `/cars/1?${search}`]) {
      const res = await h.request(app).get(p(page));
      const m = /data-calendar="([^"]*)"/.exec(res.text);
      assert.ok(m, `${page}: data-calendar`);
      const texts = JSON.parse(decode(m[1]));
      for (const key of used) {
        assert.ok(texts[key] && !GREEK.test(texts[key]), `${p(page)}: κείμενο ημερολογίου «${key}» = ${texts[key]}`);
      }
      assert.match(texts.days, /\{n\}/);
    }
    const form = await h.request(app).get(p(`/booking/new?${search}`));
    for (const attr of ['data-dmy', 'data-dmy-invalid', 'data-hint-pickup']) {
      const m = new RegExp(`${attr}="([^"]*)"`).exec(form.text);
      assert.ok(m && m[1] && !GREEK.test(m[1]), `${attr}: ${m && m[1]}`);
    }
  });

  test(`[${locale}] φόρμα κράτησης μετά από σφάλμα: η ένδειξη αφαιρεμένου αριθμού κάρτας στη γλώσσα της σελίδας`, async () => {
    const { app } = h.setup();
    const agent = h.agent(app);
    const search = new URLSearchParams(h.searchParams()).toString();
    const res = await h.post(
      agent,
      p('/booking'),
      { ...h.searchParams(), ...h.driver({ ...LATIN_DRIVER, first_name: '', notes: 'My card 4242 4242 4242 4242 thanks' }) },
      p(`/booking/new?${search}`),
    );
    assert.equal(res.status, 422);
    const notes = /<textarea id="notes"[^>]*>([^<]*)<\/textarea>/.exec(res.text)[1];
    assert.doesNotMatch(notes, /4242/);
    assert.doesNotMatch(notes, GREEK);
  });

  test(`[${locale}] χρέωση ζημιάς πέραν της απαλλαγής: τεκμηρίωση στη σελίδα και στο email χωρίς ελληνικά`, async () => {
    const { db, app } = h.setup();
    const agent = h.agent(app);
    const search = new URLSearchParams(h.searchParams()).toString();
    const res = await h.post(agent, p('/booking'), { ...h.searchParams(), ...h.driver(LATIN_DRIVER) }, p(`/booking/new?${search}`));
    const booking = bookingsLib.getByReference(db, h.bookingRef(res));
    db.prepare(`UPDATE bookings SET status = 'completed' WHERE id = ?`).run(booking.id);
    await h.mailer.flush();
    h.mailer.outbox.length = 0;
    deposits.addCharge(db, booking.id, {
      category: 'damage',
      description: 'Broken mirror',
      amountCents: (booking.excess_cents || 0) + 10000,
      evidence: 'Return report 12',
      beyondExcess: '§7 exclusion',
      actor: 'test',
    });
    const page = await agent.get(p(`/booking/${booking.reference}`));
    assert.match(page.text, /§7 exclusion/);
    assert.doesNotMatch(page.text.replace(/<script[\s\S]*?<\/script>/g, ''), /Πέραν/);
    await h.mailer.flush();
    const mail = h.mailer.outbox.find((m) => m.to === 'john@example.com');
    assert.ok(mail, 'στάλθηκε email για αποδοχή');
    assert.match(mail.html, /§7 exclusion/);
    assert.doesNotMatch(mail.html, /Πέραν/);
  });

  test(`[${locale}] ονόματα αρχείων: όροι στο email και λήψη δεδομένων στη γλώσσα του πελάτη`, async () => {
    const { app } = h.setup();
    const files = await mailer.termsAttachments(locale);
    assert.equal(files.length, 2);
    assert.match(files[0].filename, new RegExp(`-${locale}\\.html$`));
    for (const f of files) assert.doesNotMatch(f.filename, /oroi-enoikiasis/);
    if (locale === 'es') for (const f of files) assert.doesNotMatch(f.filename, /rental|terms|greek/);
    const agent = h.agent(app);
    await h.post(agent, p('/register'), { first_name: 'Ann', last_name: 'Lee', email: 'ann@example.com', password: 'Password123', password_confirm: 'Password123' }, p('/register'));
    const exp = await agent.get(p('/account/export'));
    assert.equal(exp.status, 200);
    assert.doesNotMatch(exp.headers['content-disposition'], /ta-dedomena-mou/);
  });
}
