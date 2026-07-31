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

test('private account API supports paged history and authenticated username availability feedback', () => {
  assert.match(worker, /url\.pathname === '\/v1\/history'/);
  assert.match(worker, /url\.pathname\.match\(\/\^\\\/v1\\\/usernames/);
  assert.match(worker, /async listHistory\(userId, offset\)/);
  assert.match(worker, /async isUsernameAvailable\(userId, username\)/);
  assert.match(app, /\/v1\/usernames\/\$\{encodeURIComponent\(username\)\}/);
});
