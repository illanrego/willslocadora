const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const app = readFileSync(require.resolve('../public/app.js'), 'utf8');

test('rapid title changes reuse an open VHS viewer instead of creating another renderer', () => {
  assert.match(app, /if \(activeVhsViewer && titleDialog\.open\) \{[\s\S]*activeVhsViewer\.update\(/);
  assert.doesNotMatch(app, /activeVhsViewer\?\.dispose\(\);\s*activeVhsViewer = null;\s*detail\.className/);
});
