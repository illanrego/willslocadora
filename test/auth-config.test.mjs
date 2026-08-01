import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../public/auth-config.js', import.meta.url), 'utf8');

test('public deployment uses the dedicated Clerk production instance', () => {
  assert.match(config, /clerkPublishableKey: 'pk_live_/);
  assert.match(config, /clerkFrontendApi: 'https:\/\/clerk\.willslocadora\.sitedoillan\.com\.br'/);
  assert.doesNotMatch(config, /pk_test_|clerk\.accounts\.dev/);
});
