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
    this.disabled = true;
    this.listeners = {};
    this.classList = { add() {}, toggle() {} };
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  addEventListener(name, listener) { this.listeners[name] = listener; }
  click() { if (!this.disabled) this.listeners.click(); }
}

function allText(element) {
  return [element.textContent, ...element.children.map(allText)].join(' ');
}

async function mount({ stale = false, fail = false, invalid = false } = {}) {
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

test('renders a seven-day week with only Busy and times', async () => {
  const nodes = await mount();
  assert.equal(nodes['availability-days'].children.length, 7);
  const text = allText(nodes['availability-days']);
  assert.match(text, /Busy/);
  assert.match(text, /09:00–10:00/);
  assert.doesNotMatch(text, /PRIVATE TITLE/);
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
