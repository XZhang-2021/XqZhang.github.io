const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const script = fs.readFileSync(path.join(__dirname, '../availability.js'), 'utf8');
const fixedNow = Date.parse('2026-10-21T15:00:00Z');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow; }
}

// A minimal DOM for behavior tests; visual layout is checked separately when available.
class Element {
  constructor() {
    this.children = [];
    this.textContent = '';
    this.className = '';
    this.style = {};
    this.attributes = {};
    this.disabled = true;
    this.listeners = {};
    this.classList = {
      add: name => { this.className += ' ' + name; },
      toggle: (name, enabled) => {
        if (enabled) this.className += ' ' + name;
      }
    };
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  click() { if (!this.disabled) this.listeners.click(); }
}

function allText(element) {
  return [element.textContent, ...element.children.map(allText)].join(' ');
}

function findByClass(element, name) {
  const match = element.className.split(' ').includes(name) ? [element] : [];
  return match.concat(element.children.flatMap(child => findByClass(child, name)));
}

async function mount({ stale = false, fail = false, invalid = false, entries = {} } = {}) {
  const data = {
    timeZone: 'America/Chicago',
    updatedAt: new Date(fixedNow - (stale ? 86400000 : 0)).toISOString(),
    rangeStart: '2026-10-12', rangeEnd: '2027-01-18', days: {}
  };
  for (let day = Date.parse(data.rangeStart); day < Date.parse(data.rangeEnd); day += 86400000) {
    data.days[new Date(day).toISOString().slice(0, 10)] = [];
  }
  const today = '2026-10-21';
  data.days[today] = [{ start: '09:00', end: '10:00', summary: 'PRIVATE TITLE' }];
  Object.assign(data.days, entries);
  if (invalid) delete data.days[today];
  const nodes = Object.fromEntries(['days', 'status', 'week', 'prev', 'next', 'today']
    .map(id => [`availability-${id}`, new Element()]));
  const context = {
    document: { getElementById: id => nodes[id], createElement: () => new Element() },
    Intl, Date: Clock, AbortController, setTimeout, clearTimeout, setInterval() {},
    fetch: async () => {
      if (fail) throw new Error('Network unavailable');
      return { ok: true, json: async () => data };
    }
  };
  vm.runInNewContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  return nodes;
}

test('renders Monday to Friday with a complete 09:00–17:00 scale and private Busy labels', async () => {
  const nodes = await mount();
  assert.equal(findByClass(nodes['availability-days'], 'availability-day').length, 5);
  const ticks = findByClass(nodes['availability-days'], 'availability-hour');
  assert.deepEqual(ticks.map(tick => tick.textContent),
    ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
  assert.equal(ticks[0].style.top, '0%');
  assert.equal(ticks[8].style.top, '100%');
  const text = allText(nodes['availability-days']);
  assert.match(text, /Mon/);
  assert.match(text, /Fri/);
  assert.doesNotMatch(text, /Sat|Sun/);
  assert.match(text, /Busy/);
  assert.match(text, /09:00–10:00/);
  assert.doesNotMatch(text, /PRIVATE TITLE/);
  assert.equal(nodes['availability-week'].textContent, 'Oct 19 – Oct 23, 2026');
});

test('clips boundary events to work hours and excludes evening and weekend events', async () => {
  const nodes = await mount({ entries: {
    '2026-10-21': [
      { start: '07:00', end: '08:00' },
      { start: '08:30', end: '09:30' },
      { start: '12:00', end: '13:00' },
      { start: '16:30', end: '18:00' },
      { start: '20:00', end: '21:00' }
    ],
    '2026-10-24': [{ start: '10:00', end: '11:00' }]
  } });
  const slots = findByClass(nodes['availability-days'], 'availability-slot');
  assert.equal(slots.length, 3);
  assert.match(slots[0].attributes['aria-label'], /09:00–09:30/);
  assert.equal(slots[0].style.top, '0%');
  assert.equal(slots[0].style.height, '6.25%');
  assert.equal(slots[1].style.top, '37.5%');
  assert.equal(slots[1].style.height, '12.5%');
  assert.match(slots[2].attributes['aria-label'], /16:30–17:00/);
  assert.equal(slots[2].style.top, '93.75%');
  assert.equal(slots[2].style.height, '6.25%');
});

test('all-day events fill exactly the displayed workday', async () => {
  const nodes = await mount({ entries: {
    '2026-10-21': [{ start: '00:00', end: '24:00' }]
  } });
  const slot = findByClass(nodes['availability-days'], 'availability-slot')[0];
  assert.equal(slot.style.top, '0%');
  assert.equal(slot.style.height, '100%');
  assert.match(slot.attributes['aria-label'], /09:00–17:00/);
});

test('short events retain their actual duration and an accessible time label', async () => {
  const nodes = await mount({ entries: {
    '2026-10-21': [{ start: '09:10', end: '09:15' }]
  } });
  const slot = findByClass(nodes['availability-days'], 'availability-slot')[0];
  assert.ok(Math.abs(parseFloat(slot.style.height) - 100 / 96) < 0.00001);
  assert.match(slot.attributes['aria-label'], /Busy · 09:10–09:15/);
  assert.equal(slot.tabIndex, 0);
});

test('week controls advance and return to this week', async () => {
  const nodes = await mount();
  const current = nodes['availability-week'].textContent;
  assert.equal(nodes['availability-today'].disabled, true);
  nodes['availability-next'].click();
  assert.notEqual(nodes['availability-week'].textContent, current);
  nodes['availability-today'].click();
  assert.equal(nodes['availability-week'].textContent, current);
  nodes['availability-prev'].click();
  assert.equal(nodes['availability-prev'].disabled, true);
});

test('stale data is labeled and empty days do not imply free time', async () => {
  const nodes = await mount({ stale: true });
  assert.match(nodes['availability-status'].textContent, /update delayed/);
  assert.doesNotMatch(allText(nodes['availability-days']), /No busy times/);
});

for (const scenario of [{ fail: true }, { invalid: true }]) {
  test(`unavailable or malformed data fails visibly: ${JSON.stringify(scenario)}`, async () => {
    const nodes = await mount(scenario);
    assert.match(nodes['availability-status'].textContent, /currently unavailable/);
    assert.equal(nodes['availability-days'].children.length, 0);
    assert.equal(nodes['availability-next'].disabled, true);
  });
}
