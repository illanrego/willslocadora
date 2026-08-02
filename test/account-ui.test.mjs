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
  assert.match(app, /Pesquisar título no Balcão/);
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


test('Balcony catalogue search keeps its Cesta action available with active rentals until fifteen titles', () => {
  const searchStart = app.indexOf('async function searchBalconyCatalogue()');
  const searchEnd = app.indexOf('function setYear', searchStart);
  const search = app.slice(searchStart, searchEnd);
  assert.match(search, /state\.counter\.length >= MAX_CESTA_TITLES/);
  assert.doesNotMatch(search, /state\.rental\.rented/);
});

test('yellow actions use dark text and return submission retains a selected subset', () => {
  const styles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.yellow-action[\s\S]*color: var\(--black\)/);
  assert.match(app, /const entries = \[\.\.\.pendingReturns\.entries\(\)\]/);
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
  assert.match(app, /titleReview\.textContent = '★ Avaliações'/);
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
  assert.match(app, /if \(signedOut\) \{\s*state\.rental = \{ rented: null, returned: \[\] \};\s*pendingRental = false;\s*balconySelection = null;\s*saveCounter\(\);\s*renderBalconyPanel\(\);\s*refreshBalcony\(\);\s*\}/);
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
  assert.match(app, /function openReturnDesk\(\)[\s\S]*state\.mode === 'immersive'[\s\S]*setMode\('balcony'\)[\s\S]*openRentalDesk/);
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
