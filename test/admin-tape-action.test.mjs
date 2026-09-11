import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

test('owner-only catalogue block action is attached to normal shelf covers', () => {
  assert.match(html, /class="vhs-block-action"[^>]*hidden/);
  assert.match(script, /request\('\/v1\/admin\/users'\)/);
  assert.match(script, /blockCatalogueTitle\(title, blockAction\)/);
  assert.match(script, /request\('\/v1\/admin\/catalogue\/blocks'/);
  assert.match(script, /state\.titles = state\.titles\.filter/);
  assert.match(styles, /\.vhs-block-action/);
});
