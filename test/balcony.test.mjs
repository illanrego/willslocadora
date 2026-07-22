import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const balcony = readFileSync(new URL('../public/balcony.mjs', import.meta.url), 'utf8');

test('Balcony wall displays fall back to the existing counter action', () => {
  assert.match(balcony, /onOwner = onCounterSelect/);
  assert.match(balcony, /onCollectiveAwards = onCounterSelect/);
  assert.match(balcony, /userData\.action = 'owner'/);
  assert.match(balcony, /userData\.action = 'collective-awards'/);
});
