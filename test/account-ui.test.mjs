import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../workers/locadora-data/src/index.mjs', import.meta.url), 'utf8');

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
