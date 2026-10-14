'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');

const time = require('../lib/time');
const format = require('../lib/format');
const bookings = require('../lib/bookings');
const payments = require('../lib/payments');
const deposits = require('../lib/deposits');
const providers = require('../lib/providers');
const mailer = require('../lib/mailer');
const QRCode = require('qrcode');
const { transaction, normalizeText } = require('../db');
const { BLOCKING_SQL, OVERLAP_SQL, EFFECTIVE_RETURN_SQL, blockingParams } = require('../lib/availability');
const { str, intOrNull, checkbox } = require('../lib/validation');
const { requireAdmin } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/security');

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const CATEGORIES = Object.keys(format.labels.category);
const TRANSMISSIONS = Object.keys(format.labels.transmission);
const FUELS = Object.keys(format.labels.fuel);
const STATUSES = Object.keys(format.labels.status);
const MD_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const PAGE_SIZE = 50;
const EARLY_PICKUP_HOURS = 12;

// Οι ελληνικές πινακίδες χρησιμοποιούν μόνο γράμματα που μοιάζουν με λατινικά.
// Αποθηκεύουμε πάντα ελληνικά κεφαλαία χωρίς κενά/παύλες, ώστε «NBA 1001» = «ΝΒΑ1001».
const LATIN_TO_GREEK = { A: 'Α', B: 'Β', E: 'Ε', Z: 'Ζ', H: 'Η', I: 'Ι', K: 'Κ', M: 'Μ', N: 'Ν', O: 'Ο', P: 'Ρ', T: 'Τ', Y: 'Υ', X: 'Χ' };
function normalizePlate(value) {
  return String(value || '')
    .toLocaleUpperCase('el')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\s-]/g, '')
    .replace(/[ABEZHIKMNOPTYX]/g, (c) => LATIN_TO_GREEK[c]);
}

module.exports = function adminRoutes(db, { uploadDir }) {
  const router = express.Router();
  router.use(requireAdmin);

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => cb(null, `${crypto.randomBytes(12).toString("hex")}${IMAGE_TYPES[file.mimetype]}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      if (Object.hasOwn(IMAGE_TYPES, file.mimetype)) return cb(null, true);
      const err = new Error('Επιτρέπονται μόνο εικόνες JPG, PNG ή WEBP.');
      err.status = 400;
      return cb(err);
    },
  });

  function removeUpload(file) {
    if (file) fs.rm(file.path, { force: true }, () => {});
  }

  // Ανέβασμα εικόνας + έλεγχος CSRF (που για multipart γίνεται μετά το multer).
  function withImage(req, res, next) {
    upload.single('image')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') err.message = 'Η εικόνα πρέπει να είναι έως 5MB.';
        err.status = err.status || 400;
        return next(err);
      }
      return verifyCsrf(req, res, (csrfErr) => {
        if (csrfErr) removeUpload(req.file);
        next(csrfErr);
      });
    });
  }

  const actor = (req) => `admin:${req.user.id}`;
  const idParam = (req) => intOrNull(req.params.id) ?? -1;

  // ---------------- Πίνακας ελέγχου ----------------
  router.get('/', (req, res) => {
    bookings.expireStaleHolds(db);
    const now = time.nowLocal();
    const today = time.datePart(now);
    const monthStart = `${today.slice(0, 7)}-01T00:00`;
    const nextMonth = time.addDaysToDate(`${today.slice(0, 7)}-28`, 7).slice(0, 7);
    const list = (sql, ...args) => db.prepare(sql).all(...args);
    const select = `SELECT b.*, c.make, c.model, c.plate, pl.name AS pickup_location_name, rl.name AS return_location_name
      FROM bookings b JOIN cars c ON c.id = b.car_id
      JOIN locations pl ON pl.id = b.pickup_location_id JOIN locations rl ON rl.id = b.return_location_id`;
    res.render('admin/dashboard', {
      title: 'Πίνακας ελέγχου',
      pickups: list(`${select} WHERE b.status = 'confirmed' AND substr(b.pickup_at, 1, 10) <= ? ORDER BY b.pickup_at`, today),
      returns: list(`${select} WHERE b.status = 'active' AND substr(b.return_at, 1, 10) <= ? ORDER BY b.return_at`, today),
      upcoming: list(
        `${select} WHERE b.status = 'confirmed' AND substr(b.pickup_at, 1, 10) > ? ORDER BY b.pickup_at LIMIT 10`,
        today,
      ),
      stats: {
        active: db.prepare(`SELECT COUNT(*) n FROM bookings WHERE status = 'active'`).get().n,
        confirmed: db.prepare(`SELECT COUNT(*) n FROM bookings WHERE status = 'confirmed'`).get().n,
        fleet: db.prepare('SELECT COUNT(*) n FROM cars WHERE active = 1').get().n,
        monthRevenue: db
          .prepare(
            `SELECT COALESCE(SUM(CASE
                WHEN status IN ('confirmed', 'active', 'completed') THEN total_cents - refunded_cents
                WHEN status IN ('cancelled', 'expired') THEN paid_cents - refunded_cents
                ELSE 0 END), 0) s
             FROM bookings WHERE pickup_at >= ? AND pickup_at < ?`,
          )
          .get(monthStart, `${nextMonth}-01T00:00`).s,
        unreadMessages: db.prepare('SELECT COUNT(*) n FROM messages WHERE handled = 0').get().n,
      },
      attention: deposits.attentionList(db),
      refundProblems: db
        .prepare(
          `SELECT r.*, b.reference FROM refunds r JOIN bookings b ON b.id = r.booking_id
           WHERE r.status = 'failed' OR (r.status = 'pending' AND r.attempts > 0) ORDER BY r.id DESC`,
        )
        .all(),
      refundsDue: db
        .prepare(
          `SELECT b.id, b.reference, b.first_name, b.last_name, b.paid_cents - b.refunded_cents AS due_cents FROM bookings b
           WHERE b.paid_cents > b.refunded_cents AND b.status IN ('cancelled', 'expired')
             AND EXISTS (SELECT 1 FROM booking_events e WHERE e.booking_id = b.id AND e.action = 'refund_due')
           ORDER BY b.id DESC`,
        )
        .all(),
    });
  });

  // ---------------- Κρατήσεις ----------------
  router.get('/bookings', (req, res) => {
    bookings.expireStaleHolds(db);
    const filters = {
      status: STATUSES.includes(req.query.status) ? req.query.status : '',
      q: str(req.query.q, 100),
      from: time.isValidDate(req.query.from) ? req.query.from : '',
      to: time.isValidDate(req.query.to) ? req.query.to : '',
    };
    const page = Math.max(intOrNull(req.query.page) ?? 1, 1);
    const where = [];
    const params = {};
    if (filters.status) {
      where.push('b.status = :status');
      params.status = filters.status;
    }
    if (filters.q) {
      where.push(`(b.reference LIKE :q OR norm(b.email) LIKE :qn OR norm(b.last_name) LIKE :qn
        OR norm(b.first_name) LIKE :qn OR norm(b.first_name || ' ' || b.last_name) LIKE :qn
        OR replace(b.phone, ' ', '') LIKE :qphone OR c.plate LIKE :qplate)`);
      const clean = filters.q.replace(/[%_]/g, '');
      params.q = `%${clean}%`;
      params.qn = `%${normalizeText(clean)}%`;
      params.qphone = `%${clean.replace(/\s/g, '')}%`;
      params.qplate = `%${normalizePlate(clean)}%`;
    }
    if (filters.from) {
      where.push('b.pickup_at >= :from');
      params.from = `${filters.from}T00:00`;
    }
    if (filters.to) {
      where.push('b.pickup_at <= :to');
      params.to = `${filters.to}T23:59`;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) n FROM bookings b JOIN cars c ON c.id = b.car_id ${whereSql}`).get(params).n;
    const rows = db
      .prepare(
        `SELECT b.*, c.make, c.model, c.plate FROM bookings b JOIN cars c ON c.id = b.car_id ${whereSql}
         ORDER BY b.pickup_at DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      )
      .all(params);
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    res.render('admin/bookings', {
      title: 'Κρατήσεις',
      rows,
      filters,
      page,
      pages: Math.max(Math.ceil(total / PAGE_SIZE), 1),
      total,
      qs,
      statuses: STATUSES,
    });
  });

  function loadBooking(req, res, next) {
    const booking = bookings.getById(db, idParam(req));
    if (!booking) return next('route');
    req.booking = booking;
    next();
  }

  router.get('/bookings/:id', loadBooking, async (req, res) => {
    const b = req.booking;
    // Φρέσκια εικόνα της online εγγύησης από τον πάροχο.
    const held = deposits.heldDeposit(db, b.id);
    if (held && held.method !== 'pos') await deposits.syncHold(db, held.id).catch((err) => console.warn('[deposit sync]', err.message));
    // Σύνδεσμος εγγύησης που μόλις δημιουργήθηκε (εμφανίζεται μία φορά, με QR).
    let newLink = null;
    const pendingLink = req.session.newDepositLink;
    if (pendingLink && pendingLink.bookingId === b.id) {
      newLink = { url: pendingLink.url, qr: await QRCode.toString(pendingLink.url, { type: 'svg', margin: 1, width: 220 }) };
      delete req.session.newDepositLink;
    }
    const allDeposits = deposits.listForBooking(db, b.id);
    res.render('admin/booking', {
      title: `Κράτηση ${b.reference}`,
      booking: bookings.getById(db, b.id),
      extras: bookings.getExtras(db, b.id),
      events: bookings.getEvents(db, b.id),
      deposits: allDeposits,
      activeDeposit: allDeposits.find((d) => ['awaiting', 'held'].includes(d.status)) || null,
      charges: deposits.chargesForBooking(db, b.id),
      outstandingCents: deposits.outstandingCents(db, b.id),
      refunds: db.prepare('SELECT * FROM refunds WHERE booking_id = ? ORDER BY id DESC').all(b.id),
      checkouts: db.prepare('SELECT * FROM checkouts WHERE booking_id = ? ORDER BY created_at DESC').all(b.id),
      pendingRefundCents: payments.pendingRefundCents(db, b.id),
      onlineProvider: providers.active(),
      chargeCategories: deposits.CATEGORIES,
      newLink,
      today: time.datePart(time.nowLocal()),
    });
  });

  const back = (req) => `/admin/bookings/${req.booking.id}`;

  // Εκτελεί μια ενέργεια και μετατρέπει τα «αναμενόμενα» σφάλματα σε μήνυμα.
  function handle(fn) {
    return async (req, res) => {
      try {
        const message = await fn(req, res);
        if (res.headersSent) return;
        if (message) req.flash('success', message);
      } catch (err) {
        if (!(err instanceof bookings.BookingError)) {
          console.error('[admin]', err);
          req.flash('error', `Σφάλμα: ${err.message}`);
        } else {
          req.flash('error', err.message);
        }
      }
      if (!res.headersSent) res.redirect(303, back(req));
    };
  }

  router.post('/bookings/:id/pickup', loadBooking, (req, res) => {
    const b = req.booking;
    const km = intOrNull(req.body.pickup_km);
    const depositOk = b.deposit_cents === 0 || deposits.heldDeposit(db, b.id) || checkbox(req.body.no_deposit);
    if (b.status !== 'confirmed') req.flash('error', 'Μόνο επιβεβαιωμένες κρατήσεις μπορούν να παραδοθούν.');
    else if (time.minutesBetween(time.nowLocal(), b.pickup_at) > EARLY_PICKUP_HOURS * 60) {
      req.flash('error', `Η παραλαβή είναι προγραμματισμένη για ${format.dateTime(b.pickup_at)}. Παράδοση νωρίτερα από ${EARLY_PICKUP_HOURS} ώρες δεν επιτρέπεται — αλλάξτε πρώτα την κράτηση.`);
    } else if (km === null || km < 0) req.flash('error', 'Συμπληρώστε τα χιλιόμετρα κατά την παράδοση.');
    else if (b.payment_status !== 'paid' && !checkbox(req.body.collected_payment)) {
      req.flash('error', 'Η κράτηση δεν έχει εξοφληθεί. Εισπράξτε το ποσό και επιλέξτε «Εισπράχθηκε η πληρωμή».');
    } else if (!depositOk) {
      req.flash('error', 'Δεν έχει δεσμευτεί εγγύηση. Δεσμεύστε την (POS ή online) ή επιλέξτε ρητά «Παράδοση χωρίς εγγύηση».');
    } else {
      transaction(db, () => {
        if (b.payment_status !== 'paid') {
          db.prepare(`UPDATE bookings SET payment_status = 'paid', paid_cents = total_cents WHERE id = ?`).run(b.id);
          bookings.logEvent(db, b.id, actor(req), 'paid', `Είσπραξη κατά την παραλαβή ${format.money(b.total_cents)}`);
        }
        db.prepare(`UPDATE bookings SET status = 'active', pickup_km = ? WHERE id = ?`).run(km, b.id);
        bookings.logEvent(db, b.id, actor(req), 'picked_up', `Χιλιόμετρα: ${km}${depositOk && !deposits.heldDeposit(db, b.id) && b.deposit_cents > 0 ? ' - ΧΩΡΙΣ εγγύηση' : ''}`);
      });
      req.flash('success', 'Το αυτοκίνητο παραδόθηκε στον πελάτη.');
    }
    res.redirect(303, back(req));
  });

  router.post('/bookings/:id/return', loadBooking, (req, res) => {
    const b = req.booking;
    const km = intOrNull(req.body.return_km);
    if (b.status !== 'active') req.flash('error', 'Μόνο ενεργές ενοικιάσεις μπορούν να ολοκληρωθούν.');
    else if (km === null || km < (b.pickup_km || 0)) req.flash('error', 'Τα χιλιόμετρα επιστροφής δεν μπορεί να είναι λιγότερα από της παράδοσης.');
    else {
      transaction(db, () => {
        db.prepare(`UPDATE bookings SET status = 'completed', return_km = ? WHERE id = ?`).run(km, b.id);
        bookings.logEvent(db, b.id, actor(req), 'returned', `Χιλιόμετρα: ${km} (${km - (b.pickup_km || 0)} km διανύθηκαν)`);
      });
      req.flash(
        'success',
        deposits.heldDeposit(db, b.id)
          ? 'Η ενοικίαση ολοκληρώθηκε. Καταχωρήστε τυχόν χρεώσεις και κλείστε την εγγύηση το συντομότερο.'
          : 'Η ενοικίαση ολοκληρώθηκε.',
      );
    }
    res.redirect(303, back(req));
  });

  router.post('/bookings/:id/mark-paid', loadBooking, (req, res) => {
    const b = req.booking;
    if (b.payment_status !== 'unpaid' || !['confirmed', 'active', 'completed'].includes(b.status)) {
      req.flash('error', 'Η κράτηση δεν μπορεί να σημειωθεί ως πληρωμένη.');
    } else {
      transaction(db, () => {
        db.prepare(`UPDATE bookings SET payment_status = 'paid', paid_cents = total_cents WHERE id = ?`).run(b.id);
        bookings.logEvent(db, b.id, actor(req), 'paid', `Είσπραξη ${format.money(b.total_cents)}`);
      });
      req.flash('success', 'Η πληρωμή καταχωρήθηκε.');
    }
    res.redirect(303, back(req));
  });

  function moneyField(value) {
    if (!str(value)) return null;
    const cents = format.parseMoneyToCents(value);
    if (cents === null) throw new bookings.BookingError('Μη έγκυρο ποσό.');
    return cents;
  }

  router.post(
    '/bookings/:id/cancel',
    loadBooking,
    handle(async (req) => {
      const result = await payments.cancelBooking(db, req.booking.id, {
        actor: actor(req),
        reason: str(req.body.reason, 300) || 'Ακύρωση από το γραφείο',
        refund: checkbox(req.body.refund),
        refundCents: moneyField(req.body.refund_amount),
        allowExpiredPaid: true,
      });
      let msg = 'Η κράτηση ακυρώθηκε και ο πελάτης ενημερώθηκε με email.';
      if (result.refundedCents) msg += ` Επιστράφηκαν ${format.money(result.refundedCents)}.`;
      if (result.refundPendingCents) msg += ` Η επιστροφή ${format.money(result.refundPendingCents)} δεν ολοκληρώθηκε ακόμη και θα ξαναδοκιμαστεί αυτόματα.`;
      if (result.refundDueCents) msg += ` Οφείλεται επιστροφή ${format.money(result.refundDueCents)} εκτός συστήματος — καταχωρήστε την όταν γίνει.`;
      return msg;
    }),
  );

  router.post(
    '/bookings/:id/refund',
    loadBooking,
    handle(async (req) => {
      const amount = moneyField(req.body.amount);
      const reason = str(req.body.reason, 300);
      if (!reason) throw new bookings.BookingError('Συμπληρώστε την αιτία της επιστροφής.');
      const { done } = await payments.refundBookingAmount(db, req.booking.id, amount, { actor: actor(req), reason });
      return done ? `Επιστράφηκαν ${format.money(amount)} στην κάρτα του πελάτη.` : 'Η επιστροφή καταχωρήθηκε αλλά ο πάροχος δεν την ολοκλήρωσε ακόμη· θα ξαναδοκιμαστεί αυτόματα.';
    }),
  );

  router.post(
    '/bookings/:id/refund-manual',
    loadBooking,
    handle(async (req) => {
      const amount = moneyField(req.body.amount);
      payments.recordManualRefund(db, req.booking.id, amount, { actor: actor(req), note: str(req.body.note, 300) });
      return `Καταχωρήθηκε επιστροφή ${format.money(amount)} εκτός συστήματος.`;
    }),
  );

  router.post(
    '/bookings/:id/refunds/:refundId/retry',
    loadBooking,
    handle(async (req) => {
      const id = intOrNull(req.params.refundId) ?? -1;
      db.prepare(`UPDATE refunds SET status = 'pending' WHERE id = ? AND booking_id = ? AND status = 'failed'`).run(id, req.booking.id);
      const ok = await payments.processRefund(db, id);
      return ok ? 'Η επιστροφή ολοκληρώθηκε.' : 'Η επιστροφή απέτυχε ξανά — δείτε το μήνυμα σφάλματος.';
    }),
  );

  router.post('/bookings/:id/notes', loadBooking, (req, res) => {
    db.prepare('UPDATE bookings SET admin_notes = ? WHERE id = ?').run(str(req.body.admin_notes, 4000) || null, req.booking.id);
    req.flash('success', 'Οι σημειώσεις αποθηκεύτηκαν.');
    res.redirect(303, back(req));
  });

  router.post('/bookings/:id/resend', loadBooking, (req, res) => {
    const b = req.booking;
    if (!['confirmed', 'active'].includes(b.status)) req.flash('error', 'Μόνο για επιβεβαιωμένες κρατήσεις.');
    else {
      mailer.sendInBackground({
        to: b.email,
        subject: `Επιβεβαίωση κράτησης ${b.reference}`,
        template: 'booking-confirmed',
        data: { booking: b, extras: bookings.getExtras(db, b.id) },
      });
      req.flash('success', 'Το email επιβεβαίωσης στάλθηκε ξανά.');
    }
    res.redirect(303, back(req));
  });

  // ---------------- Εγγύηση ----------------
  router.post(
    '/bookings/:id/deposit/pos',
    loadBooking,
    handle(async (req) => {
      deposits.recordPosHold(db, req.booking.id, {
        amountCents: moneyField(req.body.amount),
        approvalCode: str(req.body.approval_code, 40),
        last4: str(req.body.last4, 4),
        creditConfirmed: checkbox(req.body.credit_confirmed),
        actor: actor(req),
      });
      return 'Η εγγύηση μέσω POS καταχωρήθηκε.';
    }),
  );

  router.post(
    '/bookings/:id/deposit/link',
    loadBooking,
    handle(async (req) => {
      const link = await deposits.createOnlineLink(db, req.booking.id, {
        amountCents: moneyField(req.body.amount),
        actor: actor(req),
        sendEmail: checkbox(req.body.send_email),
      });
      req.session.newDepositLink = { bookingId: req.booking.id, url: link.url };
      return checkbox(req.body.send_email)
        ? 'Ο σύνδεσμος εγγύησης δημιουργήθηκε και στάλθηκε στον πελάτη.'
        : 'Ο σύνδεσμος εγγύησης δημιουργήθηκε. Δείξτε στον πελάτη το QR code.';
    }),
  );

  router.post(
    '/bookings/:id/deposit/:depositId/settle',
    loadBooking,
    handle(async (req) => {
      const dep = deposits.getDeposit(db, intOrNull(req.params.depositId) ?? -1);
      if (!dep || dep.booking_id !== req.booking.id) throw new bookings.BookingError('Η εγγύηση δεν βρέθηκε.');
      const r = await deposits.settleDeposit(db, dep.id, {
        actor: actor(req),
        force: checkbox(req.body.force),
        posConfirmed: checkbox(req.body.pos_confirmed),
      });
      let msg = r.capturedCents
        ? `Παρακρατήθηκαν ${format.money(r.capturedCents)} και αποδεσμεύτηκαν ${format.money(r.releasedCents)}.`
        : `Η εγγύηση αποδεσμεύτηκε (${format.money(r.releasedCents)}).`;
      if (r.outstandingCents) msg += ` Εκκρεμούν χρεώσεις ${format.money(r.outstandingCents)} που πρέπει να εισπραχθούν χωριστά.`;
      return msg;
    }),
  );

  router.post(
    '/bookings/:id/deposit/:depositId/release',
    loadBooking,
    handle(async (req) => {
      const dep = deposits.getDeposit(db, intOrNull(req.params.depositId) ?? -1);
      if (!dep || dep.booking_id !== req.booking.id) throw new bookings.BookingError('Η εγγύηση δεν βρέθηκε.');
      if (dep.status === 'held' && deposits.outstandingCents(db, req.booking.id) > 0) {
        throw new bookings.BookingError('Υπάρχουν αποδεκτές χρεώσεις: χρησιμοποιήστε «Εκκαθάριση εγγύησης».');
      }
      await deposits.releaseDeposit(db, dep.id, { actor: actor(req), reason: str(req.body.reason, 200) || 'Αποδέσμευση από το γραφείο' });
      return dep.method === 'pos' && dep.status === 'held'
        ? 'Καταχωρήθηκε η αποδέσμευση. Ακυρώστε την προέγκριση και στο τερματικό POS.'
        : 'Η εγγύηση αποδεσμεύτηκε.';
    }),
  );

  // ---------------- Χρεώσεις μετά την επιστροφή ----------------
  router.post(
    '/bookings/:id/charges',
    loadBooking,
    handle(async (req) => {
      const charge = deposits.addCharge(db, req.booking.id, {
        category: str(req.body.category, 20),
        description: str(req.body.description, 300),
        amountCents: moneyField(req.body.amount),
        evidence: str(req.body.evidence, 2000),
        customerConsent: str(req.body.customer_consent, 300),
        actor: actor(req),
      });
      return charge.status === 'proposed'
        ? `Η χρέωση ζημιάς στάλθηκε στον πελάτη για αποδοχή (προθεσμία ${format.date(charge.respond_by)}).`
        : 'Η χρέωση καταχωρήθηκε.';
    }),
  );

  router.post(
    '/bookings/:id/charges/:chargeId/:action',
    loadBooking,
    handle(async (req) => {
      const action = { accept: 'accept', withdraw: 'withdraw', 'mark-paid': 'mark_paid' }[req.params.action];
      if (!action) throw new bookings.BookingError('Άγνωστη ενέργεια.');
      deposits.adminChargeAction(db, req.booking.id, intOrNull(req.params.chargeId) ?? -1, action, {
        consentNote: str(req.body.consent_note, 300),
        method: str(req.body.method, 10),
        actor: actor(req),
      });
      return 'Η χρέωση ενημερώθηκε.';
    }),
  );

  // ---------------- Στόλος ----------------
  router.get('/cars', (req, res) => {
    const cars = db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM bookings b WHERE b.car_id = c.id AND b.status IN ('confirmed','active')) AS open_bookings
         FROM cars c ORDER BY c.active DESC, c.category, c.make, c.model`,
      )
      .all();
    res.render('admin/cars', { title: 'Στόλος', cars });
  });

  function carForm(res, { car, values, errors = {}, status = 200 }) {
    let upcoming = [];
    let blocks = [];
    if (car) {
      upcoming = db
        .prepare(
          `SELECT * FROM bookings WHERE car_id = :car_id AND ${BLOCKING_SQL} AND ${EFFECTIVE_RETURN_SQL} >= :today ORDER BY pickup_at`,
        )
        .all({ car_id: car.id, today: time.datePart(time.nowLocal()), ...blockingParams() });
      blocks = db.prepare('SELECT * FROM car_blocks WHERE car_id = ? ORDER BY start_at DESC').all(car.id);
    }
    res.status(status).render('admin/car-form', {
      title: car ? `${car.make} ${car.model}` : 'Νέο αυτοκίνητο',
      car,
      values,
      errors,
      upcoming,
      blocks,
      categories: CATEGORIES,
      transmissions: TRANSMISSIONS,
      fuels: FUELS,
    });
  }

  function carValues(body) {
    return {
      make: str(body.make, 60),
      model: str(body.model, 60),
      year: str(body.year, 4),
      plate: normalizePlate(str(body.plate, 20)),
      category: str(body.category, 20),
      transmission: str(body.transmission, 20),
      fuel: str(body.fuel, 20),
      seats: str(body.seats, 2),
      doors: str(body.doors, 1),
      luggage: str(body.luggage, 2),
      air_conditioning: checkbox(body.air_conditioning),
      daily_rate: str(body.daily_rate, 10),
      deposit: str(body.deposit, 10),
      min_driver_age: str(body.min_driver_age, 2),
      mileage_policy: str(body.mileage_policy, 120),
      description: str(body.description, 2000),
      active: checkbox(body.active),
    };
  }

  function validateCar(v, carId = null) {
    const e = {};
    const out = {};
    if (!v.make) e.make = 'Υποχρεωτικό.';
    if (!v.model) e.model = 'Υποχρεωτικό.';
    out.year = intOrNull(v.year);
    if (!(out.year >= 1990 && out.year <= new Date().getFullYear() + 1)) e.year = 'Μη έγκυρο έτος.';
    if (!/^[A-ZΑ-Ω0-9]{3,12}$/.test(v.plate)) e.plate = 'Μη έγκυρη πινακίδα.';
    else if (db.prepare('SELECT 1 FROM cars WHERE plate = ? AND id != ?').get(v.plate, carId ?? -1)) {
      e.plate = 'Υπάρχει ήδη αυτοκίνητο με αυτή την πινακίδα.';
    }
    if (!CATEGORIES.includes(v.category)) e.category = 'Επιλέξτε κατηγορία.';
    if (!TRANSMISSIONS.includes(v.transmission)) e.transmission = 'Επιλέξτε κιβώτιο.';
    if (!FUELS.includes(v.fuel)) e.fuel = 'Επιλέξτε καύσιμο.';
    out.seats = intOrNull(v.seats);
    if (!(out.seats >= 1 && out.seats <= 9)) e.seats = '1 έως 9.';
    out.doors = intOrNull(v.doors);
    if (!(out.doors >= 2 && out.doors <= 5)) e.doors = '2 έως 5.';
    out.luggage = intOrNull(v.luggage);
    if (!(out.luggage >= 0 && out.luggage <= 10)) e.luggage = '0 έως 10.';
    out.daily_rate_cents = format.parseMoneyToCents(v.daily_rate);
    if (!(out.daily_rate_cents > 0)) e.daily_rate = 'Συμπληρώστε τιμή (π.χ. 35.00).';
    out.deposit_cents = v.deposit === '' ? 0 : format.parseMoneyToCents(v.deposit);
    if (out.deposit_cents === null) e.deposit = 'Μη έγκυρο ποσό.';
    out.min_driver_age = intOrNull(v.min_driver_age);
    if (!(out.min_driver_age >= 18 && out.min_driver_age <= 30)) e.min_driver_age = '18 έως 30.';
    return { errors: e, parsed: out };
  }

  function saveCar(req, carId) {
    const v = carValues(req.body);
    const { errors, parsed } = validateCar(v, carId);
    if (Object.keys(errors).length) return { values: v, errors };
    const row = {
      make: v.make,
      model: v.model,
      year: parsed.year,
      plate: v.plate,
      category: v.category,
      transmission: v.transmission,
      fuel: v.fuel,
      seats: parsed.seats,
      doors: parsed.doors,
      luggage: parsed.luggage,
      air_conditioning: v.air_conditioning ? 1 : 0,
      daily_rate_cents: parsed.daily_rate_cents,
      deposit_cents: parsed.deposit_cents,
      min_driver_age: parsed.min_driver_age,
      mileage_policy: v.mileage_policy || 'Απεριόριστα χιλιόμετρα',
      description: v.description,
      active: v.active ? 1 : 0,
    };
    const cols = Object.keys(row);
    if (carId) {
      const old = db.prepare('SELECT image FROM cars WHERE id = ?').get(carId);
      if (req.file) row.image = `/uploads/${req.file.filename}`;
      else if (!old.image || old.image.startsWith('/img/cars/')) row.image = `/img/cars/${v.category}.svg`;
      db.prepare(`UPDATE cars SET ${Object.keys(row).map((c) => `${c} = :${c}`).join(', ')} WHERE id = :id`).run({ ...row, id: carId });
      if (req.file && old.image && old.image.startsWith('/uploads/')) {
        fs.rm(path.join(uploadDir, path.basename(old.image)), { force: true }, () => {});
      }
      return { id: carId };
    }
    row.image = req.file ? `/uploads/${req.file.filename}` : `/img/cars/${v.category}.svg`;
    cols.push('image');
    const res = db.prepare(`INSERT INTO cars (${cols.join(', ')}) VALUES (${cols.map((c) => `:${c}`).join(', ')})`).run(row);
    return { id: Number(res.lastInsertRowid) };
  }

  router.get('/cars/new', (req, res) => {
    carForm(res, {
      car: null,
      values: { seats: '5', doors: '5', luggage: '2', air_conditioning: true, min_driver_age: '21', deposit: '300.00', active: true, year: String(new Date().getFullYear()) },
    });
  });

  router.post('/cars', withImage, (req, res) => {
    const result = saveCar(req, null);
    if (result.errors) {
      removeUpload(req.file);
      return carForm(res, { car: null, values: result.values, errors: result.errors, status: 422 });
    }
    req.flash('success', 'Το αυτοκίνητο προστέθηκε.');
    res.redirect(303, `/admin/cars/${result.id}`);
  });

  function loadCar(req, res, next) {
    const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(idParam(req));
    if (!car) return next('route');
    req.car = car;
    next();
  }

  function carToValues(car) {
    return {
      ...car,
      year: String(car.year),
      seats: String(car.seats),
      doors: String(car.doors),
      luggage: String(car.luggage),
      daily_rate: format.centsToInput(car.daily_rate_cents),
      deposit: format.centsToInput(car.deposit_cents),
      min_driver_age: String(car.min_driver_age),
      air_conditioning: Boolean(car.air_conditioning),
      active: Boolean(car.active),
    };
  }

  router.get('/cars/:id', loadCar, (req, res) => carForm(res, { car: req.car, values: carToValues(req.car) }));

  router.post('/cars/:id', withImage, loadCar, (req, res) => {
    const result = saveCar(req, req.car.id);
    if (result.errors) {
      removeUpload(req.file);
      return carForm(res, { car: req.car, values: result.values, errors: result.errors, status: 422 });
    }
    req.flash('success', 'Οι αλλαγές αποθηκεύτηκαν.');
    res.redirect(303, `/admin/cars/${req.car.id}`);
  });

  router.post('/cars/:id/blocks', loadCar, (req, res) => {
    const start = str(req.body.start_at, 16);
    const end = str(req.body.end_at, 16);
    const reason = str(req.body.reason, 200);
    if (!time.isValidLocal(start) || !time.isValidLocal(end) || end <= start) {
      req.flash('error', 'Συμπληρώστε έγκυρο διάστημα (η λήξη μετά την έναρξη).');
      return res.redirect(303, `/admin/cars/${req.car.id}`);
    }
    const clashes = db
      .prepare(
        `SELECT reference FROM bookings WHERE car_id = :car_id AND ${BLOCKING_SQL} AND ${OVERLAP_SQL}`,
      )
      .all({ car_id: req.car.id, start, end, ...blockingParams() });
    if (clashes.length) {
      req.flash('error', `Υπάρχουν κρατήσεις σε αυτό το διάστημα: ${clashes.map((c) => c.reference).join(', ')}. Μεταφέρετε ή ακυρώστε τις πρώτα.`);
    } else {
      db.prepare('INSERT INTO car_blocks (car_id, start_at, end_at, reason) VALUES (?, ?, ?, ?)').run(req.car.id, start, end, reason);
      req.flash('success', 'Το αυτοκίνητο δεσμεύτηκε για το διάστημα αυτό.');
    }
    res.redirect(303, `/admin/cars/${req.car.id}`);
  });

  router.post('/cars/:id/blocks/:blockId/delete', loadCar, (req, res) => {
    db.prepare('DELETE FROM car_blocks WHERE id = ? AND car_id = ?').run(intOrNull(req.params.blockId) ?? -1, req.car.id);
    req.flash('success', 'Η δέσμευση αφαιρέθηκε.');
    res.redirect(303, `/admin/cars/${req.car.id}`);
  });

  // ---------------- Απλές λίστες ρυθμίσεων (σημεία, πρόσθετα, εποχές) ----------------
  function simpleCrud({ name, table, title, view, parse, order }) {
    router.get(`/${name}`, (req, res) => {
      res.render(view, { title, rows: db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all(), errors: {}, values: {} });
    });

    function persist(req, res, id) {
      const { values, errors, row } = parse(req.body);
      if (Object.keys(errors).length) {
        req.flash('error', Object.values(errors).join(' '));
        return res.redirect(303, `/admin/${name}`);
      }
      const cols = Object.keys(row);
      if (id) {
        db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = :${c}`).join(', ')} WHERE id = :id`).run({ ...row, id });
      } else {
        db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => `:${c}`).join(', ')})`).run(row);
      }
      req.flash('success', `Αποθηκεύτηκε: ${values.name}`);
      return res.redirect(303, `/admin/${name}`);
    }

    router.post(`/${name}`, (req, res) => persist(req, res, null));
    router.post(`/${name}/:id`, (req, res, next) => {
      if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(idParam(req))) return next('route');
      return persist(req, res, idParam(req));
    });
  }

  simpleCrud({
    name: 'locations',
    table: 'locations',
    title: 'Σημεία παραλαβής/επιστροφής',
    view: 'admin/locations',
    order: 'sort_order, name',
    parse(body) {
      const values = { name: str(body.name, 100), address: str(body.address, 200), fee: str(body.fee, 10), sort_order: str(body.sort_order, 4) };
      const errors = {};
      if (!values.name) errors.name = 'Το όνομα είναι υποχρεωτικό.';
      const fee = values.fee === '' ? 0 : format.parseMoneyToCents(values.fee);
      if (fee === null) errors.fee = 'Μη έγκυρη χρέωση.';
      return {
        values,
        errors,
        row: { name: values.name, address: values.address, fee_cents: fee ?? 0, sort_order: intOrNull(values.sort_order) ?? 0, active: checkbox(body.active) ? 1 : 0 },
      };
    },
  });

  simpleCrud({
    name: 'extras',
    table: 'extras',
    title: 'Πρόσθετα',
    view: 'admin/extras',
    order: 'sort_order, name',
    parse(body) {
      const values = { name: str(body.name, 100), description: str(body.description, 300), price: str(body.price, 10) };
      const errors = {};
      if (!values.name) errors.name = 'Το όνομα είναι υποχρεωτικό.';
      const price = format.parseMoneyToCents(values.price);
      if (price === null) errors.price = 'Μη έγκυρη τιμή.';
      const pricing = ['per_day', 'per_rental'].includes(body.pricing) ? body.pricing : null;
      if (!pricing) errors.pricing = 'Επιλέξτε τρόπο χρέωσης.';
      const maxQty = intOrNull(body.max_qty);
      if (!(maxQty >= 1 && maxQty <= 10)) errors.max_qty = 'Μέγιστη ποσότητα 1 έως 10.';
      return {
        values,
        errors,
        row: {
          name: values.name,
          description: values.description,
          price_cents: price ?? 0,
          pricing: pricing ?? 'per_day',
          max_qty: maxQty ?? 1,
          sort_order: intOrNull(body.sort_order) ?? 0,
          active: checkbox(body.active) ? 1 : 0,
        },
      };
    },
  });

  simpleCrud({
    name: 'seasons',
    table: 'seasons',
    title: 'Εποχικές τιμές',
    view: 'admin/seasons',
    order: 'start_md',
    parse(body) {
      const values = { name: str(body.name, 100), start_md: str(body.start_md, 5), end_md: str(body.end_md, 5), percent: str(body.percent, 4) };
      const errors = {};
      if (!values.name) errors.name = 'Το όνομα είναι υποχρεωτικό.';
      if (!MD_RE.test(values.start_md) || !MD_RE.test(values.end_md)) errors.dates = 'Οι ημερομηνίες γράφονται ως ΜΜ-ΗΗ (π.χ. 07-01).';
      const percent = intOrNull(values.percent);
      if (!(percent >= 10 && percent <= 500)) errors.percent = 'Το ποσοστό πρέπει να είναι 10 έως 500.';
      return { values, errors, row: { name: values.name, start_md: values.start_md, end_md: values.end_md, percent: percent ?? 100 } };
    },
  });

  router.post('/seasons/:id/delete', (req, res) => {
    db.prepare('DELETE FROM seasons WHERE id = ?').run(idParam(req));
    req.flash('success', 'Η περίοδος διαγράφηκε.');
    res.redirect(303, '/admin/seasons');
  });

  // ---------------- Χρήστες ----------------
  router.get('/users', (req, res) => {
    const q = str(req.query.q, 100);
    const rows = db
      .prepare(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role, u.created_at,
           (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id) AS booking_count
         FROM users u WHERE (:q = '' OR norm(u.email) LIKE :like OR norm(u.last_name) LIKE :like
           OR norm(u.first_name || ' ' || u.last_name) LIKE :like)
         ORDER BY u.created_at DESC LIMIT 200`,
      )
      .all({ q, like: `%${normalizeText(q.replace(/[%_]/g, ''))}%` });
    res.render('admin/users', { title: 'Χρήστες', rows, q });
  });

  router.post('/users/:id/role', (req, res) => {
    const id = idParam(req);
    const role = req.body.role === 'admin' ? 'admin' : 'customer';
    if (id === req.user.id) req.flash('error', 'Δεν μπορείτε να αλλάξετε τον δικό σας ρόλο.');
    else {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
      // Αποσύνδεση του χρήστη ώστε ο νέος ρόλος να ισχύσει αμέσως.
      db.prepare(`DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?`).run(id);
      req.flash('success', 'Ο ρόλος άλλαξε.');
    }
    res.redirect(303, '/admin/users');
  });

  // ---------------- Μηνύματα ----------------
  router.get('/messages', (req, res) => {
    const rows = db.prepare('SELECT * FROM messages ORDER BY handled, created_at DESC LIMIT 200').all();
    res.render('admin/messages', { title: 'Μηνύματα', rows });
  });

  router.post('/messages/:id/handled', (req, res) => {
    db.prepare('UPDATE messages SET handled = 1 - handled WHERE id = ?').run(idParam(req));
    res.redirect(303, '/admin/messages');
  });

  return router;
};
