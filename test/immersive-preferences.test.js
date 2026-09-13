const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const { GENRE_THEMES, getGenreTheme } = require('../public/genre-themes.js');
const { DEFAULT_LIGHTING, kelvinToRgb, normalizeLighting } = require('../public/immersive-preferences.js');

test('every immersive genre has a complete valid theme', () => {
  for (const genre of ['Action & Adventure', 'Comedy', 'Horror', 'Sci-Fi & Fantasy', 'Drama', 'Crime & Thriller', 'Romance', 'Family & Animation', 'Documentary']) {
    const theme = getGenreTheme(genre);
    assert.equal(theme, GENRE_THEMES[genre]);
    for (const color of Object.values(theme)) assert.match(color, /^#[0-9a-f]{6}$/i);
  }
});

test('immersive lighting preferences clamp to readable defaults and valid bounds', () => {
  assert.deepEqual(normalizeLighting(), DEFAULT_LIGHTING);
  assert.deepEqual(normalizeLighting({ brightness: -10, warmth: 9000 }), { brightness: 25, warmth: 4200 });
  assert.deepEqual(normalizeLighting({ brightness: 155, warmth: 1000 }), { brightness: 150, warmth: 2200 });
  assert.match(kelvinToRgb(2200), /^#[0-9a-f]{6}$/i);
  assert.match(kelvinToRgb(4200), /^#[0-9a-f]{6}$/i);
});

test('localized labels do not choose the fallback shelf theme', () => {
  const app = readFileSync(require.resolve('../public/app.js'), 'utf8');
  assert.match(app, /theme: 'Crime & Thriller'/);
  assert.match(app, /getGenreTheme\(genre\.theme\)/);
});

test('plaque selections update the draft directly and keep provider context visible until Ir', () => {
  const immersive = readFileSync(require.resolve('../public/immersive-shelf.mjs'), 'utf8');
  const app = readFileSync(require.resolve('../public/app.js'), 'utf8');
  assert.match(immersive, /input\.addEventListener\('change', \(\) => \{\s*if \(!save\(\)\) return;\s*closePlaqueEditor\(false\)/);
  assert.doesNotMatch(immersive, /const done = document\.createElement\('button'\)/);
  assert.match(immersive, /const visibleProviders = activeProviders\.slice\(0, 4\)/);
  assert.match(immersive, /context\.drawImage\(image, logoX, 148, 32, 32\)/);
  assert.match(immersive, /context\.fillText\(plaqueOptions\.allProviders, 620, 164, 130\)/);
  assert.match(app, /allProviders: state\.locale === 'pt-BR' \? 'TODOS' : 'ALL'/);
  assert.doesNotMatch(app, /doneLabel: state\.locale/);
});
