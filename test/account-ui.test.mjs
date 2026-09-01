import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../workers/locadora-data/src/index.mjs', import.meta.url), 'utf8');

test('account setup calls the handle a username rather than a public name', () => {
  assert.match(page, /<label for="username-input">Nome de usuário<\/label>/);
  assert.doesNotMatch(page, /Nome público/);
});

test('username validation remains valid in modern HTML pattern mode and debounce captures the value synchronously', () => {
  assert.ok(page.includes('pattern="[A-Za-z0-9_\\-]+"'));
  assert.match(app, /const username = event\.currentTarget\.value;\s*usernameAvailabilityTimer = window\.setTimeout\(\(\) => checkUsernameAvailability\(username\), 250\)/);
  assert.doesNotMatch(app, /setTimeout\([^\n]*event\.currentTarget/);
});

test('Cesta and Balcão keep review choices separate from the final three-rental request', () => {
  assert.match(page, /id="basket-added-dialog"[^>]*class="panel-dialog basket-added-dialog"/);
  assert.match(app, /const MAX_CESTA_TITLES = 15/);
  assert.match(app, /function availableRentalSlots\(\)/);
  assert.match(app, /Você ainda pode alugar/);
  assert.match(app, /Pesquisar títulos/);
  assert.match(app, /\$\{state\.counter\.length\} de \$\{MAX_CESTA_TITLES\} fitas escolhidas/);
  assert.match(app, /Escolha até \$\{MAX_CESTA_TITLES\} fitas nas estantes/);
  assert.match(app, /image\.src = title\.poster \? posterTextureUrl\(title\.poster\) : COVER_PLACEHOLDER_URL;[\s\S]*image\.addEventListener\('error', \(\) => \{ image\.src = COVER_PLACEHOLDER_URL; \}/);
});


test('adding a tape confirms its title in an OK dialog and animates the basket controls', () => {
  assert.match(page, /id="basket-added-message"[^>]*role="status"/);
  assert.match(page, /id="basket-added-ok"[^>]*value="ok"[^>]*>OK<\/button>/);
  assert.doesNotMatch(page, /id="basket-confirmation"/);
  assert.match(app, /function showBasketAdded\(title\) \{[\s\S]*basket-added-message'\)\.textContent = `“\$\{title\.name\}” foi adicionada à Cesta\.`;[\s\S]*basket-added-dialog'\)\.showModal\(\)/);
  assert.match(app, /function animateBasketAdded\(\) \{[\s\S]*counter-open'[\s\S]*immersive-basket-open/);
  assert.match(app, /if \(result\.reason === 'added'\) \{\s*animateBasketAdded\(\);\s*showBasketAdded\(title\);\s*\}/);
  assert.match(styles, /@keyframes basket-added/);
  assert.match(styles, /\.counter-button\.is-basket-added, \.immersive-basket-button\.is-basket-added/);
  assert.doesNotMatch(styles, /\.basket-confirmation/);
});


test('catalogue search keeps its Cesta action available with active rentals until fifteen titles', () => {
  const searchStart = app.indexOf('async function searchCatalog()');
  const searchEnd = app.indexOf('function setYear', searchStart);
  const search = app.slice(searchStart, searchEnd);
  assert.match(search, /state\.counter\.length >= MAX_CESTA_TITLES/);
  assert.doesNotMatch(search, /state\.rental\.rented/);
});

test('yellow actions use dark text and return submission retains a selected subset', () => {
  const styles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.yellow-action[\s\S]*color: var\(--black\)/);
  assert.match(app, /const submitted = \[\.\.\.pendingReturns\.entries\(\)\]/);
});

test('member and rented-package cards hydrate TMDB covers and metadata before inspection', () => {
  assert.match(app, /item\.className = 'counter-item account-title-item'/);
  assert.match(app, /function refreshAccountTitleCard\(title, meta, \{ image, name, detail \}\)/);
  assert.match(app, /const cardLocale = state\.locale;\s*const cardSessionVersion = memberSessionVersion;/);
  assert.match(app, /if \(!item\.isConnected \|\| cardLocale !== state\.locale \|\| cardSessionVersion !== memberSessionVersion\) return/);
  assert.match(app, /loadTitleMetadata\(memberTitle\)\.then/);
  assert.match(app, /const memberTitle = memberTitleForViewer\(title\);/);
  assert.match(app, /loadTitleMetadata\(memberTitle\)\.then/);
  assert.match(app, /await loadTitleMetadata\(memberTitle\)/);
  assert.match(app, /openTitle\(memberTitle, false\)/);
  assert.match(app, /data\.activeRental && activeTitles\.length/);
});

test('member rental cards keep covers, details, and Inspect action in separate columns', () => {
  const styles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.account-title-item\s*\{[^}]*grid-template-columns:\s*54px minmax\(0, 1fr\) auto/);
  assert.match(styles, /\.account-title-inspect\s*\{[^}]*justify-self:\s*end/);
  assert.doesNotMatch(styles, /\.watchlist-item\s*\{\s*grid-template-columns:\s*1fr auto/);
});

test('tape inspection exposes public half-star reviews and gates the review form on watched history', () => {
  assert.match(page, /<dialog id="title-reviews-dialog" class="panel-dialog title-reviews-dialog"/);
  assert.match(page, /id="title-reviews-content"/);
  assert.match(app, /function openTitleReviews\(title\)/);
  assert.match(app, /\/v1\/titles\/\$\{route\.type\}\/\$\{route\.tmdbId\}\/reviews/);
  assert.match(app, /function hasWatchedTitle\(title\)/);
  assert.match(app, /history\.some\(\(entry\) => entry\.watchedStatus === 'watched'/);
  assert.match(app, /\/v1\/titles\/\$\{route\.type\}\/\$\{route\.tmdbId\}\/review/);
  assert.match(app, /titleReview\.textContent = '★ Avaliações';/);
  assert.match(app, /utilityActions\.className = 'title-utility-actions';/);
  assert.match(app, /teaser\.className = 'title-review-teaser';/);
  assert.match(app, /byline\.textContent = `@\$\{review\.username\} · \$\{formatReviewRating\(review\.rating\)\}`/);
  assert.match(app, /excerpt\.textContent = reviewExcerpt\(review\.body\)/);
  assert.match(app, /savedActions\.className = 'title-saved-actions';/);
  assert.match(app, /button\.dataset\.savedCollection = collection/);
  assert.match(styles, /\.title-utility-actions/);
  assert.match(styles, /\.title-review-teaser/);
  assert.match(styles, /\.review-rating-picker/);
  assert.match(styles, /\.review-card/);
});

test('account dialog has a member overview with active rentals and expandable history', () => {
  assert.match(page, /id="account-overview"/);
  assert.match(page, /id="account-active-rentals"/);
  assert.match(page, /id="account-history"/);
  assert.match(page, /id="account-history-more"/);
  assert.match(app, /function renderAccountOverview\(\)/);
  assert.match(app, /function loadMoreAccountHistory\(\)/);
});

test('account sign-in closes the Locadora dialog before opening Clerk', () => {
  assert.match(app, /#account-sign-in'\)\.addEventListener\('click', async \(\) => \{\s*\$\('#account-dialog'\)\.close\(\);\s*try \{ await window\.LocadoraAccount\.signIn\(\);/);
});

test('a rent confirmation interrupted by identity setup resumes the same basket', () => {
  assert.match(app, /pendingRental = true/);
  assert.match(app, /async function resumePendingRental\(\)/);
  assert.match(app, /await resumePendingRental\(\)/);
  assert.match(app, /body: JSON\.stringify\(\{ titles \}\)/);
});

test('signed-out rental state clears persisted and 3D Balcony surfaces', () => {
  assert.match(app, /if \(signedOut\) \{\s*state\.rental = \{ rented: null, returned: \[\] \};\s*pendingRental = false;\s*balconySelection = null;\s*saveCounter\(\);\s*renderBalconyPanel\(\);\s*renderReturnPanel\(\);\s*refreshBalcony\(\);\s*\}/);
});

test('returning rented tapes posts watched outcomes through the shared return submitter', () => {
  assert.match(app, /async function returnSelectedRentals\(\)/);
  assert.match(app, /submitRentalReturns\([\s\S]*window\.LocadoraAccount\.request\(`\/v1\/rental-items\/\$\{itemId\}\/return`/);
  assert.match(app, /body: JSON\.stringify\(\{ watchedStatus \}\)/);
});

test('Minha conta offers one package-level return route and preserves canonical rental titles for inspection', () => {
  assert.match(page, /id="account-return-counter"[^>]*>Devolver no Balcão<\/button>/);
  assert.match(app, /\$\('#account-return-counter'\)\.hidden = !rental\?\.titles\.length/);
  assert.doesNotMatch(app, /returns\.textContent = 'Devolver no Balcão'/);
  assert.match(app, /function memberTitleForViewer\(title\)/);
  assert.match(app, /openTitle\(memberTitle, false\)/);
});

test('return tape selection enables and accessibly names its watched-state control', () => {
  assert.match(app, /statusSelect\.setAttribute\('aria-label', `Estado de exibição de \$\{title\.name\}`\)/);
  assert.match(app, /checkbox\.addEventListener\('change', \(\) => \{\s*statusSelect\.disabled = !checkbox\.checked;/);
  assert.match(app, /watchedStatus: pendingReturns\.get\(itemId\)\?\.watchedStatus \|\| 'unknown'/);
});

test('Minha conta is reachable in immersive modes and routes returns through the 3D Balcony', () => {
  assert.match(page, /id="immersive-account-open"/);
  assert.match(page, /id="balcony-account-open"/);
  assert.match(app, /\$\('#immersive-account-open'\)\.addEventListener\('click', \(\) => openAccount\(\)\)/);
  assert.match(app, /\$\('#balcony-account-open'\)\.addEventListener\('click', \(\) => openAccount\(\)\)/);
  assert.match(app, /function openReturnDesk\(\)[\s\S]*state\.mode === 'immersive'[\s\S]*setMode\('balcony'\)[\s\S]*openReturnWindow/);
});

test('returning rented tapes refreshes canonical state even when only part of the batch succeeds', () => {
  assert.match(app, /await submitRentalReturns\(/);
  assert.match(app, /for \(const itemId of result\.succeeded\) pendingReturns\.delete\(itemId\)/);
  assert.match(app, /const succeeded = new Set\(result\.succeeded\);[\s\S]*rented\.titles = rented\.titles\.filter\(\(title\) => !succeeded\.has\(title\.rentalItemId\)\)/);
  assert.match(app, /rented\.titles = rented\.titles\.filter[\s\S]*renderAccountOverview\(\);/);
  assert.match(app, /try \{ await refreshMemberData\(\); \}/);
  assert.match(app, /result\.failed\.length/);
});

test('rental and grouped return mutations are bound to the initiating account session', () => {
  const rent = app.slice(app.indexOf('async function rentCounter()'), app.indexOf('async function resumePendingRental()'));
  assert.match(rent, /const sessionVersion = memberSessionVersion/);
  assert.match(rent, /if \(!state\.member\.signedIn \|\| sessionVersion !== memberSessionVersion\) return/);
  const returns = app.slice(app.indexOf('async function returnSelectedRentals()'), app.indexOf('function togglePendingReturn'));
  assert.match(returns, /const sessionVersion = memberSessionVersion/);
  assert.match(returns, /if \(!state\.member\.signedIn \|\| sessionVersion !== memberSessionVersion\) throw new Error\('rental_session_changed'\)/);
  assert.match(returns, /if \(!state\.member\.signedIn \|\| sessionVersion !== memberSessionVersion\) return/);
});

test('stale member responses cannot restore a signed-out or switched account', () => {
  assert.match(app, /let memberSessionVersion = 0/);
  assert.match(app, /const sessionVersion = memberSessionVersion;[\s\S]*if \(!state\.member\.signedIn \|\| sessionVersion !== memberSessionVersion \|\| refreshVersion !== memberRefreshVersion\) return;/);
  assert.match(app, /LocadoraAccount\.onChange\(async \(next\) => \{\s*memberSessionVersion \+= 1;\s*pendingReturns\.clear\(\);/);
});

test('account errors and rental prompts survive the account rerender', () => {
  assert.match(app, /function openAccount\(message = ''\)/);
  assert.match(app, /if \(message\) \$\('#account-status'\)\.textContent = message/);
  assert.doesNotMatch(app, /textContent = error\.message; openAccount\(\)/);
});

test('private account API supports paged history and authenticated username availability feedback', () => {
  assert.match(worker, /url\.pathname === '\/v1\/history'/);
  assert.match(worker, /url\.pathname\.match\(\/\^\\\/v1\\\/usernames/);
  assert.match(worker, /async listHistory\(userId, offset\)/);
  assert.match(worker, /async isUsernameAvailable\(userId, username\)/);
  assert.match(app, /\/v1\/usernames\/\$\{encodeURIComponent\(username\)\}/);
});

test('title inspection records a source and restores that source after closing', () => {
  assert.match(app, /let inspectionOrigin = null/);
  assert.match(app, /function openTitleFromOrigin\(title, origin/);
  assert.match(app, /let inspectionOrigin = null/);
  assert.match(app, /function openTitleFromOrigin\(title, origin/);
  assert.match(app, /inspectionOrigin = \{/);
  assert.match(app, /function restoreInspectionOrigin\(\)/);
  assert.match(app, /origin\.dialogId/);
  assert.match(app, /origin\.focusId/);
  assert.match(app, /origin\.scrollTop/);
});

test('all list-origin title actions use the shared inspection entry point', () => {
  assert.match(app, /openTitleFromOrigin\(localRentalTitle\(title\), \{ source: activeSavedCollection/);
  assert.match(app, /activeSavedCollection = 'favorite'/);
  assert.match(app, /openTitleFromOrigin\(title, \{ source: 'cesta'/);
  assert.match(app, /openTitleFromOrigin\(title, \{ source: 'balcony'/);
});

test('saved collections expose independent Assistir depois and Favoritos controls', () => {
  assert.match(page, /id="saved-watch-later-tab"/);
  assert.match(page, /id="saved-favorites-tab"/);
  assert.match(app, /function saveTitleCollection\(title, collection, \{ confirm = false \} = \{\}\)/);
  assert.match(app, /!\['watch_later', 'favorite'\]\.includes\(collection\)/);
  assert.match(app, /Object\.values\(data\.collections \|\| \{\}\)\.flat\(\)/);
  assert.match(app, /`\/v1\/collections\/\$\{collection\}`/);
  assert.match(app, /aria-pressed/);
});

test('saved title actions reconcile UUID-backed memberships with the canonical TMDB title', () => {
  assert.match(app, /const id = String\(title\?\.tmdbId \?\? title\?\.tmdb_id \?\? title\?\.id/);
  assert.match(app, /const result = await window\.LocadoraAccount\.request\(path/);
  assert.match(app, /state\.member\.savedTitles = \[\.\.\.state\.member\.savedTitles, result\.membership\]/);
  assert.match(app, /syncTitleSavedActions\(\);/);
});

test('saved title clicks update the local icon list without opening Minha conta when signed out', () => {
  assert.match(app, /if \(!state\.member\.signedIn \|\| !state\.member\.profile\) \{/);
  assert.match(app, /function toggleLocalSavedCollection\(title, collection\)/);
  assert.match(app, /toggleLocalSavedCollection\(title, collection\);/);
  assert.match(app, /if \(!active && confirm\) showSavedCollectionAdded\(title, collection\);/);
  const saveHandler = app.slice(app.indexOf('async function saveTitleCollection'), app.indexOf('function saveWatchlist'));
  assert.doesNotMatch(saveHandler, /catch \(error\) \{ openAccount\(error\.message\); \}/);
  assert.doesNotMatch(app, /if \(!state\.member\.signedIn\) \{[\s\S]*return;/);
});

test('member username stays read-only until the edit control is activated and checks availability before saving', () => {
  assert.match(page, /id="account-edit-username"[^>]*aria-controls="username-form"/);
  assert.match(page, /id="username-form"[^>]*hidden/);
  assert.match(page, /id="username-save"/);
  assert.match(page, /id="username-cancel"/);
  assert.match(app, /const editing = signedIn && \(!profile \|\| usernameEditing\)/);
  assert.match(app, /usernameAvailabilityState = result\.available \? 'available' : 'unavailable'/);
  assert.match(app, /if \(usernameAvailabilityState !== 'available'\) return;/);
});

test('Minha conta renders both independent personal shelves', () => {
  assert.match(page, /id="account-watch-later-list"/);
  assert.match(page, /id="account-favorites-list"/);
  assert.match(app, /function renderAccountSavedCollections\(\)/);
  assert.match(app, /renderAccountSavedCollections\(\);/);
  assert.match(app, /const id = String\(title\?\.tmdbId \?\? title\?\.tmdb_id \?\? title\?\.id/);
});

test('account edit form stays hidden until the edit control is clicked', () => {
  assert.match(app, /function openAccount\(message = ''\) \{\s*if \(state\.member\.profile\) usernameEditing = false;/);
  assert.match(app, /const editing = signedIn && \(!profile \|\| usernameEditing\)/);
  assert.match(page, /id="username-form"[^>]*hidden/);
  assert.match(page, /id="account-edit-username"[^>]*aria-controls="username-form"/);
});

test('metadata hydration never replaces the canonical TMDB identity', () => {
  assert.match(app, /const canonicalId = String\(title\.id \|\| ''\);/);
  assert.match(app, /if \(String\(canonicalId\)\.startsWith\('tmdb:'\)\) hydrated\.id = canonicalId;/);
});

test('return flow confirms the deed and suggests reviewing watched tapes', () => {
  assert.match(page, /id="return-confirmation-dialog"/);
  assert.match(app, /function showReturnConfirmation\(titles, failed = 0, syncFailed = false\)/);
  assert.match(app, /Boa sessão!/);
  assert.match(app, /const review = document\.createElement\('button'\); review\.type = 'button'; review\.className = 'return-review-action'; review\.textContent = '★ Avaliar'/);
  assert.match(app, /function reviewReturnSuggestion\(title\)/);
  assert.match(app, /window\.requestAnimationFrame\(\(\) => openTitleReviews\(memberTitleForViewer\(title\)\)\)/);
});
