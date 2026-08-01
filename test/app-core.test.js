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
  prepareCounterSelection,
  removeCounterSelection,
  rentCounterTitles,
  serializeRentalTitle,
  returnRentedTitle,
  submitRentalReturns,
  updateRentalBasket,
  validateRentalResponse,
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

test('normalizeTitle preserves canonical TMDB and IMDb handoff identities', () => {
  const title = normalizeTitle({ id: 'tmdb:603', imdbId: 'tt0133093', type: 'movie', name: 'The Matrix', year: 1999 });
  assert.equal(title.id, 'tmdb:603');
  assert.equal(title.imdbId, 'tt0133093');
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
  assert.equal(createStremioUri({ type: 'movie', id: 'tmdb:603', imdbId: 'tt0133093' }), 'stremio:///detail/movie/tt0133093');
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

test('Cesta toggles distinct titles through fifteen and refuses only a sixteenth title', () => {
  const titles = Array.from({ length: 16 }, (_, index) => ({ id: `tmdb:${index + 1}`, type: 'movie', name: `Tape ${index + 1}`, year: 1990 + index }));
  let result = { titles: [] };
  for (const title of titles.slice(0, 15)) result = updateRentalBasket(result.titles, title);
  assert.equal(result.titles.length, 15);
  const full = updateRentalBasket(result.titles, titles[15]);
  assert.equal(full.reason, 'full');
  assert.equal(full.titles.length, 15);
  assert.equal(updateRentalBasket(full.titles, titles[0]).titles.length, 14);
});

test('rental basket refuses new selections while a pack is active', () => {
  const result = updateRentalBasket([], balconyTitles[0], { titles: [balconyTitles[1]] });
  assert.deepEqual(result, { titles: [], changed: false, reason: 'active_rental' });
});

test('a canonical shelf title survives Cesta normalization and serializes for rental', () => {
  const shelfTitle = { id: 'tmdb:603', imdbId: 'tt0133093', type: 'movie', name: 'The Matrix', year: 1999 };
  const [selected] = prepareCounterSelection([shelfTitle]);
  assert.equal(selected.imdbId, 'tt0133093');
  assert.deepEqual(serializeRentalTitle(selected), { tmdbId: 603, type: 'movie', name: 'The Matrix', year: 1999 });
});

test('validateRentalResponse accepts only a matching one-to-three-tape Worker package', () => {
  const requested = [serializeRentalTitle({ id: 'tmdb:603', type: 'movie', name: 'The Matrix', year: 1999 })];
  const response = { rental: { id: 'rental-1', items: [{ id: 'item-1', ...requested[0] }] } };
  assert.deepEqual(validateRentalResponse(response, requested), response);
  const snakeCaseResponse = { rental: { id: 'rental-2', items: [{ id: 'item-2', tmdb_id: 603, media_type: 'movie', name: 'The Matrix' }] } };
  assert.deepEqual(validateRentalResponse(snakeCaseResponse, requested), snakeCaseResponse);
  assert.throws(() => validateRentalResponse({}, requested), /invalid rental response/i);
  assert.throws(() => validateRentalResponse({ rental: { id: 'rental-1', items: [] } }, requested), /invalid rental response/i);
  assert.throws(() => validateRentalResponse({ rental: { id: 'rental-1', items: [{ id: 'item-1', tmdbId: 550, type: 'movie', name: 'Wrong tape' }] } }, requested), /invalid rental response/i);
});

test('the counter decision is a separate subset and does not mutate the basket', () => {
  const basket = [
    { id: 'tmdb:1', type: 'movie', name: 'One' },
    { id: 'tmdb:2', type: 'movie', name: 'Two' },
    { id: 'tmdb:3', type: 'movie', name: 'Three' },
  ];
  const selection = prepareCounterSelection(basket);
  const reduced = removeCounterSelection(selection, basket[1]);
  assert.deepEqual(reduced.map((title) => title.name), ['One', 'Three']);
  assert.deepEqual(basket.map((title) => title.name), ['One', 'Two', 'Three']);
  assert.notEqual(selection, basket);
});

test('rentCounterTitles moves the complete counter into one rented bag', () => {
  const rental = rentCounterTitles({ counter: balconyTitles, rented: null, returned: [] });
  assert.deepEqual(rental.counter, []);
  assert.equal(rental.rented.titles.length, 2);
  assert.deepEqual(rental.rented.titles.map((title) => title.id), ['tt0133093', 'tt0114369']);
});

test('persisted Cesta retains fifteen titles while final rental remains capped at three', () => {
  const four = [...balconyTitles, { id: 'tt3', type: 'movie', name: 'Three' }, { id: 'tt4', type: 'movie', name: 'Four' }];
  const normalized = normalizeRentalState({ counter: four, rented: null, returned: four.map((title) => ({ title, watchedStatus: 'watched' })) });
  assert.equal(normalized.counter.length, 4);
  assert.equal(normalized.returned.length, 4);
  const rental = rentCounterTitles({ counter: four, rented: null, returned: [] });
  assert.equal(rental.rented, null);
  assert.equal(rental.counter.length, 4);
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

test('submitRentalReturns reports partial success without retrying completed tapes', async () => {
  const calls = [];
  const result = await submitRentalReturns([
    { itemId: 'tape-1', watchedStatus: 'watched' },
    { itemId: 'tape-2', watchedStatus: 'not_watched' },
    { itemId: 'tape-3', watchedStatus: 'unknown' },
  ], async (itemId, watchedStatus) => {
    calls.push([itemId, watchedStatus]);
    if (itemId === 'tape-2') throw new Error('archive unavailable');
  });

  assert.deepEqual(calls, [
    ['tape-1', 'watched'],
    ['tape-2', 'not_watched'],
    ['tape-3', 'unknown'],
  ]);
  assert.deepEqual(result.succeeded, ['tape-1', 'tape-3']);
  assert.deepEqual(result.failed.map((entry) => entry.itemId), ['tape-2']);
});

test('submitRentalReturns rejects malformed return selections before making requests', async () => {
  let calls = 0;
  const result = await submitRentalReturns([
    { itemId: '', watchedStatus: 'watched' },
    { itemId: 'tape-2', watchedStatus: 'invalid' },
  ], async () => { calls += 1; });
  assert.equal(calls, 0);
  assert.deepEqual(result, { succeeded: [], failed: [] });
});

test('normalizeRentalState safely recovers from malformed persisted rental data', () => {
  assert.deepEqual(normalizeRentalState('{not json'), { counter: [], rented: null, returned: [] });
  const recovered = normalizeRentalState({
    counter: [{ id: 'good', type: 'movie', name: 'Good' }, { id: '', type: 'movie', name: 'Bad' }],
    rented: { titles: [{ id: 'rented', type: 'series', name: 'Rented' }, null] },
    returned: [{ title: { id: 'returned', type: 'movie', name: 'Returned' }, watchedStatus: 'watched' }, { title: null }],
  });
  assert.deepEqual(recovered.counter.map((title) => title.id), ['good']);
  assert.deepEqual(recovered.rented.titles.map((title) => title.id), ['rented']);
  assert.deepEqual(recovered.returned.map((entry) => [entry.title.id, entry.watchedStatus]), [['returned', 'watched']]);
});

test('normalizeRentalState preserves a pending Cesta while another account package is active', () => {
  const rental = normalizeRentalState({
    counter: [balconyTitles[0]],
    rented: { titles: [balconyTitles[1]] },
  });

  assert.deepEqual(rental.counter.map((title) => title.id), ['tt0133093']);
  assert.deepEqual(rental.rented.titles.map((title) => title.id), ['tt0114369']);
});
