const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampStoreYear,
  createStremioUri,
  deduplicateTitles,
  filterByStore,
  normalizeTitle,
  parseReleaseYear,
} = require('../public/app-core.js');

test('clampStoreYear supports the full catalogue era through 2026', () => {
  assert.equal(clampStoreYear(1895), 1920);
  assert.equal(clampStoreYear(2010), 2010);
  assert.equal(clampStoreYear(2030), 2026);
});

test('parseReleaseYear extracts the first four digit year', () => {
  assert.equal(parseReleaseYear('1997–1999'), 1997);
  assert.equal(parseReleaseYear('Released 1987'), 1987);
  assert.equal(parseReleaseYear(null), null);
});

test('normalizeTitle creates the stable browser model', () => {
  const title = normalizeTitle({
    id: 'tt0133093', type: 'movie', name: 'The Matrix', releaseInfo: '1999',
    genres: ['Action', 'Sci-Fi'], poster: 'https://example.test/matrix.jpg',
    imdbRating: '8.7', director: ['Lana Wachowski', 'Lilly Wachowski'],
    writer: ['Lilly Wachowski', 'Lana Wachowski'],
    cast: ['Keanu Reeves', 'Laurence Fishburne', 'Carrie-Anne Moss'],
  }, 'cinemeta');

  assert.deepEqual(title, {
    id: 'tt0133093', type: 'movie', name: 'The Matrix', year: 1999,
    genres: ['Action', 'Sci-Fi'], poster: 'https://example.test/matrix.jpg',
    background: '', description: '', imdbRating: '8.7',
    director: ['Lana Wachowski', 'Lilly Wachowski'],
    writer: ['Lilly Wachowski', 'Lana Wachowski'],
    cast: ['Keanu Reeves', 'Laurence Fishburne', 'Carrie-Anne Moss'], source: 'cinemeta',
  });
});

test('filterByStore enforces selected year and aisle genre', () => {
  const titles = [
    { id: 'too-old', year: 1994, genres: ['Horror'] },
    { id: 'old', year: 1995, genres: ['Horror'] },
    { id: 'future', year: 2001, genres: ['Horror'] },
    { id: 'wrong-aisle', year: 1990, genres: ['Comedy'] },
    { id: 'unknown', year: null, genres: ['Horror'] },
  ];
  assert.deepEqual(filterByStore(titles, { year: 1999, genre: 'Horror' }).map((item) => item.id), ['old']);
});

test('filterByStore combines related genres into one broad aisle', () => {
  const titles = [
    { id: 'crime', year: 1999, genres: ['Crime'] },
    { id: 'thriller', year: 1998, genres: ['Thriller'] },
    { id: 'comedy', year: 1999, genres: ['Comedy'] },
  ];
  assert.deepEqual(filterByStore(titles, { year: 1999, genres: ['Crime', 'Thriller', 'Mystery'] }).map((item) => item.id), ['crime', 'thriller']);
});

test('deduplicateTitles keeps the richer copy of a stable title', () => {
  const result = deduplicateTitles([
    { id: 'tt1', type: 'movie', name: 'Film', description: '', genres: [] },
    { id: 'tt1', type: 'movie', name: 'Film', description: 'Full synopsis', genres: ['Drama'] },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].description, 'Full synopsis');
});

test('createStremioUri builds native detail routes without stream data', () => {
  assert.equal(createStremioUri({ type: 'movie', id: 'tt0133093' }), 'stremio:///detail/movie/tt0133093');
  assert.equal(createStremioUri({ type: 'series', id: 'tt0903747' }), 'stremio:///detail/series/tt0903747');
  assert.throws(() => createStremioUri({ type: 'movie', id: 'bad/id' }), /Invalid title/);
});

