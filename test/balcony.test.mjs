import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const balcony = readFileSync(new URL('../public/balcony.mjs', import.meta.url), 'utf8');
const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('Balcony wall displays focus in the scene and can be closed', () => {
  assert.match(balcony, /userData\.action = 'owner'/);
  assert.match(balcony, /userData\.action = 'collective-awards'/);
  assert.match(balcony, /focusFrame\(ownerFrame\)/);
  assert.match(balcony, /focusFrame\(awardsFrame\)/);
  assert.match(balcony, /function closeFocus\(\)/);
  assert.match(balcony, /if \(!hit\) \{ closeFocus\(\); return; \}/);
  assert.match(balcony, /scene-inspection-controls/);
});

test('VHS title viewing has an explicit close control', () => {
  assert.match(page, /id="title-dialog"[\s\S]*aria-label="Close title"/);
});
