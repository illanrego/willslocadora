const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const page = readFileSync(require.resolve('../public/index.html'), 'utf8');
const app = readFileSync(require.resolve('../public/app.js'), 'utf8');
const css = readFileSync(require.resolve('../public/styles.css'), 'utf8');

test('normal browsing keeps compact select controls in the header and streaming filters behind a reveal', () => {
  const header = page.match(/<header id="store-header"[\s\S]*?<\/header>/)?.[0] || '';
  assert.match(header, /id="year-form"/);
  assert.match(header, /id="year-go"/);
  assert.match(header, /id="genre-select"/);
  assert.match(header, /id="normal-filters-toggle"[^>]*aria-controls="normal-provider-filters"/);
  assert.match(header, /id="normal-provider-filters"[^>]*hidden/);
  assert.match(header, /class="format-switch"/);
  assert.match(header, /id="provider-checkboxes"/);
  assert.doesNotMatch(page, /<aside class="aisle-directory"/);
});

test('balcony search terminal is an accessible native dialog', () => {
  assert.match(page, /<dialog id="balcony-search-dialog" class="panel-dialog balcony-search-dialog">/);
  assert.match(page, /<form id="balcony-search-form"[^>]*>/);
  assert.match(page, /<input id="balcony-search-input"[^>]*type="search"[^>]*minlength="2"/);
  assert.match(page, /id="balcony-search-status"[^>]*role="status"/);
  assert.match(page, /id="balcony-search-results"/);
  assert.match(app, /function openBalconySearch\(\)/);
  assert.match(app, /api\(`\/api\/search\?\$\{new URLSearchParams/);
});
test('immersive navigation separates Balcony from settings and filters', () => {
  assert.match(page, /class="immersive-destination[\s\S]*id="balcony-toggle"/);
  assert.match(page, /id="immersive-settings-toggle"[^>]*>\s*<span[^>]*>⚙<\/span>\s*<span[^>]*data-i18n="settings"/);
  assert.match(page, /id="immersive-filters-toggle"[^>]*>\s*<span[^>]*>⌕<\/span>\s*<span[^>]*data-i18n="filters"/);
});

test('locale refresh relabels each genre selector without indexing across both option lists', () => {
  assert.doesNotMatch(app, /#genre-select option, #immersive-genre-select option/);
  assert.match(app, /for \(const select of \[\$\('#genre-select'\), \$\('#immersive-genre-select'\)\]\) \{\s*select\.querySelectorAll\('option'\)\.forEach\(\(option, index\) => \{ option\.textContent = genreLabel\(genres\[index\]\); \}\);/);
});

test('collapsed immersive HUD keeps its nested restore button visible', () => {
  assert.doesNotMatch(css, /\.immersive-hud\.is-collapsed \.immersive-hud-strip > :not\(#immersive-hud-toggle\)/);
  assert.match(css, /\.immersive-hud\.is-collapsed \.immersive-hud-strip > :not\(\.immersive-menu-actions\), \.immersive-hud\.is-collapsed \.immersive-menu-actions > :not\(#immersive-hud-toggle\)/);
});
