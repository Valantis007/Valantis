// Ημερομηνίες χωρίς το «μπλε» πεδίο ημερομηνίας του browser.
//
//  - Αναζήτηση (παραλαβή/επιστροφή): ημερολόγιο με επιλογή διαστήματος, όπως στις μεγάλες
//    εταιρείες ενοικίασης. Οι φόρμες με [data-search-form] και πεδία pickup_date / return_date.
//  - Ημερομηνία γέννησης / έκδοσης διπλώματος ([data-dmy]): απλό πεδίο ΗΗ/ΜΜ/ΕΕΕΕ με αυτόματες
//    καθέτους· στον server στέλνεται ΕΕΕΕ-ΜΜ-ΗΗ όπως πριν.
//
// Χωρίς JavaScript μένουν τα κανονικά πεδία ημερομηνίας και όλα λειτουργούν.
(function () {
  'use strict';

  var lang = document.documentElement.getAttribute('lang') || 'el';
  var intl = { el: 'el-GR', en: 'en-GB', es: 'es-ES' }[lang] || 'el-GR';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseIso(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getMonth() === Number(m[2]) - 1 ? d : null;
  }
  function addDays(d, n) { var r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); r.setDate(r.getDate() + n); return r; }
  function sameDay(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function daysBetween(a, b) { return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5); }
  function fill(text, n) { return String(text || '').replace('{n}', n); }

  // Χωρίς έτος όταν είναι το τρέχον (χωράει στο πεδίο)· με έτος για τον επόμενο χρόνο.
  var fmtShort = new Intl.DateTimeFormat(intl, { weekday: 'short', day: 'numeric', month: 'short' });
  var fmtShortYear = new Intl.DateTimeFormat(intl, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  function shortDate(d) { return (d.getFullYear() === new Date().getFullYear() ? fmtShort : fmtShortYear).format(d); }
  var fmtMonth = new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric' });
  var fmtLong = new Intl.DateTimeFormat(intl, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var fmtWeekday = new Intl.DateTimeFormat(intl, { weekday: 'short' });

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // ------------------------------------------------------------------ Ημερολόγιο διαστήματος
  function initRange(form) {
    var start = form.querySelector('input[name="pickup_date"]');
    var end = form.querySelector('input[name="return_date"]');
    if (!start || !end || start.type !== 'date') return;
    var texts = {};
    try { texts = JSON.parse(form.getAttribute('data-calendar') || '{}'); } catch (e) { texts = {}; }

    var today = new Date();
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var maxDays = Number(form.getAttribute('data-max-advance-days')) || 365;
    var minDate = today;
    var maxDate = addDays(today, maxDays);

    var state = { start: parseIso(start.value), end: parseIso(end.value), picking: 'start', view: null };

    // Ημέρες ενοικίασης όπως στην τιμή: 24ωρα από την ώρα παραλαβής, με την ανοχή καθυστέρησης
    // (π.χ. παραλαβή 10:00 και επιστροφή 12:00 τρεις ημέρες μετά = 4 ημέρες).
    var grace = Number(form.getAttribute('data-grace-minutes')) || 0;
    function minutesOf(name) {
      var select = form.querySelector('[name="' + name + '"]');
      var m = /^(\d{1,2}):(\d{2})/.exec(select ? select.value : '');
      return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
    }
    function rentalDays() {
      var minutes = daysBetween(state.start, state.end) * 1440 + minutesOf('return_time') - minutesOf('pickup_time');
      return Math.max(1, Math.ceil((minutes - grace) / 1440));
    }

    function makeDisplay(input, label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'date-display';
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.setAttribute('aria-expanded', 'false');
      if (input.id) {
        // Η ετικέτα της φόρμας (label for=...) δείχνει πλέον στο κουμπί.
        btn.id = input.id;
        input.removeAttribute('id');
      }
      btn.setAttribute('data-label', label);
      input.type = 'hidden';
      input.parentNode.insertBefore(btn, input);
      return btn;
    }

    var startBtn = makeDisplay(start, texts.pickup || '');
    var endBtn = makeDisplay(end, texts.return || '');

    var pop = document.createElement('div');
    pop.className = 'calendar-pop hidden';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', texts.calendar || '');
    form.appendChild(pop);
    form.classList.add('has-calendar');

    function render() {
      startBtn.innerHTML = '';
      endBtn.innerHTML = '';
      [[startBtn, state.start, texts.choosePickup], [endBtn, state.end, texts.chooseReturn]].forEach(function (x) {
        var span = document.createElement('span');
        span.textContent = x[1] ? capitalize(shortDate(x[1])) : x[2] || '';
        if (!x[1]) span.className = 'placeholder';
        x[0].appendChild(span);
      });
      start.value = state.start ? iso(state.start) : '';
      end.value = state.end ? iso(state.end) : '';
    }

    function monthGrid(year, month) {
      var wrap = document.createElement('div');
      wrap.className = 'cal-month';
      var title = document.createElement('div');
      title.className = 'cal-title';
      title.textContent = capitalize(fmtMonth.format(new Date(year, month, 1)));
      wrap.appendChild(title);
      var grid = document.createElement('div');
      grid.className = 'cal-grid';
      grid.setAttribute('role', 'grid');
      // Η εβδομάδα ξεκινά Δευτέρα (Ελλάδα, Ισπανία, Ηνωμένο Βασίλειο).
      for (var w = 0; w < 7; w += 1) {
        var wd = document.createElement('span');
        wd.className = 'cal-wd';
        wd.setAttribute('aria-hidden', 'true');
        wd.textContent = fmtWeekday.format(new Date(2024, 0, 1 + w)).replace('.', '');
        grid.appendChild(wd);
      }
      var first = new Date(year, month, 1);
      var offset = (first.getDay() + 6) % 7;
      for (var i = 0; i < offset; i += 1) grid.appendChild(document.createElement('span'));
      var days = new Date(year, month + 1, 0).getDate();
      for (var d = 1; d <= days; d += 1) {
        var date = new Date(year, month, d);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cal-day';
        b.textContent = d;
        b.setAttribute('data-date', iso(date));
        b.setAttribute('aria-label', capitalize(fmtLong.format(date)));
        if (date < minDate || date > maxDate) b.disabled = true;
        if (sameDay(date, today)) b.classList.add('today');
        if (sameDay(date, state.start)) b.classList.add('start');
        if (sameDay(date, state.end)) b.classList.add('end');
        if (state.start && state.end && date > state.start && date < state.end) b.classList.add('in-range');
        if (sameDay(date, state.start) || sameDay(date, state.end)) b.setAttribute('aria-pressed', 'true');
        grid.appendChild(b);
      }
      wrap.appendChild(grid);
      return wrap;
    }

    function renderPop() {
      pop.innerHTML = '';
      var head = document.createElement('div');
      head.className = 'cal-head';
      var prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'cal-nav';
      prev.setAttribute('aria-label', texts.prev || '');
      prev.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
      var next = prev.cloneNode(true);
      next.setAttribute('aria-label', texts.next || '');
      next.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
      var hint = document.createElement('p');
      hint.className = 'cal-hint';
      hint.textContent = state.picking === 'start' ? texts.choosePickup || '' : texts.chooseReturn || '';
      var v = state.view;
      prev.disabled = v.getFullYear() < today.getFullYear() || (v.getFullYear() === today.getFullYear() && v.getMonth() <= today.getMonth());
      prev.addEventListener('click', function () { state.view = new Date(v.getFullYear(), v.getMonth() - 1, 1); renderPop(); });
      next.addEventListener('click', function () { state.view = new Date(v.getFullYear(), v.getMonth() + 1, 1); renderPop(); });
      head.appendChild(prev);
      head.appendChild(hint);
      head.appendChild(next);
      pop.appendChild(head);

      var months = document.createElement('div');
      months.className = 'cal-months';
      months.appendChild(monthGrid(v.getFullYear(), v.getMonth()));
      months.appendChild(monthGrid(v.getFullYear(), v.getMonth() + 1));
      pop.appendChild(months);

      var foot = document.createElement('div');
      foot.className = 'cal-foot';
      var summary = document.createElement('span');
      if (state.start && state.end) {
        var n = rentalDays();
        summary.textContent = n === 1 ? texts.oneDay || '' : fill(texts.days, n);
      }
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'btn btn-small';
      close.textContent = texts.done || 'OK';
      close.addEventListener('click', function () { closePop(true); });
      foot.appendChild(summary);
      foot.appendChild(close);
      pop.appendChild(foot);
    }

    function openPop(which) {
      state.picking = which;
      var ref = (which === 'end' ? state.end || state.start : state.start) || today;
      state.view = new Date(ref.getFullYear(), ref.getMonth(), 1);
      renderPop();
      pop.classList.remove('hidden');
      startBtn.setAttribute('aria-expanded', 'true');
      endBtn.setAttribute('aria-expanded', 'true');
      var focus = pop.querySelector('.cal-day.' + (which === 'end' ? 'end' : 'start')) || pop.querySelector('.cal-day:not([disabled])');
      if (focus) focus.focus();
    }

    function closePop(returnFocus) {
      if (pop.classList.contains('hidden')) return;
      pop.classList.add('hidden');
      startBtn.setAttribute('aria-expanded', 'false');
      endBtn.setAttribute('aria-expanded', 'false');
      if (returnFocus) (state.picking === 'end' ? endBtn : startBtn).focus();
    }

    pop.addEventListener('click', function (event) {
      // Τα κλικ μέσα στο ημερολόγιο δεν το κλείνουν (το περιεχόμενο ξαναζωγραφίζεται).
      event.stopPropagation();
      var day = event.target.closest('.cal-day');
      if (!day || day.disabled) return;
      var date = parseIso(day.getAttribute('data-date'));
      if (state.picking === 'start' || !state.start || date < state.start) {
        var length = state.start && state.end ? Math.max(daysBetween(state.start, state.end), 1) : 3;
        state.start = date;
        if (!state.end || state.end <= date) state.end = addDays(date, length);
        if (state.end > maxDate) state.end = maxDate;
        state.picking = 'end';
        render();
        renderPop();
        var endDay = pop.querySelector('.cal-day.end');
        if (endDay) endDay.focus();
      } else {
        state.end = sameDay(date, state.start) ? addDays(date, 1) : date;
        render();
        closePop(false);
        endBtn.focus();
      }
    });

    // Πλήκτρα: βέλη για μετακίνηση ανά ημέρα/εβδομάδα, Esc για κλείσιμο.
    pop.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); closePop(true); return; }
      var day = event.target.closest && event.target.closest('.cal-day');
      if (!day) return;
      var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (!step) return;
      event.preventDefault();
      var target = addDays(parseIso(day.getAttribute('data-date')), step);
      var btn = pop.querySelector('.cal-day[data-date="' + iso(target) + '"]');
      if (!btn && target >= minDate && target <= maxDate) {
        state.view = new Date(target.getFullYear(), target.getMonth() - (step > 0 ? 1 : 0), 1);
        renderPop();
        btn = pop.querySelector('.cal-day[data-date="' + iso(target) + '"]');
      }
      if (btn && !btn.disabled) btn.focus();
    });

    startBtn.addEventListener('click', function () { openPop('start'); });
    endBtn.addEventListener('click', function () { openPop('end'); });
    document.addEventListener('click', function (event) {
      if (!pop.contains(event.target) && event.target !== startBtn && event.target !== endBtn && !startBtn.contains(event.target) && !endBtn.contains(event.target)) closePop(false);
    });

    render();
  }

  document.querySelectorAll('[data-search-form]').forEach(initRange);

  // ------------------------------------------------------------------ ΗΗ/ΜΜ/ΕΕΕΕ
  function initDmy(input) {
    if (input.type !== 'date') return;
    var text = document.createElement('input');
    text.type = 'text';
    text.inputMode = 'numeric';
    text.autocomplete = input.getAttribute('autocomplete') || 'off';
    text.placeholder = input.getAttribute('data-dmy') || 'ΗΗ/ΜΜ/ΕΕΕΕ';
    text.maxLength = 10;
    text.className = 'dmy';
    if (input.required) text.required = true;
    if (input.id) { text.id = input.id; input.removeAttribute('id'); }
    var d = parseIso(input.value);
    if (d) text.value = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    input.type = 'hidden';
    input.parentNode.insertBefore(text, input);

    text.addEventListener('input', function () {
      var digits = text.value.replace(/\D/g, '').slice(0, 8);
      var out = digits.slice(0, 2);
      if (digits.length > 2) out += '/' + digits.slice(2, 4);
      if (digits.length > 4) out += '/' + digits.slice(4);
      text.value = out;
      var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(out);
      var date = m ? parseIso(m[3] + '-' + m[2] + '-' + m[1]) : null;
      input.value = date ? iso(date) : '';
      text.setCustomValidity(out.length === 10 && !date ? input.getAttribute('data-dmy-invalid') || ' ' : '');
    });
  }

  document.querySelectorAll('input[data-dmy]').forEach(initDmy);
})();
