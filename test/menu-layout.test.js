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


test('watchlist and account use accessible icon buttons that remain visible on phones', () => {
  assert.match(page, /id="watchlist-open"[^>]*aria-label="Assistir depois e Favoritos"/);
  assert.match(page, /id="account-open"[^>]*class="utility-button header-icon-button"[^>]*aria-label="Minha conta"[\s\S]*?<svg aria-hidden="true"/);
  assert.match(css, /\.header-actions \.header-icon-button \{ display: inline-grid;/);
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*\.header-actions \.header-icon-button \{ display: inline-grid;/);
});

test('dialog and member cards use the uniform raised Locadora frame instead of accent-edge stripes', () => {
  const cardFrameStart = css.indexOf('.panel-dialog .counter-item, .panel-dialog .source-item {');
  const cardFrameEnd = css.indexOf('.panel-dialog button:not(:disabled)', cardFrameStart);
  const cardFrame = css.slice(cardFrameStart, cardFrameEnd);
  assert.match(cardFrame, /border: 2px solid #715842;/);
  assert.match(cardFrame, /box-shadow: inset 0 1px 0 rgba\(255,255,255,.06\), 0 4px 0 rgba\(0,0,0,.28\);/);
  assert.doesNotMatch(cardFrame, /border-left:/);
  assert.match(css, /\.member-stats div \{[^}]*border: 2px solid #765640;[^}]*box-shadow: inset 0 1px 0 rgba\(255,255,255,.06\), 0 4px 0 rgba\(0,0,0,.3\);/);
});

test('catalogue search is an accessible native dialog', () => {
  assert.match(page, /<dialog id="catalog-search-dialog" class="panel-dialog catalog-search-dialog">/);
  assert.match(page, /<form id="catalog-search-form"[^>]*>/);
  assert.match(page, /<input id="catalog-search-input"[^>]*type="search"[^>]*minlength="2"/);
  assert.match(page, /id="catalog-search-status"[^>]*role="status"/);
  assert.match(page, /id="catalog-search-results"/);
  assert.match(app, /function openCatalogSearch\(preserve = false\)/);
  assert.match(app, /api\(`\/api\/search\?\$\{new URLSearchParams/);
  assert.match(app, /let returnToCatalogSearch = false;/);
  assert.match(app, /openCatalogSearch\(true\)/);
});
test('immersive navigation keeps Balcão and 2D as persistent floating destinations', () => {
  assert.match(page, /id="immersive-balcony-open"[^>]*aria-label="Abrir Balcão de aluguel"/);
  assert.match(page, /id="immersive-2d-open"[^>]*aria-label="Voltar ao modo 2D"/);
  assert.doesNotMatch(page, /class="immersive-destination"/);
  assert.doesNotMatch(page, /id="balcony-toggle"/);
  assert.match(app, /\$\('#immersive-balcony-open'\)\.addEventListener\('click', \(\) => setMode\('balcony'\)\)/);
  assert.match(app, /\$\('#immersive-2d-open'\)\.addEventListener\('click', \(\) => setMode\('normal'\)\)/);
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

test('rental and return use separate Balcão windows', () => {
  assert.match(page, /id="catalog-search-open-counter"[^>]*>Pesquisar títulos<\/button>/);
  assert.match(page, /id="returns-dialog"/);
  assert.match(page, /id="return-panel-status"[^>]*role="status"/);
  const rentalDialog = page.match(/<dialog id="balcony-dialog"[\s\S]*?<\/dialog>/)?.[0] || '';
  const returnsDialog = page.match(/<dialog id="returns-dialog"[\s\S]*?<\/dialog>/)?.[0] || '';
  assert.doesNotMatch(rentalDialog, /balcony-return-controls/);
  assert.doesNotMatch(returnsDialog, /balcony-rental-controls/);
  assert.match(returnsDialog, /balcony-rented-list/);
  assert.match(app, /function openRentalDesk\(\) \{[\s\S]*if \(!\$\('#balcony-dialog'\)\.open\) \$\('#balcony-dialog'\)\.showModal\(\);\s*\}/);
  assert.match(app, /function openReturnWindow\(message = ''\)/);
  assert.match(app, /\$\('#catalog-search-open-counter'\)\.addEventListener\('click', openCatalogSearch\)/);
  assert.match(app, /window\.requestAnimationFrame\(openReturnWindow\)/);
});

test('immersive mode exposes a basket independently from the Balcony', () => {
  assert.match(page, /class="immersive-picker immersive-genre-picker"/);
  assert.match(page, /id="immersive-basket-open"[^>]*aria-controls="basket-dialog"[^>]*>\s*[\s\S]*immersive-basket-label/);
  assert.match(page, /id="immersive-2d-open"/);
  assert.match(page, /id="basket-dialog"/);
  assert.match(page, /id="take-basket-counter"[^>]*>Levar ao Balcão<\/button>/);
  assert.match(app, /\$\('#immersive-basket-open'\)\.addEventListener\('click', openBasket\)/);
  assert.match(app, /function takeBasketToCounter\(\)[\s\S]*state\.mode === 'immersive'[\s\S]*setMode\('balcony'\)/);
  assert.doesNotMatch(app, /\$\('#immersive-basket-open'\)\.addEventListener\('click', openRentalDesk\)/);
  assert.match(css, /\.immersive-genre-picker/);
  assert.match(css, /\.immersive-genre-picker select/);
  assert.match(css, /\.immersive-hud \{[^}]*position: absolute;/);
  assert.match(css, /\.immersive-basket-button/);
  assert.match(page, /id="immersive-balcony-open"[^>]*aria-label="Abrir Balcão de aluguel"/);
  assert.match(app, /\$\('#immersive-balcony-open'\)\.addEventListener\('click', \(\) => setMode\('balcony'\)\)/);
  assert.match(css, /Floating navigation uses cream panels and dark ink/);
  assert.match(css, /\.immersive-2d-button/);
});

test('the normal header opens Cesta first and reaches the 2D Balcony through its CTA', () => {
  assert.match(page, /id="counter-open"[^>]*>[\s\S]*data-i18n="basket"[\s\S]*id="counter-count"/);
  assert.match(app, /\$\('#counter-open'\)\.addEventListener\('click', openBasket\)/);
  assert.match(app, /function takeBasketToCounter\(\)[\s\S]*openRentalDesk\(\)/);
});


test('the normal header opens catalogue search without requiring a Cesta selection', () => {
  assert.match(page, /id="catalog-search-open"[^>]*>Pesquisar títulos<\/button>/);
  assert.match(app, /\$\('#catalog-search-open'\)\.addEventListener\('click', openCatalogSearch\)/);
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
  assert.match(app, /list\.replaceChildren\(\.\.\.titles\.map\(\(title\) => accountTitleItem\(title, 'na sacola', \{ source: 'rental_confirmation', dialogId: 'rental-confirmation-dialog' \}\)\)\)/);
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

test('rental and return windows keep donations visible without activating payment', () => {
  assert.match(page, /id="basket-donation"/);
  assert.match(page, /id="tip-jar"/);
  assert.match(page, /id="return-tip-jar"/);
  assert.doesNotMatch(page, /id="immersive-donation-open"/);
  assert.match(app, /\$\('#return-tip-jar'\)\.addEventListener/);
  assert.match(app, /function donationMessage\(\)/);
});

test('the member destination is a detailed Member Section rather than a generic account panel', () => {
  assert.match(page, /<h2>Seção do membro<\/h2>/);
  assert.match(page, /id="account-member-since"/);
  assert.match(page, /id="account-active-count"/);
  assert.match(page, /id="account-history-count"/);
});

test('VHS inspection offers the basket as a floating action and labels its tape-back action consistently', () => {
  assert.match(app, /basket\.textContent = 'Botar na cesta';/);
  assert.match(app, /memberActions\.append\(basket\)/);
  assert.match(app, /utilityActions\.append\(savedActions, titleReview, teaser\)/);
  assert.match(app, /savedActions\.className = 'title-saved-actions';/);
  assert.match(app, /basket\.addEventListener\('click', \(\) => \{[\s\S]*toggleCounter\(current\)/);
  const viewer = readFileSync(require.resolve('../public/vhs-3d.mjs'), 'utf8');
  assert.match(viewer, /atCounter \? copy\.returnTape : copy\.toBasket/);
});
