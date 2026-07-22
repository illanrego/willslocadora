import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Three.js failure routes immersive and Balcony views to a dependency-free tape fallback', () => {
  const fallback = read('public/tape-fallback.mjs');
  const app = read('public/app.js');
  assert.match(fallback, /export function createTapeFallback/);
  assert.doesNotMatch(fallback, /THREE|three\.module/);
  assert.match(app, /await import\('\.\/tape-fallback\.mjs'\)/);
  assert.match(app, /mountImmersiveFallback/);
  assert.match(app, /mountBalconyFallback/);
});
