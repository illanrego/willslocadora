const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const page = readFileSync(require.resolve('../public/index.html'), 'utf8');
const app = readFileSync(require.resolve('../public/app.js'), 'utf8');
const css = readFileSync(require.resolve('../public/styles.css'), 'utf8');
const { COPY } = require('../public/i18n.js');

test('the catalogue search dialog gains a people switch inside its form', () => {
  const form = page.match(/<form id="catalog-search-form"[\s\S]*?<\/form>/)?.[0] || '';
  assert.match(form, /<input id="catalog-search-people"[^>]*type="checkbox"/);
  assert.match(form, /<label class="catalog-search-people" for="catalog-search-people">/);
  assert.match(form, /data-i18n="searchPeople">Buscar pessoas<\/span>/);
  assert.match(css, /\.source-form \.catalog-search-people \{ display: flex;/);
});

test('searchCatalog switches to the person endpoint and opens the person window', () => {
  assert.match(app, /const peopleMode = Boolean\(\$\('#catalog-search-people'\)\?\.checked\);/);
  assert.match(app, /\/api\/person-search\?\$\{new URLSearchParams\(\{ q: query, locale: state\.locale \}\)\}/);
  assert.match(app, /function renderPersonSearchResult\(person, results\)/);
  assert.match(app, /if \(catalogSearchDialog\.open\) catalogSearchDialog\.close\(\); openPerson\(\{ id: String\(person\.id\), name: person\.name, department: person\.department, profile: person\.profile \}\)/);
  // Empty and count statuses come from the new copy, mirroring the title branch.
  assert.match(app, /status\.textContent = people\.length \? `\$\{people\.length\} \$\{t\('peopleFound'\)\}` : t\('noPeopleFound'\);/);
});

test('the three catalogue search entry points are unchanged', () => {
  assert.match(app, /function openCatalogSearch\(preserve = false\) \{/);
  assert.match(app, /\$\('#catalog-search-open'\)\.addEventListener\('click', \(\) => openCatalogSearch\(\)\)/);
  assert.match(app, /\$\('#immersive-catalog-search-open'\)\.addEventListener\('click', \(\) => openCatalogSearch\(\)\)/);
  assert.match(app, /\$\('#catalog-search-open-counter'\)\.addEventListener\('click', \(\) => openCatalogSearch\(\)\)/);
});

test('person search copy exists in both locales', () => {
  assert.equal(COPY['pt-BR'].searchPeople, 'Buscar pessoas');
  assert.equal(COPY['en-US'].searchPeople, 'Search people');
  assert.equal(COPY['pt-BR'].peopleFound, 'pessoa(s) encontrada(s).');
  assert.equal(COPY['en-US'].peopleFound, 'person(s) found.');
  assert.equal(COPY['pt-BR'].noPeopleFound, 'Nenhuma pessoa encontrada.');
  assert.equal(COPY['en-US'].noPeopleFound, 'No people found.');
});
