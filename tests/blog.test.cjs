const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../blog.js'), 'utf8');

function mount(query = '', tags = [['Research', '生活'], ['Life'], ['生活']]) {
  const posts = tags.map(values => ({ dataset: { blogTags: JSON.stringify(values) }, hidden: false }));
  const buttons = ['', 'Research', 'Life', '生活'].map(tag => ({
    dataset: { blogFilter: tag }, attributes: {}, listeners: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, listener) { this.listeners[name] = listener; },
    click() { this.listeners.click(); }
  }));
  const count = {};
  const empty = {};
  const events = {};
  const window = {
    location: { href: 'https://example.test/my-site/blog.html' + query },
    history: { pushState(_state, _title, url) { window.location.href = String(url); } },
    addEventListener(name, listener) { events[name] = listener; }
  };
  const nodes = { 'blog-posts': { querySelectorAll: () => posts }, 'blog-count': count, 'blog-empty': empty };
  vm.runInNewContext(script, {
    document: { getElementById: id => nodes[id], querySelectorAll: () => buttons }, window, URL
  });
  return { posts, buttons, count, empty, window, events };
}

test('tags filter articles with multiple tags and All restores the list', () => {
  const blog = mount();
  blog.buttons[1].click();
  assert.deepEqual(blog.posts.map(post => post.hidden), [false, true, true]);
  assert.equal(blog.count.textContent, '1 post');
  assert.equal(blog.buttons[1].attributes['aria-pressed'], 'true');
  blog.buttons[0].click();
  assert.deepEqual(blog.posts.map(post => post.hidden), [false, false, false]);
  assert.equal(blog.count.textContent, '3 posts');
  assert.equal(blog.empty.hidden, true);
});

test('Chinese tag links work under a GitHub Pages project path', () => {
  const blog = mount('?tag=%E7%94%9F%E6%B4%BB');
  assert.deepEqual(blog.posts.map(post => post.hidden), [false, true, false]);
  assert.equal(blog.count.textContent, '2 posts');
  blog.buttons[2].click();
  assert.equal(new URL(blog.window.location.href).pathname, '/my-site/blog.html');
  assert.equal(new URL(blog.window.location.href).searchParams.get('tag'), 'Life');
});

test('browser back and forward restore the tag selection', () => {
  const blog = mount();
  blog.buttons[1].click();
  blog.window.location.href = 'https://example.test/my-site/blog.html?tag=Life';
  blog.events.popstate();
  assert.deepEqual(blog.posts.map(post => post.hidden), [true, false, true]);
  assert.equal(blog.buttons[2].attributes['aria-pressed'], 'true');
});

test('an empty blog or unmatched tag displays an honest empty state', () => {
  const blog = mount('?tag=Unknown');
  assert.equal(blog.count.textContent, '0 posts');
  assert.equal(blog.empty.hidden, false);
  assert.match(blog.empty.textContent, /Unknown/);
  const empty = mount('', []);
  assert.equal(empty.empty.textContent, 'No posts yet.');
});
