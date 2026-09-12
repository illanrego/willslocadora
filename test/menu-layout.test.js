const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const page = readFileSync(require.resolve('../public/index.html'), 'utf8');
const app = readFileSync(require.resolve('../public/app.js'), 'utf8');
const css = readFileSync(require.resolve('../public/styles.css'), 'utf8');
const balcony = readFileSync(require.resolve('../public/balcony.mjs'), 'utf8');
const sessionSupport = readFileSync(require.resolve('../public/session-support.js'), 'utf8');

test('normal browsing exposes subscription choices from the compact browse controls', () => {
  const header = page.match(/<header id="store-header"[\s\S]*?<\/header>/)?.[0] || '';
  assert.match(header, /id="year-form"/);
  assert.match(header, /id="year-go"/);
  assert.match(header, /id="genre-select"/);
  assert.match(header, /id="normal-filters-toggle"[^>]*aria-controls="normal-provider-filters"/);
  assert.match(header, /id="normal-provider-filters"[^>]*hidden/);
  assert.match(header, /data-i18n="streamingHint"/);
  assert.match(header, /class="format-switch"/);
  assert.match(header, /id="provider-checkboxes"/);
  assert.match(header, /data-provider-none>[\s\S]*data-i18n="stremioAll">Stremio \(todos\)<\/span>/);
  assert.doesNotMatch(page, /<aside class="aisle-directory"/);
});


test('watchlist and account use accessible icon buttons that remain visible on phones', () => {
  assert.match(page, /id="watchlist-open"[^>]*aria-label="Assistir depois e Favoritos"/);
  assert.match(page, /id="account-open"[^>]*class="utility-button header-icon-button"[^>]*aria-label="Minha conta"[\s\S]*?<svg aria-hidden="true"/);
  assert.match(css, /\.header-actions \.header-icon-button \{ display: inline-grid;/);
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*\.header-actions \.header-icon-button \{ display: inline-grid;/);
});

test('mobile storefront keeps genre, year, and streaming controls outside the collapsible utility menu', () => {
  assert.match(page, /id="mobile-menu-toggle"[^>]*aria-controls="store-header"[^>]*aria-expanded="false"[^>]*aria-label="Abrir menu"/);
  assert.match(page, /class="mobile-menu-close-icon"[^>]*aria-hidden="true">×<\/span>/);
  assert.match(app, /function setMobileMenu\(open\)/);
  assert.match(app, /classList\.toggle\('is-mobile-menu-open', expanded\)/);
  assert.match(app, /expanded \? 'Fechar menu' : 'Abrir menu'/);
  assert.match(page, /id="normal-filters-toggle"[\s\S]*class="normal-filters-chevron"[^>]*>⌄<\/span>/);
  assert.match(css, /@media \(max-width: 600px\) \{[\s\S]*\.header-actions \{ display: none; \}/);
  assert.match(css, /\.store-header\.is-mobile-menu-open \.header-actions \{/);
  assert.match(css, /\.store-header > \.browse-menu \{/);
  assert.match(css, /\.browse-menu \.browse-select \{ grid-column: 1; order: 1; \}/);
  assert.match(css, /\.browse-menu \.year-machine \{ grid-column: 1; order: 2;/);
  assert.match(css, /\.browse-menu \.normal-filters-toggle \{ grid-column: 1; order: 3;/);
  assert.match(css, /\.browse-menu \.format-switch \{ display: none;/);
  assert.match(css, /\.store-header\.is-mobile-menu-open \.browse-menu \.format-switch \{ display: grid; \}/);
  assert.match(app, /providerPreferenceSet: localStorage\.getItem\('locadora\.providers'\) !== null \|\| localStorage\.getItem\('locadora\.provider'\) !== null/);
  assert.match(app, /state\.providerPreferenceSet = true;[\s\S]*localStorage\.setItem\('locadora\.providers', JSON\.stringify\(state\.providers\)\)/);
  assert.match(app, /input\.checked = state\.providerPreferenceSet && state\.providers\.length === 0/);
  assert.match(app, /setNormalFilters\(!state\.providerPreferenceSet\);/);
  assert.match(page, /id="immersive-provider-checkboxes"[\s\S]*data-provider-none>[\s\S]*data-i18n="stremioAll"/);
  assert.match(page, /id="account-provider-checkboxes"[\s\S]*data-provider-none>[\s\S]*data-i18n="stremioAll"/);
  assert.match(app, /function handleProviderChange\(event\)/);
});

test('normal and immersive modes expose one shared set of preferences', () => {
  assert.match(page, /id="normal-settings-toggle"[^>]*aria-controls="normal-settings"[^>]*aria-expanded="false"/);
  assert.match(page, /id="normal-settings"[^>]*hidden/);
  assert.equal((page.match(/data-audio-toggle="ambience"/g) || []).length, 2);
  assert.equal((page.match(/data-audio-toggle="music"/g) || []).length, 2);
  assert.equal((page.match(/data-lighting-control="brightness"/g) || []).length, 2);
  assert.equal((page.match(/data-lighting-control="warmth"/g) || []).length, 2);
  assert.equal((page.match(/data-locale-toggle/g) || []).length, 2);
  assert.match(page, /id="immersive-locale-toggle"[^>]*data-locale-toggle/);
  assert.match(app, /document\.querySelectorAll\('\[data-locale-toggle\]'\)\.forEach/);
  assert.match(app, /document\.querySelectorAll\('\[data-audio-toggle\]'\)\.forEach/);
  assert.match(app, /document\.querySelectorAll\('\[data-lighting-control\]'\)\.forEach/);
  assert.doesNotMatch(app, /storeAudio\?\.stopAll\(\)/);
  assert.match(css, /\.normal-settings \{ display: grid;/);
});

test('a persistent speaker control mutes and restores all store audio', () => {
  assert.match(page, /id="audio-master-toggle"[^>]*aria-pressed="false"[^>]*aria-label="Silenciar a Locadora"/);
  assert.match(page, /class="audio-waves"[\s\S]*class="audio-muted-mark"/);
  assert.match(css, /\.audio-master-toggle \{[^}]*position: fixed;[^}]*bottom:/);
  assert.match(app, /audioMuted: localStorage\.getItem\('locadora\.audioMuted'\) === 'true'/);
  assert.match(app, /function toggleMasterAudio\(\)[\s\S]*storeAudio\?\.setMuted[\s\S]*localStorage\.setItem\('locadora\.audioMuted'/);
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
  assert.match(page, /id="immersive-filters-toggle"[^>]*>\s*<span[^>]*>⌕<\/span>\s*<span[^>]*data-i18n="brazilStreaming"/);
});

test('Minha conta is a floating destination on the immersive shelf, not a HUD menu action', () => {
  const hud = page.match(/<nav class="immersive-menu-actions"[^>]*>[\s\S]*?<\/nav>/)?.[0] || '';
  assert.doesNotMatch(hud, /immersive-account-open/);
  assert.match(page, /id="immersive-account-open"[^>]*class="immersive-account-button"/);
  assert.match(page, /class="immersive-primary-actions"[\s\S]*id="immersive-account-open"/);
  assert.match(app, /\$\('#immersive-account-open'\)\.addEventListener\('click', \(\) => openAccount\(\)\)/);
  assert.match(css, /\.immersive-account-button/);
});

test('return confirmation dialog is present in the markup', () => {
  assert.match(page, /id="return-confirmation-dialog"[^>]*class="panel-dialog return-confirmation-dialog"/);
  assert.match(css, /@keyframes return-stamp/);
  assert.match(css, /\.return-review-action/);
});

test('locale refresh relabels each genre selector without indexing across both option lists', () => {
  assert.doesNotMatch(app, /#genre-select option, #immersive-genre-select option/);
  assert.match(app, /for \(const select of \[\$\('#genre-select'\), \$\('#immersive-genre-select'\)\]\) \{\s*select\.querySelectorAll\('option'\)\.forEach\(\(option, index\) => \{ option\.textContent = genreLabel\(genres\[index\]\); \}\);/);
});

test('collapsed immersive HUD keeps its nested restore button visible', () => {
  assert.doesNotMatch(css, /\.immersive-hud\.is-collapsed \.immersive-hud-strip > :not\(#immersive-hud-toggle\)/);
  assert.match(css, /\.immersive-hud\.is-collapsed \.immersive-hud-strip > :not\(\.immersive-menu-actions\), \.immersive-hud\.is-collapsed \.immersive-menu-actions > :not\(#immersive-hud-toggle\)/);
});

test('mobile immersive navigation uses an x close control, subtle stand arrows, and a safe-area action dock', () => {
  assert.match(page, /id="immersive-hud-toggle"[^>]*aria-label="Fechar menu da estante"[\s\S]*class="immersive-menu-close-icon"[^>]*>×<\/span>/);
  assert.doesNotMatch(page, /id="immersive-hud-toggle"[^>]*>Ocultar<\/button>/);
  assert.match(page, /id="immersive-previous-stand"[^>]*aria-label="Estante anterior"[\s\S]*<span aria-hidden="true">‹<\/span>/);
  assert.match(page, /id="immersive-next-stand"[^>]*aria-label="Próxima estante"[\s\S]*<span aria-hidden="true">›<\/span>/);
  assert.match(app, /const mobileShelf = window\.matchMedia\('\(max-width: 600px\)'\)\.matches;/);
  assert.match(app, /setImmersiveHudCollapsed\(mobileShelf\);/);
  assert.match(css, /Mobile immersive shelf: compact edge controls and an always-visible safe-area dock/);
  assert.match(css, /\.immersive-primary-actions \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.immersive-stand-label \{ display: none; \}/);
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

test('mobile 3D Balcão separates its compact utility bar from member actions', () => {
  assert.match(page, /id="balcony-panel-open"[^>]*aria-label="Abrir controles do Balcão"[\s\S]*class="balcony-mobile-label">Balcão<\/span>/);
  assert.match(page, /id="balcony-return-shelf"[^>]*aria-label="Voltar à estante imersiva"[\s\S]*class="balcony-back-icon"[^>]*>‹<\/span>/);
  assert.match(css, /Mobile 3D Balcão: a small top utility bar and a separate member dock/);
  assert.match(css, /\.balcony-hud \{[\s\S]*grid-template-columns: 42px minmax\(0, 1fr\) auto;/);
  assert.match(css, /body\[data-store-mode="balcony"\] \.store-dock \{ display: none; \}/);
  assert.match(css, /\.balcony-member-actions \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
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
  assert.match(css, /\.store-dock \.counter-button > span\.basket-spines/);
  assert.doesNotMatch(css, /\.immersive-basket-button \.basket-icon \{ display: none/);
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
  assert.match(app, /event\.target === dialog && beganOnBackdrop && dialog\.id !== 'rental-confirmation-dialog'/);
});

test('the rental desk explains the rental-store flow: choose basket, decide at counter, rent one pack', () => {
  assert.match(page, /class="rental-flow"/);
  assert.match(page, /<strong>Escolha<\/strong>/);
  assert.match(page, /<strong>Escolher \/ alugar fitas<\/strong>/);
  assert.match(page, /<strong>Alugue<\/strong>/);
  assert.match(page, /id="rental-capacity"/);
  assert.match(page, /id="rent-counter"[^>]*>Alugar pacote<\/button>/);
  assert.match(page, /id="rental-confirmation-dialog"/);
  assert.match(app, /showRentalConfirmation\(rental\)/);
  assert.match(app, /setMode\('normal'\)/);
});

test('rental confirmation pairs accessible tape cards with session links and optional support', () => {
  assert.doesNotMatch(page, /rental-confirmation-bag/);
  assert.doesNotMatch(page, /rental-confirmation-bag-count/);
  assert.match(app, /accountTitleItem\(title, t\('sessionBag'\), \{ source: 'rental_confirmation', dialogId: 'rental-confirmation-dialog' \}\)/);
  assert.match(app, /sessionSupport\.renderLinks\(links, title\)/);
  assert.match(page, /id="rental-confirmation-home"[^>]*data-i18n="continueBrowsing"/);
  assert.match(page, /data-i18n="sessionTitle"/);
  assert.match(page, /class="session-support"/);
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

test('rental and return windows open the shared optional support panel', () => {
  assert.match(page, /id="basket-donation"/);
  assert.match(page, /id="tip-jar"/);
  assert.match(page, /id="return-tip-jar"/);
  assert.doesNotMatch(page, /id="immersive-donation-open"/);
  assert.match(app, /\$\('#return-tip-jar'\)\.addEventListener/);
  assert.match(app, /\$\('#return-tip-jar'\)\.addEventListener\('click', sessionSupport\.openDonation\)/);
  assert.match(page, /id="donation-dialog"/);
});

test('the member destination is a detailed Member Section rather than a generic account panel', () => {
  assert.match(page, /<h2>Carteirinha<\/h2>/);
  assert.match(page, /id="account-member-since"/);
  assert.match(page, /id="account-active-count"/);
  assert.match(page, /id="account-history-count"/);
});

test('VHS inspection offers the basket as a floating action without duplicating streamings', () => {
  assert.match(app, /basket\.textContent = 'Botar na cesta';/);
  assert.match(app, /memberActions\.append\(basket\)/);
  assert.match(app, /utilityActions\.append\(savedActions, titleReview, teaser, ownerAction\)/);
  assert.doesNotMatch(app, /title-streaming-action/);
  assert.match(app, /savedActions\.className = 'title-saved-actions';/);
  assert.match(app, /basket\.addEventListener\('click', \(\) => \{[\s\S]*toggleCounter\(current\)/);
  const viewer = readFileSync(require.resolve('../public/vhs-3d.mjs'), 'utf8');
  assert.match(viewer, /atCounter \? copy\.returnTape : copy\.toBasket/);
});

test('VHS inspection saves star and plus actions to their matching list with confirmation', () => {
  assert.match(page, /id="saved-added-dialog"[^>]*class="panel-dialog saved-added-dialog"/);
  assert.match(page, /id="saved-added-message"[^>]*role="status"/);
  assert.match(page, /id="saved-added-ok"[^>]*value="ok">OK<\/button>/);
  assert.match(app, /async function saveTitleCollection\(title, collection, \{ confirm = false \} = \{\}\)/);
  assert.match(app, /if \(!active && result\.membership && confirm\) showSavedCollectionAdded\(title, collection\)/);
  assert.match(app, /saveTitleCollection\(activeViewerTitle, collection, \{ confirm: true \}\)/);
  assert.match(app, /onWatchLater: \(\) => \{ if \(activeViewerTitle\) saveTitleCollection\(activeViewerTitle, 'watch_later', \{ confirm: true \}\); \}/);
  assert.match(app, /onFavorite: \(\) => \{ if \(activeViewerTitle\) saveTitleCollection\(activeViewerTitle, 'favorite', \{ confirm: true \}\); \}/);
  assert.match(app, /function showSavedCollectionAdded\(title, collection\)/);
  assert.match(app, /const label = collection === 'favorite' \? 'Favoritos' : 'Assistir depois'/);
  assert.match(app, /\$\('#saved-added-dialog'\)\.addEventListener\('cancel', \(event\) => event\.preventDefault\(\)\)/);
});

test('mobile VHS inspection routes the red tape streamings button through the rent-or-watch gate', () => {
  assert.match(app, /onAvailability: \(\) => \{\s*if \(activeViewerTitle\) openStreamingGate\(activeViewerTitle\);\s*\}/);
  assert.match(app, /function openStreamingGate\(title\)/);
  assert.match(app, /\$\('#streaming-gate-dialog'\)\.showModal\(\)/);
  assert.match(app, /\$\('#streaming-gate-dialog'\)\.addEventListener\('close',/);
  assert.match(app, /titleReview\.textContent = 'Avaliações';/);
  assert.doesNotMatch(app, /reviewIcon\.textContent = '☆'/);
  assert.doesNotMatch(app, /title-streaming-action/);
});

test('a mobile tape action cannot immediately dismiss the dialog it opens', () => {
  assert.match(app, /const dialogBackdropPresses = new WeakSet\(\)/);
  assert.match(app, /dialog\.addEventListener\('pointerdown',[\s\S]*event\.target === dialog[\s\S]*dialogBackdropPresses\.add\(dialog\)/);
  assert.match(app, /const beganOnBackdrop = dialogBackdropPresses\.delete\(dialog\)/);
  assert.match(app, /event\.target === dialog && beganOnBackdrop/);
});

test('tape inspection omits the support prompt while other dialogs retain their support entries', () => {
  assert.match(sessionSupport, /dialog\.id === 'title-dialog'/);
  assert.match(sessionSupport, /support\.classList\.add\('dialog-support'\); dialog\.append\(support\)/);
});
