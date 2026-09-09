const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const app = readFileSync(require.resolve('../public/app.js'), 'utf8');

test('rapid title changes reuse one VHS renderer even after the dialog closes', () => {
  const viewer = readFileSync(require.resolve('../public/vhs-3d.mjs'), 'utf8');
  assert.match(app, /if \(activeVhsViewer\) \{\s*if \(!titleDialog\.open\) titleDialog\.showModal\(\);[\s\S]*activeVhsViewer\.update\(/);
  assert.doesNotMatch(app, /titleDialog\.addEventListener\('close',[\s\S]*activeVhsViewer\?\.dispose\(\)/);
  assert.doesNotMatch(app, /activeVhsViewer\.setActive/);
  assert.match(viewer, /update\(nextTitle, nextAtCounter, assets = \{\}\) \{\s*title = nextTitle;\s*resetToFront\(\);[\s\S]*Object\.keys\(assetUrls\)\.forEach[\s\S]*redraw\(\);\s*loadAsset\('poster', assets\.posterUrl\)/);
});

test('Balcony search computer faces the customer', () => {
  const balcony = readFileSync(require.resolve('../public/balcony.mjs'), 'utf8');
  assert.match(balcony, /const crt = new THREE\.Group\(\); crt\.position\.set\(4, COUNTER_TOP \+ 1\.07, -\.55\); crt\.rotation\.y = Math\.PI;/);
  assert.match(balcony, /const keyboard = new THREE\.Group\(\); keyboard\.position\.set\(4, COUNTER_TOP \+ \.06, \.65\); keyboard\.rotation\.y = Math\.PI;/);
});


test('reused VHS viewer resets to the new tape front without retaining its previous title logo', () => {
  const viewer = readFileSync(require.resolve('../public/vhs-3d.mjs'), 'utf8');
  assert.match(viewer, /function resetToFront\(\) \{[\s\S]*group\.rotation\.y = 0;[\s\S]*\}/);
  assert.match(viewer, /update\(nextTitle, nextAtCounter, assets = \{\}\) \{\s*title = nextTitle;\s*resetToFront\(\);[\s\S]*logoImage = null;[\s\S]*redraw\(\);/);
});

test('VHS canvas changes to a pointer over clickable back-cover actions', () => {
  const viewer = readFileSync(require.resolve('../public/vhs-3d.mjs'), 'utf8');
  assert.match(viewer, /function isClickableHit\(hit\)/);
  assert.match(viewer, /renderer\.domElement\.style\.cursor = isClickableHit\(pick\(event\)\) \? 'pointer' : 'grab'/);
  assert.match(viewer, /const actions = \[ACTIONS\.letterboxd, ACTIONS\.imdb, ACTIONS\.counter, ACTIONS\.availability, ACTIONS\.watch\]/);
  assert.match(viewer, /if \(showSavedActions\) actions\.push\(ACTIONS\.watchLater, ACTIONS\.favorite\)/);
});

test('mobile VHS back cover places subtle saved-list icons below the barcode and keeps their state in sync', () => {
  const viewer = readFileSync(require.resolve('../public/vhs-3d.mjs'), 'utf8');
  assert.match(viewer, /favorite: \{ x: 696, y: 218, width: 64, height: 64 \}/);
  assert.match(viewer, /watchLater: \{ x: 776, y: 218, width: 64, height: 64 \}/);
  assert.match(viewer, /function drawSavedIcon\(context, rect, symbol, active\)/);
  assert.doesNotMatch(viewer, /function drawSavedSticker/);
  assert.match(viewer, /drawSavedIcon\(context, ACTIONS\.favorite, '★', savedCollections\.has\('favorite'\)\)/);
  assert.match(viewer, /drawSavedIcon\(context, ACTIONS\.watchLater, '＋', savedCollections\.has\('watch_later'\)\)/);
  assert.match(viewer, /setSavedCollections\(nextCollections\)/);
  assert.match(app, /activeVhsViewer\?\.setSavedCollections\(collections\)/);
  assert.match(app, /showSavedActions: window\.matchMedia\('\(max-width: 600px\)'\)\.matches/);
});
