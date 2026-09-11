import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/admin/index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../public/admin/admin.js', import.meta.url), 'utf8');

test('admin dashboard is hidden until the private Worker confirms owner access', () => {
  assert.match(html, /id="admin-gate"/);
  assert.match(html, /id="admin-app" class="admin-shell" hidden/);
  assert.match(script, /request\('\/v1\/admin\/users'\)/);
  assert.match(script, /showAdmin\(\)/);
  assert.match(script, /showGate\(error\.message/);
});
