// Ημερομηνίες χωρίς το «μπλε» πεδίο ημερομηνίας του browser.
//
//  - Αναζήτηση (παραλαβή/επιστροφή): ημερολόγιο με επιλογή διαστήματος, όπως στις μεγάλες
//    εταιρείες ενοικίασης. Οι φόρμες με [data-search-form] και πεδία pickup_date / return_date.
//  - Ημερομηνία γέννησης / έκδοσης διπλώματος ([data-dmy]): απλό πεδίο ΗΗ/ΜΜ/ΕΕΕΕ (δέχεται και
//    5/3/1990)· στον server στέλνεται ΕΕΕΕ-ΜΜ-ΗΗ όπως πριν, ή ό,τι γράφτηκε αν δεν είναι έγκυρη ημερομηνία.
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

  // Χωρίς έτος όταν είναι το τρέχον· για άλλο έτος χωρίς ημέρα εβδομάδας, ώστε να φαίνεται πάντα το έτος.
  var fmtShort = new Intl.DateTimeFormat(intl, { weekday: 'short', day: 'numeric', month: 'short' });
  var fmtShortYear = new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', year: 'numeric' });
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
    var maxRental = Number(form.getAttribute('data-max-rental-days')) || 30;
    var minDate = today;
    // Η παραλαβή έως maxDays μπροστά· η επιστροφή έως τη μέγιστη διάρκεια μετά την παραλαβή.
    // Τελευταία ημέρα παραλαβής: ο server μετρά από την τρέχουσα ώρα, άρα η ημέρα +maxDays δεν χωράει ολόκληρη.
    var maxDate = addDays(today, maxDays - 1);
    function lastReturn(from) { return addDays(from || today, maxRental); }
    function selectable(date) {
      if (date < minDate) return false;
      return state.picking === 'end' && state.start && date >= state.start ? date <= lastReturn(state.start) : date <= maxDate;
    }

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
      // Κάτω από μία ώρα ο server την απορρίπτει (π.χ. ίδια ημέρα με ίδια ώρα): όχι «1 ημέρα».
      if (minutes < 60) return null;
      return Math.max(1, Math.ceil((minutes - grace) / 1440));
    }
    function summaryText() {
      if (!state.start || !state.end) return '';
      var n = rentalDays();
      if (n === null) return texts.tooShort || '';
      if (n > maxRental) return texts.tooLong || '';
      return n === 1 ? texts.oneDay || '' : fill(texts.days, n);
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
        // Οι αναγνώστες οθόνης ακούνε και την επιλεγμένη ημερομηνία, όχι μόνο την ετικέτα.
        x[0].setAttribute('aria-label', x[0].getAttribute('data-label') + ': ' + (x[1] ? capitalize(fmtLong.format(x[1])) : x[2] || ''));
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
        if (!selectable(date)) b.disabled = true;
        if (sameDay(date, today)) b.classList.add('today');
        if (sameDay(date, state.start)) b.classList.add('start');
        if (sameDay(date, state.end)) b.classList.add('end');
        if (state.start && state.end && date > state.start && date < state.end) b.classList.add('in-range');
        if (sameDay(date, state.start) || sameDay(date, state.end)) b.setAttribute('aria-pressed', 'true');
        // Μία μόνο ημέρα στη σειρά του Tab· μέσα στο ημερολόγιο κινούμαστε με τα βέλη.
        b.tabIndex = -1;
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
      hint.setAttribute('aria-live', 'polite');
      hint.textContent = state.picking === 'start' ? texts.choosePickup || '' : texts.chooseReturn || '';
      var v = state.view;
      // Στον πρώτο μήνα το «προηγούμενος» μένει εστιάσιμο (aria-disabled) αλλά δεν κάνει τίποτα, ώστε
      // επαναλαμβανόμενα Enter να μη «γυρίζουν» το ημερολόγιο μπρος-πίσω.
      var atFirst = v.getFullYear() < today.getFullYear() || (v.getFullYear() === today.getFullYear() && v.getMonth() <= today.getMonth());
      if (atFirst) prev.setAttribute('aria-disabled', 'true');
      prev.setAttribute('data-dir', 'prev');
      next.setAttribute('data-dir', 'next');
      // Μετά την αλλαγή μήνα η εστίαση μένει στο ίδιο κουμπί (το περιεχόμενο ξαναζωγραφίζεται).
      prev.addEventListener('click', function () { if (atFirst) return; state.view = new Date(v.getFullYear(), v.getMonth() - 1, 1); renderPop(); focusNav('prev'); });
      next.addEventListener('click', function () { state.view = new Date(v.getFullYear(), v.getMonth() + 1, 1); renderPop(); focusNav('next'); });
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
      summary.className = 'cal-summary';
      summary.setAttribute('aria-live', 'polite');
      summary.textContent = summaryText();
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'btn btn-small';
      close.textContent = texts.done || 'OK';
      close.addEventListener('click', function () { closePop(true); });
      foot.appendChild(summary);
      foot.appendChild(close);
      pop.appendChild(foot);
      ensureTabStop();
    }
    // Πάντα μία ορατή, διαθέσιμη ημέρα στη σειρά του Tab (π.χ. μετά από «επόμενος μήνας»).
    function firstVisibleDay() {
      var days = pop.querySelectorAll('.cal-day:not([disabled])');
      for (var i = 0; i < days.length; i += 1) if (days[i].offsetParent !== null) return days[i];
      return null;
    }
    function ensureTabStop() {
      var pick = (state.picking === 'end' ? state.end : state.start) || state.start;
      var btn = (pick && dayButton(pick)) || (state.start && dayButton(state.start)) || firstVisibleDay();
      if (btn && !btn.disabled) btn.tabIndex = 0;
      return btn;
    }

    function focusDay(btn) {
      if (!btn) return;
      pop.querySelectorAll('.cal-day[tabindex="0"]').forEach(function (b) { b.tabIndex = -1; });
      btn.tabIndex = 0;
      btn.focus();
    }
    function focusNav(dir) {
      // Αν το κουμπί απενεργοποιήθηκε (π.χ. πρώτος μήνας), η εστίαση πάει στο άλλο κουμπί μήνα —
      // ποτέ σε τυχαία ημέρα, ώστε ένα ακόμη Enter να μην αλλάξει ημερομηνία.
      var btn = pop.querySelector('.cal-nav[data-dir="' + dir + '"]');
      if (btn) btn.focus();
    }
    // Ορατή ημέρα (στο κινητό και στη στενή φόρμα φαίνεται μόνο ο πρώτος μήνας).
    function dayButton(date) {
      var btn = pop.querySelector('.cal-day[data-date="' + iso(date) + '"]');
      return btn && !btn.disabled && btn.offsetParent !== null ? btn : null;
    }
    function twoMonthsVisible() {
      var months = pop.querySelectorAll('.cal-month');
      return months.length > 1 && months[1].offsetParent !== null;
    }

    function openPop(which) {
      state.picking = which;
      var ref = (which === 'end' ? state.end || state.start : state.start) || today;
      // Επιστροφή εκτός ορίων (π.χ. μετά από σφάλμα «μέγιστη διάρκεια»): ανοίγει στον μήνα της παραλαβής.
      if (!selectable(ref)) ref = state.start && selectable(state.start) ? state.start : today;
      state.view = new Date(ref.getFullYear(), ref.getMonth(), 1);
      renderPop();
      pop.classList.remove('hidden');
      startBtn.setAttribute('aria-expanded', 'true');
      endBtn.setAttribute('aria-expanded', 'true');
      var focus = pop.querySelector('.cal-day.' + (which === 'end' ? 'end' : 'start') + ':not([disabled])') ||
        pop.querySelector('.cal-day.start:not([disabled])') || pop.querySelector('.cal-day:not([disabled])');
      focusDay(focus);
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
        // Η διάρκεια μένει ίδια· η επιστροφή μένει την ίδια ημέρα μόνο αν ήταν ήδη ενοικίαση μίας ημέρας.
        var length = state.start && state.end ? Math.max(daysBetween(state.start, state.end), 0) : 3;
        state.start = date;
        if (!state.end || state.end < date || (sameDay(state.end, date) && length > 0)) state.end = addDays(date, length);
        if (state.end > lastReturn(date)) state.end = lastReturn(date);
        state.picking = 'end';
        render();
        renderPop();
        if (!dayButton(state.end)) {
          // Η επιστροφή πέφτει σε μήνα που δεν φαίνεται: εμφανίζεται, ώστε να συνεχίσει κανείς με τα βέλη.
          state.view = new Date(state.end.getFullYear(), state.end.getMonth() - (twoMonthsVisible() ? 1 : 0), 1);
          renderPop();
        }
        focusDay(dayButton(state.end) || ensureTabStop());
      } else {
        // Επιστροφή την ίδια ημέρα επιτρέπεται (π.χ. 10:00–18:00)· τις ώρες τις ελέγχει ο server.
        state.end = date;
        render();
        closePop(false);
        endBtn.focus();
      }
    });

    // Πλήκτρα: βέλη για μετακίνηση ανά ημέρα/εβδομάδα, Esc για κλείσιμο.
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !pop.classList.contains('hidden')) { event.preventDefault(); closePop(true); }
    });
    pop.addEventListener('keydown', function (event) {
      var day = event.target.closest && event.target.closest('.cal-day');
      if (!day) return;
      var from = parseIso(day.getAttribute('data-date'));
      var target;
      var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (step) target = addDays(from, step);
      else if (event.key === 'PageDown' || event.key === 'PageUp') {
        // Ίδια ημέρα του επόμενου/προηγούμενου μήνα (ή η τελευταία του, αν δεν υπάρχει).
        step = event.key === 'PageDown' ? 1 : -1;
        var y = from.getFullYear();
        var mo = from.getMonth() + step;
        target = new Date(y, mo, Math.min(from.getDate(), new Date(y, mo + 1, 0).getDate()));
      } else return;
      event.preventDefault();
      if (!selectable(target)) return;
      var btn = dayButton(target);
      if (!btn) {
        // Ο μήνας-στόχος δεν φαίνεται: με δύο μήνες ορατούς, μπαίνει δεύτερος όταν πηγαίνουμε μπροστά.
        var back = step > 0 && twoMonthsVisible() ? 1 : 0;
        state.view = new Date(target.getFullYear(), target.getMonth() - back, 1);
        renderPop();
        btn = dayButton(target);
      }
      if (btn && !btn.disabled) focusDay(btn);
    });

    // Η εστίαση έφυγε από το ημερολόγιο (π.χ. Tab μετά το «Εντάξει»): κλείνει, ώστε να μην κρύβει
    // το στοιχείο που εστιάστηκε.
    pop.addEventListener('focusout', function (event) {
      var to = event.relatedTarget;
      if (to && !pop.contains(to) && to !== startBtn && to !== endBtn) closePop(false);
    });
    ['pickup_time', 'return_time'].forEach(function (name) {
      var select = form.querySelector('[name="' + name + '"]');
      if (select) select.addEventListener('change', function () {
        var summary = pop.querySelector('.cal-summary');
        if (summary) summary.textContent = summaryText();
      });
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
  // Δέχεται 15/03/1990, 5/3/1990, 15.03.1990, 15,03,1990, 15031990, καθώς και πρώτα το έτος: 1990-03-15.
  function parseDmy(value) {
    var t = String(value || '').trim();
    var sep = '[\\/.,\\- ]\\s*';
    var m = new RegExp('^(\\d{1,2})\\s*' + sep + '(\\d{1,2})\\s*' + sep + '(\\d{4})$').exec(t);
    if (m) return parseIso(m[3] + '-' + pad(Number(m[2])) + '-' + pad(Number(m[1])));
    m = new RegExp('^(\\d{4})\\s*' + sep + '(\\d{1,2})\\s*' + sep + '(\\d{1,2})$').exec(t);
    if (m) return parseIso(m[1] + '-' + pad(Number(m[2])) + '-' + pad(Number(m[3])));
    m = /^(\d{2})(\d{2})(\d{4})$/.exec(t);
    if (m) return parseIso(m[3] + '-' + m[2] + '-' + m[1]) || parseIso(t.slice(0, 4) + '-' + t.slice(4, 6) + '-' + t.slice(6));
    return null;
  }
  function formatDmy(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }

  function initDmy(input) {
    if (input.type !== 'date') return;
    var text = document.createElement('input');
    text.type = 'text';
    text.inputMode = 'numeric';
    if (input.getAttribute('autocomplete')) text.autocomplete = input.getAttribute('autocomplete');
    text.placeholder = input.getAttribute('data-dmy') || 'ΗΗ/ΜΜ/ΕΕΕΕ';
    text.maxLength = 16;
    text.className = 'dmy';
    if (input.required) text.required = true;
    if (input.id) { text.id = input.id; input.removeAttribute('id'); }
    // Η αρχική τιμή από το HTML: ένα άκυρο κείμενο (μετά από σφάλμα) ο browser το σβήνει από το .value
    // ενός πεδίου ημερομηνίας, γι' αυτό διαβάζεται το attribute.
    var initial = input.getAttribute('value') || '';
    var d = parseIso(initial);
    text.value = d ? formatDmy(d) : initial;
    input.value = initial;
    input.type = 'hidden';
    input.parentNode.insertBefore(text, input);

    // Το μήνυμα παίρνει την κλάση «error» μόνο όταν φαίνεται (αλλιώς το πεδίο θα είχε πάντα κόκκινο περίγραμμα).
    var message = document.createElement('span');
    message.className = 'dmy-error hidden';
    message.id = (text.id || input.name) + '-dmy-error';
    message.setAttribute('aria-live', 'polite');
    message.textContent = input.getAttribute('data-dmy-invalid') || '';
    text.parentNode.insertBefore(message, input.nextSibling);

    function sync() {
      var date = parseDmy(text.value);
      // Έγκυρη: ΕΕΕΕ-ΜΜ-ΗΗ· άκυρη: ό,τι γράφτηκε, ώστε ο server να πει «μη έγκυρη» και να το ξαναδείξει.
      input.value = date ? iso(date) : text.value.trim();
      return date;
    }
    var field = text.closest('.field');
    function hideServerError() {
      if (!field) return;
      field.querySelectorAll('.error').forEach(function (el) { if (el !== message) el.classList.add('hidden'); });
    }
    function showError(show) {
      message.classList.toggle('hidden', !show);
      message.classList.toggle('error', show);
      if (show) hideServerError();
      if (show) { text.setAttribute('aria-invalid', 'true'); text.setAttribute('aria-describedby', message.id); }
      else { text.removeAttribute('aria-invalid'); text.removeAttribute('aria-describedby'); }
    }

    // Ό,τι γράφεται μένει όπως γράφτηκε (χωρίς αυτόματες καθέτους, που μπέρδευαν διορθώσεις και το
    // «πρώτα το έτος»)· μόλις φύγει η εστίαση, μια έγκυρη ημερομηνία γράφεται ως ΗΗ/ΜΜ/ΕΕΕΕ.
    text.addEventListener('input', function () {
      if (sync()) { showError(false); hideServerError(); }
    });
    function finish() {
      var date = sync();
      if (date) text.value = formatDmy(date);
      showError(Boolean(text.value.trim()) && !date);
    }
    text.addEventListener('blur', finish);
    text.addEventListener('change', finish);
    // Τιμή που μπήκε χωρίς πληκτρολόγηση (π.χ. αυτόματη συμπλήρωση) συγχρονίζεται πριν την αποστολή.
    if (text.form) text.form.addEventListener('submit', sync);
  }

  document.querySelectorAll('input[data-dmy]').forEach(initDmy);
})();
