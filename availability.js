(function () {
  'use strict';

  var container = document.getElementById('availability-days');
  if (!container) return;
  var status = document.getElementById('availability-status');
  var weekLabel = document.getElementById('availability-week');
  var previous = document.getElementById('availability-prev');
  var next = document.getElementById('availability-next');
  var todayButton = document.getElementById('availability-today');
  var data;
  var week;
  var currentWeek;
  var dayMs = 86400000;
  var startMinute = 9 * 60;
  var endMinute = 17 * 60;
  var dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  var weekdayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

  // Date-only arithmetic in UTC avoids shifts in the visitor's timezone or at DST.
  function dateKey(value) { return value.toISOString().slice(0, 10); }
  function dateValue(key) { return new Date(key + 'T00:00:00Z'); }
  function addDays(value, count) { return new Date(value.getTime() + count * dayMs); }
  function monday(value) { return addDays(value, -((value.getUTCDay() + 6) % 7)); }
  function austinToday() {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: data.timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    function part(type) { return parts.find(function (item) { return item.type === type; }).value; }
    return part('year') + '-' + part('month') + '-' + part('day');
  }
  function element(tag, className, text) {
    var node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }
  function minutes(value) {
    var parts = value.split(':');
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  function timeLabel(value) {
    return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
  }

  function render() {
    var today = austinToday();
    currentWeek = monday(dateValue(today));
    var stale = Date.now() - Date.parse(data.updatedAt) > 6 * 60 * 60 * 1000;
    var updated = new Intl.DateTimeFormat('en-US', {
      timeZone: data.timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    }).format(new Date(data.updatedAt));
    weekLabel.textContent = dateFormat.format(week) + ' – ' + dateFormat.format(addDays(week, 4)) + ', ' + addDays(week, 4).getUTCFullYear();
    status.textContent = stale
      ? 'Calendar update delayed · Last updated ' + updated + '. Please email me to confirm availability.'
      : 'Busy times only · Updated ' + updated;
    status.classList.toggle('availability-stale', stale);
    previous.disabled = dateKey(addDays(week, -7)) < data.rangeStart;
    next.disabled = dateKey(addDays(week, 7)) >= data.rangeEnd;
    todayButton.disabled = week.getTime() === currentWeek.getTime()
      || dateKey(currentWeek) < data.rangeStart || dateKey(currentWeek) >= data.rangeEnd;
    container.replaceChildren();

    var hours = element('div', 'availability-hours', '');
    hours.setAttribute('aria-hidden', 'true');
    hours.append(element('div', 'availability-hours-heading', ''));
    var scale = element('div', 'availability-scale', '');
    for (var hour = 9; hour <= 17; hour++) {
      var tick = element('span', 'availability-hour', timeLabel(hour * 60));
      tick.style.top = ((hour * 60 - startMinute) / (endMinute - startMinute) * 100) + '%';
      scale.append(tick);
    }
    hours.append(scale);
    container.append(hours);

    for (var i = 0; i < 5; i++) {
      var day = addDays(week, i);
      var key = dateKey(day);
      var column = element('section', 'availability-day', '');
      if (key === today) column.classList.add('is-today');
      var heading = element('h3', 'availability-day-heading', '');
      heading.append(element('span', 'availability-weekday', weekdayFormat.format(day)));
      var date = element('time', 'availability-date', dateFormat.format(day));
      date.dateTime = key;
      if (key === today) date.setAttribute('aria-current', 'date');
      heading.append(date);
      column.append(heading);
      var slots = data.days[key];
      var list = element('ul', 'availability-slots', '');
      list.setAttribute('aria-label', 'Busy times for ' + weekdayFormat.format(day) + ', ' + dateFormat.format(day));
      (slots || []).forEach(function (slot) {
        // Clip events to the visible workday without changing the source data.
        var start = Math.max(startMinute, minutes(slot.start));
        var end = Math.min(endMinute, minutes(slot.end));
        if (end <= start) return;
        var duration = end - start;
        var item = element('li', 'availability-slot', '');
        var timeRange = timeLabel(start) + '–' + timeLabel(end);
        item.style.top = ((start - startMinute) / (endMinute - startMinute) * 100) + '%';
        item.style.height = (duration / (endMinute - startMinute) * 100) + '%';
        item.tabIndex = 0;
        item.title = 'Busy · ' + timeRange + ' (Austin time)';
        item.setAttribute('aria-label', item.title);
        if (duration < 45) item.classList.add('is-short');
        if (duration < 20) item.classList.add('is-tiny');
        item.append(element('strong', '', 'Busy'));
        item.append(element('span', 'availability-time', timeRange));
        list.append(item);
      });
      column.append(list);
      if (stale || !slots) {
        column.classList.add('is-stale');
      }
      container.append(column);
    }
  }

  function validate(value) {
    if (!value || value.timeZone !== 'America/Chicago' || !Number.isFinite(Date.parse(value.updatedAt))
      || !/^\d{4}-\d{2}-\d{2}$/.test(value.rangeStart) || !/^\d{4}-\d{2}-\d{2}$/.test(value.rangeEnd)
      || !value.days || dateValue(value.rangeStart) >= dateValue(value.rangeEnd)) throw new Error('Invalid calendar data');
    for (var day = dateValue(value.rangeStart); day < dateValue(value.rangeEnd); day = addDays(day, 1)) {
      var slots = value.days[dateKey(day)];
      if (!Array.isArray(slots) || slots.some(function (slot) {
        return !slot || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start)
          || !/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(slot.end);
      })) throw new Error('Invalid time intervals');
    }
    return value;
  }

  previous.addEventListener('click', function () { week = addDays(week, -7); render(); });
  next.addEventListener('click', function () { week = addDays(week, 7); render(); });
  todayButton.addEventListener('click', function () { week = currentWeek; render(); });

  async function load() {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var response = await fetch('data/availability.json', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Calendar unavailable');
      data = validate(await response.json());
      currentWeek = monday(dateValue(austinToday()));
      if (!week || dateKey(week) < data.rangeStart || dateKey(week) >= data.rangeEnd) {
        week = currentWeek;
        if (dateKey(week) < data.rangeStart) week = dateValue(data.rangeStart);
        if (dateKey(week) >= data.rangeEnd) week = addDays(dateValue(data.rangeEnd), -7);
      }
      render();
    } catch (error) {
      status.textContent = 'Busy times are currently unavailable. Please email me to check availability.';
      if (data) render();
    } finally {
      clearTimeout(timer);
    }
  }
  load();
  setInterval(load, 5 * 60 * 1000);
})();
