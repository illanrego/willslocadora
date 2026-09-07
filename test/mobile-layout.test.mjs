import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile 2D shelves use a horizontal spine-and-title rail', () => {
  const styles = read('public/styles.css');
  const app = read('public/app.js');
  assert.match(styles, /@media \(max-width: 760px\), \(max-width: 900px\) and \(pointer: coarse\)/);
  assert.match(styles, /\.shelf \{\s*display: flex;[\s\S]*overflow-x: auto;/);
  assert.match(styles, /\.vhs-case \{\s*display: grid;\s*grid-template-columns: 74px/);
  assert.match(styles, /\.vhs-case img \{ display: none; \}/);
  assert.match(app, /button\.dataset\.title = title\.name/);
});

test('mobile immersive shelves rebuild for portrait and landscape with inspectable title plates', () => {
  const immersive = read('public/immersive-shelf.mjs');
  assert.match(immersive, /function layoutKey\(\)/);
  assert.match(immersive, /mobile-landscape/);
  assert.match(immersive, /createMobileTitlePlate\(title, activeTheme\)/);
  assert.match(immersive, /titlePlate\.userData\.index = index/);
  assert.match(immersive, /titlePlate\].filter\(Boolean\)/);
  assert.match(immersive, /width: 0\.98, height: 1\.68, depth: 0\.46/);
});
