const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const app = readFileSync(require.resolve('../public/app.js'), 'utf8');

test('rapid title changes reuse one VHS renderer even after the dialog closes', () => {
  assert.match(app, /if \(activeVhsViewer\) \{\s*if \(!titleDialog\.open\) titleDialog\.showModal\(\);[\s\S]*activeVhsViewer\.update\(/);
  assert.doesNotMatch(app, /titleDialog\.addEventListener\('close',[\s\S]*activeVhsViewer\?\.dispose\(\)/);
});

test('reused VHS viewer resets to the new tape front without retaining its previous title logo', () => {
  const viewer = readFileSync(require.resolve('../public/vhs-3d.mjs'), 'utf8');
  assert.match(viewer, /function resetToFront\(\) \{[\s\S]*group\.rotation\.y = 0;[\s\S]*\}/);
  assert.match(viewer, /update\(nextTitle, nextAtCounter, assets = \{\}\) \{\s*title = nextTitle;\s*resetToFront\(\);[\s\S]*logoImage = null;[\s\S]*redraw\(\);/);
});
