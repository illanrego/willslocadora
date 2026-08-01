import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
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
  assert.match(app, /openTitle\(memberTitleForViewer\(title\)\)/);
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
  assert.match(app, /LocadoraAccount\.onChange\(async \(next\) => \{\s*memberSessionVersion \+= 1;/);
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
