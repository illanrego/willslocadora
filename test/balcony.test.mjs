import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const balcony = readFileSync(new URL('../public/balcony.mjs', import.meta.url), 'utf8');
const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('Balcony wall keeps collective history but removes the temporary owner banner', () => {
  assert.doesNotMatch(balcony, /userData\.action = 'owner'/);
  assert.doesNotMatch(balcony, /illan-pixel-portrait/);
  assert.equal(existsSync(new URL('../public/images/illan-pixel-portrait.png', import.meta.url)), false);
  assert.match(balcony, /userData\.action = 'collective-awards'/);
  assert.match(balcony, /focusFrame\(awardsFrame\)/);
  assert.match(balcony, /function closeFocus\(\)/);
  assert.match(balcony, /if \(!hit\) \{ closeFocus\(\); return; \}/);
  assert.match(balcony, /scene-inspection-controls/);
});

test('Balcony makes search and current-rental-decision review readable and clickable inside the 3D scene', () => {
  assert.match(balcony, /PESQUISAR TÍTULOS/);
  assert.match(balcony, /ESCOLHER \/ ALUGAR FITAS/);
  assert.doesNotMatch(balcony, /rental\.rented/);
  assert.match(balcony, /userData\.action = 'counter'/);
  assert.doesNotMatch(balcony, /userData\.action = 'rent'/);
  assert.match(balcony, /target\?\.userData\.action === 'counter'\) onCounterSelect\?\.\(\)/);
  assert.match(balcony, /hoveredInteractive/);
});

test('the physical return basket opens the dedicated return window', () => {
  assert.match(balcony, /returns\.userData\.action = 'bag'/);
  assert.match(balcony, /const interactive = \[crt, keyboard, jar, awardsFrame, returns\]/);
  assert.match(balcony, /target\?\.userData\.action === 'bag'\) onBagSelect/);
  assert.match(page, /id="returns-dialog"/);
  assert.match(balcony, /MAX_RETURN_DISPLAY = 7/);
  assert.match(balcony, /returned \|\| \[\]\)\.slice\(-MAX_RETURN_DISPLAY\)/);
});

test('VHS title viewing has an explicit close control', () => {
  assert.match(page, /id="title-dialog"[\s\S]*aria-label="Close title"/);
});
