const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const app = readFileSync(require.resolve('../public/app.js'), 'utf8');

test('rapid title changes reuse one VHS renderer even after the dialog closes', () => {
  assert.match(app, /if \(activeVhsViewer\) \{\s*if \(!titleDialog\.open\) titleDialog\.showModal\(\);[\s\S]*activeVhsViewer\.update\(/);
  assert.doesNotMatch(app, /titleDialog\.addEventListener\('close',[\s\S]*activeVhsViewer\?\.dispose\(\)/);
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
