import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../public/auth-config.js', import.meta.url), 'utf8');

test('public deployment points at the Better Auth private Worker', () => {
  assert.match(config, /authApiBase: 'https:\/\/locadora-data\.willstartpage\.workers\.dev'/);
});
