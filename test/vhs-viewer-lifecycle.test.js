const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const app = readFileSync(require.resolve('../public/app.js'), 'utf8');

test('rapid title changes reuse one VHS renderer even after the dialog closes', () => {
  assert.match(app, /if \(activeVhsViewer\) \{\s*if \(!titleDialog\.open\) titleDialog\.showModal\(\);[\s\S]*activeVhsViewer\.update\(/);
  assert.doesNotMatch(app, /titleDialog\.addEventListener\('close',[\s\S]*activeVhsViewer\?\.dispose\(\)/);
});
