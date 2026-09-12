import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

test('owner-only catalogue block action is attached to normal shelf covers', () => {
  assert.match(html, /class="vhs-block-action"[^>]*hidden[^>]*>×<\/button>/);
  assert.match(script, /request\('\/v1\/admin\/users'\)/);
  assert.match(script, /blockCatalogueTitle\(title, blockAction\)/);
  assert.match(script, /request\('\/v1\/admin\/catalogue\/blocks'/);
  assert.match(script, /state\.titles = state\.titles\.filter/);
  assert.match(script, /blockAction\.textContent = '×'/);
  assert.match(styles, /\.vhs-block-action \{[^}]*top: \.25rem;[^}]*right: \.25rem;[^}]*border-radius: 50%;/);
  assert.match(styles, /\.vhs-block-action \{ display: none; \}/);
});

test('owner-only shelf removal is available from inspected back-cover barcode area', () => {
  const viewer = readFileSync(new URL('../public/vhs-3d.mjs', import.meta.url), 'utf8');
  assert.match(viewer, /block: \{ x: 438, y: 68, width: 138, height: 126 \}/);
  assert.match(viewer, /function drawOwnerAction\(context, rect, label\)/);
  assert.match(viewer, /if \(showBlockAction\) drawOwnerAction\(context, ACTIONS\.block, copy\.removeFromShelf\)/);
  assert.match(viewer, /if \(currentShowBlockAction\) actions\.push\(ACTIONS\.block\)/);
  assert.match(viewer, /if \(currentShowBlockAction && inside\(ACTIONS\.block, x, y\)\) return onBlock/);
  assert.match(viewer, /setBlockActionVisible\(visible\)/);
  assert.match(script, /id = 'title-owner-action'/);
  assert.match(script, /showBlockAction: state\.admin/);
  assert.match(script, /onBlock: \(\) => \{ if \(activeViewerTitle\) blockCatalogueTitle/);
  assert.match(script, /syncTitleOwnerAction\(\);/);
  assert.match(styles, /\.title-utility-actions \.title-owner-action/);
});

test('all-years selection uses the all-years label on the main shelf caption', () => {
  assert.match(script, /const yearLabel = state\.ignoreStoreYear \? t\('allYears'\) :/);
  assert.match(script, /\$\('#shelf-caption'\)\.textContent = `\$\{t\('aisle'\)\}.*\$\{yearLabel\}/);
  assert.doesNotMatch(script, /\$\{t\('allCatalogues'\)\} · \$\{t\('storeYearCaption'\)\} \$\{state\.year\}/);
});
