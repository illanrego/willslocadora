const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const page = readFileSync(require.resolve('../public/index.html'), 'utf8');
const app = readFileSync(require.resolve('../public/app.js'), 'utf8');
const css = readFileSync(require.resolve('../public/styles.css'), 'utf8');
const flat = readFileSync(require.resolve('../public/vhs-flat.mjs'), 'utf8');
const { COPY } = require('../public/i18n.js');

function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `expected to find ${signature}`);
  const end = source.indexOf('\n  }', start);
  return source.slice(start, end === -1 ? undefined : end);
}

test('series is a per-visitor preference persisted in localStorage', () => {
  // Default off: only the literal string "true" turns it on, like the provider and all-years prefs.
  assert.match(app, /series: localStorage\.getItem\('locadora\.series'\) === 'true',/);

  const sync = functionBody(app, 'function syncSeriesControls()');
  assert.match(sync, /'\#normal-series-toggle', '\#immersive-series-toggle'/);
  assert.match(sync, /input\.checked = state\.series;/);

  const set = functionBody(app, 'function setSeries(value, reload = true)');
  assert.match(set, /state\.series = Boolean\(value\);/);
  assert.match(set, /localStorage\.setItem\('locadora\.series', String\(state\.series\)\);/);
  assert.match(set, /syncSeriesControls\(\);/);
  assert.match(set, /if \(reload\) loadShelf\(\);/);

  // Wired once at boot and repainted on the shared controls sync next to sort.
  assert.match(app, /syncSortControls\(\);\s*syncSeriesControls\(\);/);
  assert.match(app, /\$\('#normal-series-toggle'\)\.addEventListener\('change', \(event\) => setSeries\(event\.currentTarget\.checked\)\);/);
  assert.match(app, /\$\('#immersive-series-toggle'\)\.addEventListener\('change', \(event\) => setSeries\(event\.currentTarget\.checked\)\);/);
});

test('both settings panels carry a labelled series toggle', () => {
  assert.match(page, /id="normal-series-toggle" type="checkbox"> <span data-i18n="seriesInShelf"/);
  assert.match(page, /id="immersive-series-toggle" type="checkbox"> <span data-i18n="seriesInShelf"/);
  assert.equal((page.match(/data-i18n="seriesInShelf"/g) || []).length, 2);
});

test('the genre shelf merges types only when the preference is on', () => {
  const body = functionBody(app, 'async function loadShelf(');
  const shelfLine = body.match(/new URLSearchParams\(\{ genre:[\s\S]*?\}\)/)?.[0] || '';
  assert.match(shelfLine, /type: state\.series \? 'all' : 'movie'/);
});

test('credit stands always ask for the merged type in both entry points', () => {
  const shelf = functionBody(app, 'async function loadShelf(');
  const creditLine = shelf.match(/new URLSearchParams\(\{ person:[\s\S]*?\}\)/)?.[0] || '';
  assert.match(creditLine, /type: 'all'/);
  assert.doesNotMatch(creditLine, /state\.series/);
  assert.doesNotMatch(creditLine, /type: state\.type/);

  // The person window's preview list is itself a credit stand, so it asks for all too.
  const person = functionBody(app, 'async function loadPersonTitles(');
  assert.match(person, /type: 'all'/);
});

test('the 2D shelf marks series cards with an accessible badge that leaves the layout intact', () => {
  assert.match(page, /<span class="case-series-badge" role="img" hidden><svg aria-hidden="true"/);

  const body = functionBody(app, 'function renderShelf(');
  assert.match(body, /const seriesBadge = node\.querySelector\('\.case-series-badge'\);/);
  assert.match(body, /seriesBadge\.hidden = title\.type !== 'series';/);
  assert.match(body, /seriesBadge\.setAttribute\('aria-label', t\('seriesBadge'\)\);/);
  // The small label reuses the existing series/movies copy instead of the raw type slug.
  assert.match(body, /title\.type === 'series' \? t\('series'\) : t\('movies'\)/);

  // Absolute + non-interactive: it must not resize the case or add a click target.
  assert.match(css, /\.case-series-badge \{ position: absolute;[\s\S]*?pointer-events: none; \}/);
  assert.match(css, /\.case-series-badge\[hidden\] \{ display: none; \}/);
});

test('the flat viewer marks series covers with the same badge copy', () => {
  assert.match(flat, /function seriesBadge\(copy\)/);
  assert.match(flat, /badge\.setAttribute\('role', 'img'\);/);
  assert.match(flat, /badge\.setAttribute\('aria-label', copy\.seriesBadge \|\| 'series'\);/);
  assert.match(flat, /if \(currentTitle\.type === 'series'\) caption\.append\(seriesBadge\(copy\)\);/);
  assert.match(css, /\.flat-vhs-series-badge \{/);
});

test('the mixed-shelf caption is honest about the merged type', () => {
  const body = functionBody(app, 'async function loadShelf(');
  assert.match(body, /const mixedCaption = credit \|\| state\.series \? ` · \$\{t\('shelfMixed'\)\}` : '';/);
  assert.match(body, /· \$\{sortCaption\}\$\{mixedCaption\}`;/);
});

test('series copy exists in both locales', () => {
  for (const locale of ['pt-BR', 'en-US']) {
    for (const key of ['seriesInShelf', 'seriesBadge', 'shelfMixed']) {
      assert.equal(typeof COPY[locale][key], 'string', `${locale}.${key} must exist`);
      assert.ok(COPY[locale][key].length > 0, `${locale}.${key} must not be empty`);
    }
  }
  assert.equal(COPY['pt-BR'].shelfMixed, 'Filmes e séries');
  assert.equal(COPY['en-US'].shelfMixed, 'Movies and series');
  // The toggle label is its own key; the card text reuses the existing series/movies keys.
  assert.equal(COPY['pt-BR'].series, 'Séries');
  assert.equal(COPY['en-US'].movies, 'Movies');
});
