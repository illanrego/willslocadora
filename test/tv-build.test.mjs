import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('Samsung TV project targets Tizen 5.5 with bounded and exact build rules', () => {
  const config = read('tv/samsung/config.xml');
  const html = read('tv/samsung/index.html');
  const build = read('scripts/build-tv.mjs');
  const app = read('tv/samsung/src/app.mjs');
  const css = read('tv/samsung/tv.css');
  assert.match(config, /required_version="5\.5"/);
  assert.match(config, /privilege\/internet/);
  assert.match(config, /privilege\/application\.info/);
  assert.match(config, /privilege\/application\.launch/);
  assert.match(config, /<access origin="https:\/\/locadora-api\.willstartpage\.workers\.dev" subdomains="false"\/>/);
  assert.doesNotMatch(config, /origin="\*"/);
  assert.match(html, /app-core\.js[\s\S]*i18n\.js[\s\S]*genre-themes\.js[\s\S]*app\.js/);
  assert.match(html, /Falha ao iniciar/);
  assert.match(build, /target: \['chrome69'\]/);
  assert.match(build, /optional chaining\/nullish syntax/);
  assert.match(build, /Could not force browser global/);
  assert.match(build, /20 \* 1024 \* 1024/);
  assert.match(build, /node_modules\/three-tv\/build\/three\.module\.js/);
  assert.match(read('tv/samsung/src/guest-rental.mjs'), /locadora\.tv\.guestRental\.v1/);
  assert.match(app, /request_timeout/);
  assert.match(app, /37: 'left', 38: 'up', 39: 'right', 40: 'down'/);
  assert.match(app, /function moveFilterField\(direction\)/);
  assert.match(app, /function changeFilterValue\(control, direction\)/);
  assert.match(app, /currentDialog\(\) === \$\('#filters-dialog'\)/);
  assert.match(app, /scrollIntoView\?\.\(\{ block: 'nearest', inline: 'nearest' \}\)/);
  assert.match(app, /Samsung's older TV browser may permit only one live WebGL context/);
  assert.doesNotMatch(app, /probe\.getContext\('webgl/);
  assert.match(app, /state\.mode === 'flat' \? 30 : state\.lowFidelity \? 10 : 40/);
  assert.match(app, /async function prepareTvTextures\(titles, includeDetails = false\)/);
  assert.match(app, /URL\.createObjectURL\(blob\)/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  assert.match(css, /\.flat-shelf\s*\{[^}]*overflow-y:\s*auto;/);
  assert.match(read('tv/samsung/src/polyfills.js'), /!Array\.prototype\.at/);
  assert.match(html, /← → trocar campo · ↑ ↓ mudar valor/);
});

test('TV source keeps the public web app on current Three and uses a TV-only compatibility renderer', () => {
  const manifest = JSON.parse(read('package.json'));
  const shelf = read('public/immersive-shelf.mjs');
  assert.equal(manifest.dependencies.three, '^0.185.1');
  assert.match(manifest.devDependencies['three-tv'], /three@\^0\.162\.0/);
  assert.match(shelf, /performanceProfile === 'tv'/);
  assert.match(shelf, /onBoundary\?\./);
});
