const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const page = readFileSync(require.resolve('../public/index.html'), 'utf8');
const app = readFileSync(require.resolve('../public/app.js'), 'utf8');
const css = readFileSync(require.resolve('../public/styles.css'), 'utf8');
const balcony = readFileSync(require.resolve('../public/balcony.mjs'), 'utf8');

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
  assert.match(app, /function openBalconySearch\(preserve = false\)/);
  assert.match(app, /api\(`\/api\/search\?\$\{new URLSearchParams/);
  assert.match(app, /let returnToBalconySearch = false;/);
  assert.match(app, /openBalconySearch\(true\)/);
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

test('the rental desk keeps catalogue search and returns behind the Cesta-to-Balcão transition', () => {
  assert.match(page, /id="counter-search"[^>]*>/);
  assert.match(page, /id="rent-counter"/);
  assert.match(page, /id="balcony-rented-list"/);
  assert.match(app, /function openRentalDesk\(\) \{[\s\S]*renderBalconyPanel\(\);\s*if \(!\$\('#balcony-dialog'\)\.open\) \$\('#balcony-dialog'\)\.showModal\(\);\s*\}/);
  assert.match(app, /\$\('#counter-open'\)\.addEventListener\('click', openBasket\)/);
  assert.match(app, /\$\('#counter-search'\)\.addEventListener\('click', openBalconySearch\)/);
});

test('immersive mode exposes a basket independently from the Balcony', () => {
  assert.match(page, /class="immersive-picker immersive-genre-picker"/);
  assert.match(page, /id="immersive-basket-open"[^>]*aria-controls="basket-dialog"/);
  assert.match(page, /id="basket-dialog"/);
  assert.match(page, /id="take-basket-counter"[^>]*>Levar ao Balcão<\/button>/);
  assert.match(app, /\$\('#immersive-basket-open'\)\.addEventListener\('click', openBasket\)/);
  assert.match(app, /function takeBasketToCounter\(\)[\s\S]*state\.mode === 'immersive'[\s\S]*setMode\('balcony'\)/);
  assert.doesNotMatch(app, /\$\('#immersive-basket-open'\)\.addEventListener\('click', openRentalDesk\)/);
  assert.match(css, /\.immersive-genre-picker/);
  assert.match(css, /\.immersive-genre-picker select/);
  assert.match(css, /\.immersive-hud \{[^}]*position: absolute;/);
  assert.match(css, /\.immersive-basket-button/);
});

test('the normal header opens Cesta first and reaches the 2D Balcony through its CTA', () => {
  assert.match(page, /id="counter-open"[^>]*>[\s\S]*data-i18n="basket"[\s\S]*id="counter-count"/);
  assert.match(app, /\$\('#counter-open'\)\.addEventListener\('click', openBasket\)/);
  assert.match(app, /function takeBasketToCounter\(\)[\s\S]*openRentalDesk\(\)/);
});


test('the normal header opens Balcony catalogue search without requiring a Cesta selection', () => {
  assert.match(page, /id="balcony-search-open"[^>]*>Pesquisar no Balcão<\/button>/);
  assert.match(app, /\$\('#balcony-search-open'\)\.addEventListener\('click', openBalconySearch\)/);
});

test('Balcão decisions use a temporary subset instead of deleting titles from Cesta', () => {
  assert.match(app, /let balconySelection = null/);
  assert.match(app, /function beginCounterDecision\(\)[\s\S]*prepareCounterSelection\(state\.counter\)/);
  assert.match(app, /function removeFromCounterDecision\(title\)[\s\S]*removeCounterSelection\(balconySelection, title\)/);
  assert.match(app, /const titles = counterDecisionTitles\(\)\.map\(serializeRentalTitle\)/);
  assert.match(app, /if \(titles\.some\(\(title\) => !title\)\) throw new Error/);
  assert.match(app, /const rental = validateRentalResponse\(response, titles\)/);
});

test('a successful rental clears the complete Cesta while retaining the server-confirmed active package', () => {
  const rentStart = app.indexOf('async function rentCounter()');
  const rentEnd = app.indexOf('async function resumePendingRental()', rentStart);
  const rent = app.slice(rentStart, rentEnd);
  assert.match(rent, /state\.counter = \[\];/);
  assert.doesNotMatch(rent, /rentedKeys/);
  assert.ok(rent.indexOf('showRentalConfirmation(rental)') < rent.indexOf('await refreshMemberData()'));
  assert.match(rent, /try \{ await refreshMemberData\(\); \}/);
});

test('rental confirmation has one deliberate conclusion and cannot be dismissed accidentally', () => {
  assert.match(app, /rental-confirmation-dialog'\)\.addEventListener\('cancel', \(event\) => event\.preventDefault\(\)\)/);
  assert.match(app, /event\.target === dialog && dialog\.id !== 'rental-confirmation-dialog'/);
});

test('the rental desk explains the rental-store flow: choose basket, decide at counter, rent one pack', () => {
  assert.match(page, /class="rental-flow"/);
  assert.match(page, /<strong>Escolha<\/strong>/);
  assert.match(page, /<strong>Decida no balcão<\/strong>/);
  assert.match(page, /<strong>Alugue<\/strong>/);
  assert.match(page, /id="rental-capacity"/);
  assert.match(page, /id="rent-counter"[^>]*>Alugar pacote<\/button>/);
  assert.match(page, /id="rental-confirmation-dialog"/);
  assert.match(app, /showRentalConfirmation\(rental\)/);
  assert.match(app, /setMode\('normal'\)/);
});

test('rental confirmation uses the same 2D tape cards as the counter rather than a decorative 3D bag', () => {
  assert.doesNotMatch(page, /rental-confirmation-bag/);
  assert.doesNotMatch(page, /rental-confirmation-bag-count/);
  assert.match(app, /list\.replaceChildren\(\.\.\.titles\.map\(\(title\) => accountTitleItem\(title, 'na sacola'\)\)\)/);
  assert.match(page, /id="rental-confirmation-home"[^>]*>Voltar para a página inicial<\/button>/);
  assert.doesNotMatch(page, /Close rental confirmation/);
});

test('the return desk batches selected rented tapes with watched-state choices', () => {
  assert.match(page, /id="return-selected-rentals"[^>]*>Devolver fitas selecionadas<\/button>/);
  assert.match(app, /pendingReturns = new Map\(\)/);
  assert.match(app, /function togglePendingReturn\(title, checked\)/);
  assert.match(app, /async function returnSelectedRentals\(\)/);
  assert.match(app, /submitRentalReturns\(entries/);
});


test('repeat rentals remain available through the shared three-active-tape cap and the Balcony renders the current decision', () => {
  assert.match(app, /function availableRentalSlots\(\)/);
  assert.match(app, /if \(rentalRequestInFlight \|\| !decision\.length\) \{ openRentalDesk\(\); return; \}/);
  assert.match(app, /const titles = rental\.counter;/);
  assert.doesNotMatch(app, /rental\.counter\.length \? rental\.counter : rental\.rented\?\.titles/);
  assert.match(balcony, /if \(rental\.counter\.length\) \{/);
  assert.match(balcony, /rental\.counter\.forEach/);
  assert.doesNotMatch(balcony, /rental\.rented/);
});

test('the optional tip jar only appears in the 3D Balcony context', () => {
  assert.match(page, /id="tip-jar"/);
  assert.match(app, /\$\('#tip-jar'\)\.hidden = state\.mode !== 'balcony'/);
});

test('the member destination is a detailed Member Section rather than a generic account panel', () => {
  assert.match(page, /<h2>Seção do membro<\/h2>/);
  assert.match(page, /id="account-member-since"/);
  assert.match(page, /id="account-active-count"/);
  assert.match(page, /id="account-history-count"/);
});

test('VHS inspection offers the basket as a floating action and labels its tape-back action consistently', () => {
  assert.match(app, /basket\.textContent = 'Botar na cesta';/);
  assert.match(app, /memberActions\.append\(basket, save\)/);
  assert.match(app, /basket\.addEventListener\('click', \(\) => \{[\s\S]*toggleCounter\(current\)/);
  const viewer = readFileSync(require.resolve('../public/vhs-3d.mjs'), 'utf8');
  assert.match(viewer, /atCounter \? copy\.returnTape : copy\.toBasket/);
});
