// Μικρές βελτιώσεις στον browser. Η ιστοσελίδα λειτουργεί πλήρως και χωρίς JavaScript.
(function () {
  'use strict';

  // Επιβεβαίωση πριν από σημαντικές ενέργειες (ακύρωση, διαγραφή).
  document.addEventListener('submit', function (event) {
    var form = event.target;
    var message = form.getAttribute('data-confirm');
    if (message && !window.confirm(message)) {
      event.preventDefault();
      return;
    }
    // Αποτροπή διπλής υποβολής.
    if (!event.defaultPrevented) {
      var buttons = form.querySelectorAll('button[type="submit"]');
      setTimeout(function () {
        buttons.forEach(function (b) { b.disabled = true; });
      }, 0);
    }
  });

  // Σε επιστροφή με το κουμπί «πίσω» του browser ξαναενεργοποιούμε τα κουμπιά.
  window.addEventListener('pageshow', function () {
    document.querySelectorAll('button[disabled]').forEach(function (b) { b.disabled = false; });
  });

  document.querySelectorAll('[data-print]').forEach(function (btn) {
    btn.addEventListener('click', function () { window.print(); });
  });

  // Φόρμα αναζήτησης: η επιστροφή δεν μπορεί να είναι πριν την παραλαβή.
  document.querySelectorAll('[data-search-form]').forEach(function (form) {
    var pickup = form.querySelector('[name="pickup_date"]');
    var ret = form.querySelector('[name="return_date"]');
    if (!pickup || !ret) return;
    var today = new Date();
    var iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    pickup.min = iso;
    function sync() {
      if (pickup.value) {
        ret.min = pickup.value;
        if (ret.value && ret.value < pickup.value) ret.value = pickup.value;
      }
    }
    pickup.addEventListener('change', sync);
    sync();
  });

  // Ζωντανή ενημέρωση τιμής όταν αλλάζουν τα πρόσθετα.
  var bookingForm = document.querySelector('[data-booking-form]');
  if (bookingForm) {
    var quote = bookingForm.querySelector('[data-quote]');
    var submit = bookingForm.querySelector('[data-submit]');
    var pending = null;

    function refreshQuote() {
      var params = new URLSearchParams();
      new FormData(bookingForm).forEach(function (value, key) {
        if (key === 'car_id' || key.indexOf('pickup_') === 0 || key.indexOf('return_') === 0 || key.indexOf('extra_') === 0) {
          params.append(key, value);
        }
      });
      if (pending) pending.abort();
      pending = new AbortController();
      // Ίδια γλώσσα με τη σελίδα (/en, /es ή χωρίς πρόθεμα για τα ελληνικά), ώστε τα ποσά να έρχονται στη σωστή μορφή.
      var prefix = document.documentElement.getAttribute('data-lang-prefix') || '';
      fetch(prefix + '/api/quote?' + params.toString(), { signal: pending.signal, headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !quote) return;
          ['days', 'base', 'extras', 'total', 'vat', 'discountPercent', 'excess'].forEach(function (key) {
            var el = quote.querySelector('[data-q="' + key + '"]');
            if (el) el.textContent = data[key];
          });
          // Η απαλλαγή της βασικής κάλυψης (CDW) δεν αλλάζει· με την FDW εμφανίζεται η σημείωση «0 €».
          var fdwRow = document.querySelector('[data-q-row="fdw"]');
          if (fdwRow) fdwRow.classList.toggle('hidden', !data.hasWaiver);
          var discount = quote.querySelector('[data-q="discount"]');
          if (discount && data.discount) discount.textContent = data.discount;
          var extrasRow = quote.querySelector('[data-q-row="extras"]');
          if (extrasRow) extrasRow.classList.toggle('hidden', !data.extrasCents);
          var discountRow = quote.querySelector('[data-q-row="discount"]');
          if (discountRow) discountRow.classList.toggle('hidden', !data.discountCents);
        })
        .catch(function () { /* η τελική τιμή υπολογίζεται ξανά στον server */ });
    }

    bookingForm.querySelectorAll('[data-extra]').forEach(function (el) {
      el.addEventListener('change', refreshQuote);
    });

    // Το κουμπί γράφει ΠΑΝΤΑ «Κράτηση με υποχρέωση πληρωμής» (νόμος, σε κάθε γλώσσα)· αλλάζει μόνο η σημείωση.
    // Τα κείμενα έρχονται από τη σελίδα (data-hint-*), ήδη μεταφρασμένα.
    var hint = bookingForm.querySelector('[data-submit-hint]');
    bookingForm.querySelectorAll('[name="payment_method"]').forEach(function (el) {
      el.addEventListener('change', function () {
        if (hint && el.checked) hint.textContent = el.value === 'card' ? hint.getAttribute('data-hint-card') : hint.getAttribute('data-hint-pickup');
      });
    });

    // Στοιχεία παιδιού: εμφανίζονται όταν επιλέγεται παιδικό κάθισμα.
    var childField = bookingForm.querySelector('[data-child-info]');
    function syncChild() {
      if (!childField) return;
      var any = false;
      bookingForm.querySelectorAll('[data-kind="child_seat"]').forEach(function (el) {
        if ((el.type === 'checkbox' && el.checked) || (el.tagName === 'SELECT' && Number(el.value) > 0)) any = true;
      });
      childField.classList.toggle('hidden', !any);
    }
    bookingForm.querySelectorAll('[data-kind="child_seat"]').forEach(function (el) { el.addEventListener('change', syncChild); });
    syncChild();

    var firstError = document.querySelector('.error');
    if (firstError) {
      var field = firstError.closest('.field, section');
      if (field) field.scrollIntoView({ block: 'center' });
    }
  }
})();

// Φίλτρα αποτελεσμάτων: στο κινητό κλειστά (ανοίγουν με πάτημα), και εφαρμόζονται αμέσως μόλις αλλάξουν.
(function () {
  var mobile = window.matchMedia('(max-width: 900px)');
  var boxes = document.querySelectorAll('details[data-mobile-collapsed]');
  function layout() {
    boxes.forEach(function (box) {
      // Σε μεγάλη οθόνη πάντα ανοιχτά (π.χ. tablet που γύρισε οριζόντια). Στο κινητό: όπως τα άφησε ο χρήστης,
      // αρχικά κλειστά, εκτός αν η αναζήτηση έχει σφάλμα που πρέπει να διορθωθεί.
      var open = !mobile.matches || box.getAttribute('data-user-open') === '1' || Boolean(box.querySelector('.error'));
      var summary = box.querySelector('summary');
      // Η εστίαση δεν «χάνεται» σε πεδίο που κρύβεται: πηγαίνει στον τίτλο που το ξανανοίγει.
      if (!open && box.open && box.contains(document.activeElement) && summary) summary.focus();
      box.open = open;
      // Σε μεγάλη οθόνη ο τίτλος δεν είναι κουμπί (δεν κλείνει τα φίλτρα).
      if (summary) summary.tabIndex = mobile.matches ? 0 : -1;
    });
  }
  boxes.forEach(function (box) {
    box.addEventListener('toggle', function () {
      if (mobile.matches) box.setAttribute('data-user-open', box.open ? '1' : '0');
    });
    var summary = box.querySelector('summary');
    if (summary) {
      summary.addEventListener('click', function (event) { if (!mobile.matches) event.preventDefault(); });
    }
  });
  layout();
  if (mobile.addEventListener) mobile.addEventListener('change', layout);
  else if (mobile.addListener) mobile.addListener(layout);

  document.querySelectorAll('form[data-autosubmit]').forEach(function (form) {
    form.querySelectorAll('select').forEach(function (select) {
      // Μόνο μετά από επιλογή με ποντίκι/αφή: με τα βέλη του πληκτρολογίου η σελίδα δεν ξαναφορτώνει
      // σε κάθε βήμα (ο χρήστης πατά «Εφαρμογή»).
      var pointer = false;
      select.addEventListener('pointerdown', function () { pointer = true; });
      select.addEventListener('keydown', function () { pointer = false; });
      select.addEventListener('change', function () { if (pointer) form.submit(); });
    });
  });
})();
