const test = require('node:test');
const assert = require('node:assert/strict');

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
