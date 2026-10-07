const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const page = readFileSync(require.resolve('../public/index.html'), 'utf8');
const app = readFileSync(require.resolve('../public/app.js'), 'utf8');
const css = readFileSync(require.resolve('../public/styles.css'), 'utf8');
const immersive = readFileSync(require.resolve('../public/immersive-shelf.mjs'), 'utf8');
const { COPY } = require('../public/i18n.js');

function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `expected to find ${signature}`);
  const end = source.indexOf('\n  }', start);
  return source.slice(start, end === -1 ? undefined : end);
}

test('the 2D browse menu carries a sort select applied by Ir, never on its own', () => {
  assert.match(page, /<select id="sort-select" aria-label="Sort by" data-i18n-aria-label="sort"><\/select>/);
  assert.match(page, /<span data-i18n="sort">/);
  // The year machine's Ir button submits the form; the sort select must not self-apply on change.
  assert.match(app, /\$\('#year-form'\)\.addEventListener\('submit'[\s\S]*?applyNormalMenuFilters\(\)/);
  assert.doesNotMatch(app, /\$\('#sort-select'\)\.addEventListener\('change'/);
});

test('the sort choices follow the context: year is a person-stand order only', () => {
  assert.match(app, /function sortOptionsForContext\(\) \{\s*return state\.credit \? SORT_OPTIONS : SORT_OPTIONS\.filter\(\(value\) => value !== 'year'\);\s*\}/);
  assert.match(app, /function effectiveSort\(\) \{\s*return sortOptionsForContext\(\)\.includes\(state\.sort\) \? state\.sort : 'relevance';\s*\}/);
  // The select is rebuilt from the context on every shelf load, so the option set always matches.
  const body = functionBody(app, 'function syncSortControls()');
  assert.match(body, /select\.replaceChildren\(\.\.\.sortOptionsForContext\(\)\.map\(/);
  assert.match(body, /select\.value = current;/);
  assert.match(functionBody(app, 'async function loadShelf('), /syncSortControls\(\);/);
});

test('applyNormalMenuFilters reads the sort select, applies it, and leaves a credit stand', () => {
  const body = functionBody(app, 'function applyNormalMenuFilters()');
  assert.match(body, /const sort = normalizeSort\(\$\('#sort-select'\)\.value\);/);
  assert.match(body, /const sortChanged = sort !== state\.sort;/);
  assert.match(body, /if \(!yearChanged && !genreChanged && !sortChanged\) return;/);
  assert.match(body, /leaveCreditStand\(\);/);
  assert.match(body, /if \(sortChanged\) setSort\(sort, false\);/);
});

test('state.sort persists in localStorage and is re-read on load', () => {
  assert.match(app, /const SORT_OPTIONS = Object\.freeze\(\['relevance', 'year', 'rating'\]\);/);
  assert.match(app, /function normalizeSort\(value\) \{\s*return SORT_OPTIONS\.includes\(value\) \? value : 'relevance';\s*\}/);
  assert.match(app, /sort: normalizeSort\(localStorage\.getItem\('locadora\.sort'\)\),/);
  const body = functionBody(app, 'function setSort(value, reload = true)');
  assert.match(body, /state\.sort = normalizeSort\(value\);/);
  assert.match(body, /localStorage\.setItem\('locadora\.sort', state\.sort\);/);
  assert.match(body, /syncSortControls\(\);/);
  assert.match(body, /if \(reload\) loadShelf\(\);/);
  assert.match(app, /syncProviderControls\(\);\s*syncSortControls\(\);/);
});

test('loadShelf sends the effective sort on both the shelf and the credit-stand branches', () => {
  const body = functionBody(app, 'async function loadShelf(');
  const creditLine = body.match(/new URLSearchParams\(\{ person:[\s\S]*?\}\)/)?.[0] || '';
  const shelfLine = body.match(/new URLSearchParams\(\{ genre:[\s\S]*?\}\)/)?.[0] || '';
  assert.match(creditLine, /sort: effectiveSort\(\)/);
  assert.match(shelfLine, /sort: effectiveSort\(\)/);
});

test('the shelf caption shows the active sort for aisles and credit stands', () => {
  const body = functionBody(app, 'async function loadShelf(');
  assert.match(body, /const sortCaption = `\$\{t\('sort'\)\}: \$\{t\(SORT_LABEL_KEYS\[effectiveSort\(\)\]\)\}`;/);
  assert.match(body, /const mixedCaption = credit \|\| state\.series \? ` · \$\{t\('shelfMixed'\)\}` : '';/);
  assert.match(body, /\$\('#shelf-caption'\)\.textContent = `\$\{creditRoleLabel\(credit\)\} · \$\{yearLabel\} · \$\{sortCaption\}\$\{mixedCaption\}`;/);
  assert.match(body, /\$\('#shelf-caption'\)\.textContent = `\$\{t\('aisle'\)\} \$\{aisle\}[\s\S]*?· \$\{sortCaption\}\$\{mixedCaption\}`;/);
});

test('the 3D plaque exposes a third sort field wired to the same setSort', () => {
  // The plaque draft and editor know about the sort field and its localized choices.
  assert.match(immersive, /let draft = \{ genre, year, ignoreStoreYear: Boolean\(plaqueOptions\?\.ignoreStoreYear\), sort: plaqueOptions\?\.sort \|\| 'relevance' \};/);
  assert.match(immersive, /const choices = field === 'sort' \? \(plaqueOptions\.sortChoices \|\| \[\]\) : plaqueOptions\.genres\.map\(\(value\) => \[value, value\]\);/);
  // The current choice is drawn on the plaque texture.
  assert.match(immersive, /context\.fillText\(String\(sortChoice \? sortChoice\[1\] : draft\.sort\)\.toUpperCase\(\), 780, 70, 300\);/);
  // Clicking the sort region opens the editor; the arrows cycle the choice.
  assert.match(immersive, /if \(x > 630 && x < 930\) \{ editPlaque\('sort'\); return; \}/);
  assert.match(immersive, /const choices = \(plaqueOptions\.sortChoices \|\| \[\]\)\.map\(\(\[value\]\) => value\);/);
  // Visual refreshes carry the sort value and localized labels.
  assert.match(immersive, /if \(plaqueOptions && Array\.isArray\(nextVisuals\.sortChoices\)\) plaqueOptions\.sortChoices = nextVisuals\.sortChoices;/);
  assert.match(immersive, /if \(typeof nextVisuals\.sort === 'string'\) draft\.sort = nextVisuals\.sort;/);
  // app.js mounts the plaque with the context's sort field and applies it through setSort.
  assert.match(app, /plaqueOptions: \{[\s\S]*?sort: effectiveSort\(\), sortChoices: sortOptionsForContext\(\)\.map\(\(value\) => \[value, t\(SORT_LABEL_KEYS\[value\]\)\]\), sortLabel: t\('sort'\) \}/);
  assert.match(app, /onConfigure: \(draft\) => \{[\s\S]*?const sortChanged = normalizeSort\(draft\.sort\) !== state\.sort;[\s\S]*?if \(genreChanged \|\| yearChanged \|\| sortChanged\) leaveCreditStand\(\);[\s\S]*?setSort\(draft\.sort, false\);/);
  assert.match(app, /sort: effectiveSort\(\), sortChoices: sortOptionsForContext\(\)\.map\(\(value\) => \[value, t\(SORT_LABEL_KEYS\[value\]\)\]\) \}/);
});

test('sort copy exists in both locales', () => {
  for (const locale of ['pt-BR', 'en-US']) {
    for (const key of ['sort', 'sortRelevance', 'sortYear', 'sortRating']) {
      assert.equal(typeof COPY[locale][key], 'string', `${locale}.${key} must exist`);
      assert.ok(COPY[locale][key].length > 0, `${locale}.${key} must not be empty`);
    }
  }
  assert.equal(COPY['pt-BR'].sortRelevance, 'Relevância');
  assert.equal(COPY['pt-BR'].sortYear, 'Ano');
  assert.equal(COPY['pt-BR'].sortRating, 'Nota');
  assert.equal(COPY['en-US'].sortRelevance, 'Relevance');
  assert.equal(COPY['en-US'].sortYear, 'Year');
  assert.equal(COPY['en-US'].sortRating, 'Rating');
});

test('the sort select reuses the restrained Locadora chrome', () => {
  assert.match(page, /class="browse-select browse-sort-select" for="sort-select"/);
  assert.match(css, /\.browse-menu \.browse-sort-select \{ flex: 0 1 200px; \}/);
});
