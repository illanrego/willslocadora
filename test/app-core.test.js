const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampStoreYear,
  createImdbUrl,
  createLetterboxdUrl,
  createStremioUri,
  deduplicateTitles,
  filterByStore,
  normalizeTitle,
  parseReleaseYear,
  normalizeRentalState,
  rentCounterTitles,
  returnRentedTitle,
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

test('filterByStore extends the selected shelf to twenty years only when requested', () => {
  const titles = [
    { id: 'nineteen-years-old', year: 1980, genres: ['Horror'] },
    { id: 'twenty-years-old', year: 1979, genres: ['Horror'] },
  ];

  assert.deepEqual(filterByStore(titles, { year: 1999, genre: 'Horror', yearWindow: 20 }).map((item) => item.id), ['nineteen-years-old']);
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

test('createLetterboxdUrl uses Letterboxd’s stable external-ID redirects before a search fallback', () => {
  assert.equal(createLetterboxdUrl({ id: 'tt0133093', name: 'The Matrix' }), 'https://letterboxd.com/imdb/tt0133093/');
  assert.equal(createLetterboxdUrl({ id: 'tmdb:603', name: 'The Matrix' }), 'https://letterboxd.com/tmdb/603/');
  assert.equal(createLetterboxdUrl({ id: 'unknown', name: 'A Film, Perhaps' }), 'https://letterboxd.com/search/A%20Film%2C%20Perhaps/');
});

test('createImdbUrl uses the canonical title route before a search fallback', () => {
  assert.equal(createImdbUrl({ id: 'tt0133093', name: 'The Matrix' }), 'https://www.imdb.com/title/tt0133093/');
  assert.equal(createImdbUrl({ id: 'unknown', name: 'A Film, Perhaps' }), 'https://www.imdb.com/find/?q=A%20Film%2C%20Perhaps');
});

const balconyTitles = [
  { id: 'tt0133093', type: 'movie', name: 'The Matrix', year: 1999 },
  { id: 'tt0114369', type: 'movie', name: 'Se7en', year: 1995 },
];

test('rentCounterTitles moves the complete counter into one rented bag', () => {
  const rental = rentCounterTitles({ counter: balconyTitles, rented: null, returned: [] });
  assert.deepEqual(rental.counter, []);
  assert.equal(rental.rented.titles.length, 2);
  assert.deepEqual(rental.rented.titles.map((title) => title.id), ['tt0133093', 'tt0114369']);
});

test('returnRentedTitle keeps the bag while another title remains', () => {
  const rented = rentCounterTitles({ counter: balconyTitles, rented: null, returned: [] });
  const returned = returnRentedTitle(rented, 'movie:tt0133093', 'watched');
  assert.equal(returned.rented.titles.length, 1);
  assert.equal(returned.rented.titles[0].id, 'tt0114369');
  assert.deepEqual(returned.returned.map((entry) => [entry.title.id, entry.watchedStatus]), [['tt0133093', 'watched']]);
});

test('returnRentedTitle removes the bag after the last return', () => {
  const rented = rentCounterTitles({ counter: [balconyTitles[0]], rented: null, returned: [] });
  const returned = returnRentedTitle(rented, 'movie:tt0133093', 'unknown');
  assert.equal(returned.rented, null);
  assert.equal(returned.returned.length, 1);
});

test('normalizeRentalState safely recovers from malformed persisted rental data', () => {
  assert.deepEqual(normalizeRentalState('{not json'), { counter: [], rented: null, returned: [] });
  const recovered = normalizeRentalState({
    counter: [{ id: 'good', type: 'movie', name: 'Good' }, { id: '', type: 'movie', name: 'Bad' }],
    rented: { titles: [{ id: 'rented', type: 'series', name: 'Rented' }, null] },
    returned: [{ title: { id: 'returned', type: 'movie', name: 'Returned' }, watchedStatus: 'watched' }, { title: null }],
  });
  assert.deepEqual(recovered.counter, []);
  assert.deepEqual(recovered.rented.titles.map((title) => title.id), ['rented']);
  assert.deepEqual(recovered.returned.map((entry) => [entry.title.id, entry.watchedStatus]), [['returned', 'watched']]);
});

test('normalizeRentalState keeps the counter empty while a Locadora bag is rented', () => {
  const rental = normalizeRentalState({
    counter: [balconyTitles[0]],
    rented: { titles: [balconyTitles[1]] },
  });

  assert.deepEqual(rental.counter, []);
  assert.deepEqual(rental.rented.titles.map((title) => title.id), ['tt0114369']);
});
