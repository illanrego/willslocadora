import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile 2D shelves use a bounded grid of title-bearing tape spines', () => {
  const styles = read('public/styles.css');
  assert.match(styles, /@media \(max-width: 760px\), \(max-width: 900px\) and \(pointer: coarse\)/);
  assert.match(styles, /\.shelf \{\s*display: grid;\s*grid-template-columns: repeat\(auto-fit, minmax\(42px, 1fr\)\);/);
  assert.match(styles, /\.case-label strong \{[\s\S]*rotate\(-90deg\)/);
  assert.match(styles, /\.vhs-case img \{ display: none; \}/);
});

test('mobile immersive shelves rebuild a narrow spine-facing rack for portrait and landscape', () => {
  const immersive = read('public/immersive-shelf.mjs');
  assert.match(immersive, /function layoutKey\(\)/);
  assert.match(immersive, /mobile-landscape/);
  assert.match(immersive, /const compactRack = new THREE\.Group\(\)/);
  assert.match(immersive, /createVhsSpine\(title, \{ width: 0\.48, height: 1\.42, depth: 0\.52 \}\)/);
  assert.match(immersive, /const columns = compact \? \(landscape \? 10 : 8\) : COLUMNS/);
});
