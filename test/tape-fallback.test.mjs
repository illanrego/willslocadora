import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Three.js failure returns immersive browsing to 2D and keeps the Balcony fallback', () => {
  const fallback = read('public/tape-fallback.mjs');
  const app = read('public/app.js');
  assert.match(fallback, /export function createTapeFallback/);
  assert.doesNotMatch(fallback, /THREE|three\.module/);
  assert.match(app, /catch \(error\) \{[\s\S]*setMode\('normal'\);[\s\S]*O modo 3D não está disponível/);
  assert.doesNotMatch(app, /mountImmersiveFallback/);
  assert.match(app, /mountBalconyFallback/);
});

test('Three.js failure keeps title inspection usable through flat front and back pages', () => {
  const viewer = read('public/vhs-flat.mjs');
  const app = read('public/app.js');
  const styles = read('public/styles.css');
  assert.match(viewer, /export function createFlatVhsViewer/);
  assert.doesNotMatch(viewer, /THREE|three\.module/);
  assert.match(viewer, /copy\.viewBackCover/);
  assert.match(viewer, /copy\.viewFrontCover/);
  assert.match(viewer, /onCounter/);
  assert.match(viewer, /onAvailability/);
  assert.match(app, /await import\('\.\/vhs-flat\.mjs'\)/);
  assert.match(styles, /\.flat-vhs-page\[hidden\] \{ display: none; \}/);
});
