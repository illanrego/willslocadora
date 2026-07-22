import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const dist = `${root}dist`;

test('Pages build emits static assets, vendor Three.js, and relative entry paths', () => {
  rmSync(dist, { recursive: true, force: true });
  execFileSync(process.execPath, ['scripts/build-pages.mjs'], { cwd: root, stdio: 'pipe' });

  assert.equal(existsSync(`${dist}/index.html`), true);
  assert.equal(existsSync(`${dist}/vendor/three.module.mjs`), true);
  assert.equal(existsSync(`${dist}/vendor/three.core.js`), true);
  assert.equal(existsSync(`${dist}/api-config.js`), true);
  const config = readFileSync(`${dist}/api-config.js`, 'utf8');
  assert.match(config, /locadora-api\.willstartpage\.workers\.dev\/v1/);
  const html = readFileSync(`${dist}/index.html`, 'utf8');
  assert.match(html, /src="\.\/api-config\.js"/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/app\.js"/);
});
