const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const page = readFileSync(require.resolve('../public/index.html'), 'utf8');

test('normal browsing keeps genre, year, format, and streaming filters in the header menu', () => {
  const header = page.match(/<header id="store-header"[\s\S]*?<\/header>/)?.[0] || '';
  assert.match(header, /id="year-form"/);
  assert.match(header, /id="genre-nav"/);
  assert.match(header, /class="format-switch"/);
  assert.match(header, /id="provider-checkboxes"/);
  assert.doesNotMatch(page, /<aside class="aisle-directory"/);
});

test('immersive navigation separates Balcony from settings and filters', () => {
  assert.match(page, /class="immersive-destination[\s\S]*id="balcony-toggle"/);
  assert.match(page, /id="immersive-settings-toggle"[^>]*>\s*<span[^>]*>⚙<\/span>\s*<span[^>]*data-i18n="settings"/);
  assert.match(page, /id="immersive-filters-toggle"[^>]*>\s*<span[^>]*>⌕<\/span>\s*<span[^>]*data-i18n="filters"/);
});
