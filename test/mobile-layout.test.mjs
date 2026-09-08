import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile 2D shelves show poster+logo-backed tape spines with a vertical title', () => {
  const styles = read('public/styles.css');
  assert.match(styles, /@media \(max-width: 760px\), \(max-width: 900px\) and \(pointer: coarse\)/);
  assert.match(styles, /\.shelf \{\s*display: grid;\s*grid-template-columns: repeat\(auto-fit, minmax\(84px, 1fr\)\);/);
  assert.match(styles, /\.case-label strong \{[^}]*rotate\(90deg\)/);
  assert.match(styles, /\.vhs-case \.case-cover \{ position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover; \}/);
  assert.match(styles, /\.vhs-case \.case-logo \{[\s\S]*max-width: 90%;[\s\S]*object-fit: contain;[\s\S]*\}/);
  assert.match(styles, /\.vhs-case\.has-logo \.case-logo \{ display: block; \}/);
  assert.match(styles, /\.case-spine \{[^}]*background: rgba\(8, 5, 4, \.32\);/);
});

test('mobile immersive shelves rebuild a narrow spine-facing rack for portrait and landscape', () => {
  const immersive = read('public/immersive-shelf.mjs');
  assert.match(immersive, /function layoutKey\(\)/);
  assert.match(immersive, /mobile-landscape/);
  assert.match(immersive, /const compactRack = new THREE\.Group\(\)/);
  assert.match(immersive, /createVhsSpine\(title, \{ width: 0\.4, height: 1\.42, depth: 0\.3 \}\)/);
  assert.match(immersive, /const columns = compact \? \(landscape \? 10 : 8\) : COLUMNS/);
});
