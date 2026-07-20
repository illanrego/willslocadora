const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CatalogueStore,
  DEFAULT_SOURCES,
  assertSafeManifestUrl,
  buildResourceUrl,
  discoverCatalogs,
  discoverMetaResources,
  fetchTitleMeta,
  fetchStoreShelf,
  safeFetchImage,
  safeFetchJson,
} = require('../src/catalogue.js');
const { createTmdbClient } = require('../src/tmdb.js');

test('CatalogueStore returns one 4 by 10 stand at a time', async () => {
  const store = new CatalogueStore({
    fetchImpl: async (url) => {
      const skip = Number(url.match(/skip=(\d+)/)?.[1] || 0);
      return {
        ok: true,
        json: async () => ({ metas: Array.from({ length: 45 }, (_, index) => ({
          id: `title-${skip + index}`,
          type: 'movie',
          name: `Title ${skip + index}`,
          releaseInfo: '1999',
          genres: ['Horror'],
        })) }),
      };
    },
  });
  store.sources = [{
    id: 'test',
    manifestUrl: 'https://addon.example/manifest.json',
    catalogs: [{ type: 'movie', id: 'horror', extras: ['genre', 'skip'], pageSize: 50 }],
  }];

  const titles = await store.shelf({ genre: 'Horror', genres: ['Horror'], year: 1999, type: 'movie', page: 0 });

  assert.equal(titles.length, 40);
});

test('curated defaults cover the useful historical catalogue providers', () => {
  assert.deepEqual(DEFAULT_SOURCES.map(({ id }) => id), [
    'com.linvo.cinemeta',
    'tmdb-addon',
    'org.imdbcatalogs',
  ]);
  assert.ok(DEFAULT_SOURCES.every(({ manifestUrl }) => manifestUrl.startsWith('https://') && manifestUrl.endsWith('/manifest.json')));
});

test('assertSafeManifestUrl accepts public HTTPS manifests and rejects unsafe targets', () => {
  assert.equal(assertSafeManifestUrl('https://v3-cinemeta.strem.io/manifest.json').href, 'https://v3-cinemeta.strem.io/manifest.json');
  assert.throws(() => assertSafeManifestUrl('http://127.0.0.1:11470/manifest.json'), /HTTPS/);
  assert.throws(() => assertSafeManifestUrl('https://localhost/manifest.json'), /private/);
  assert.throws(() => assertSafeManifestUrl('https://user:secret@example.test/manifest.json'), /credentials/);
});

test('discoverCatalogs returns only usable movie and series catalogues', () => {
  const result = discoverCatalogs({
    catalogs: [
      { type: 'movie', id: 'top', extra: [{ name: 'genre' }] },
      { type: 'series', id: 'year', extra: [{ name: 'genre', isRequired: true }] },
      { type: 'channel', id: 'tv' },
    ],
  });
  assert.deepEqual(result.map(({ type, id }) => `${type}:${id}`), ['movie:top', 'series:year']);
  assert.deepEqual(result[1].options.genre, []);
});

test('buildResourceUrl encodes Stremio extras in the resource path', () => {
  const url = buildResourceUrl('https://addon.example/manifest.json', 'catalog', 'movie', 'top', {
    genre: 'Sci-Fi', skip: 20,
  });
  assert.equal(url, 'https://addon.example/catalog/movie/top/genre=Sci-Fi&skip=20.json');
});

test('discoverMetaResources keeps supported title types and ID prefixes', () => {
  assert.deepEqual(discoverMetaResources({ resources: [
    { name: 'meta', types: ['movie', 'series'], idPrefixes: ['tt'] },
    { name: 'stream', types: ['movie'] },
  ] }), [{ types: ['movie', 'series'], idPrefixes: ['tt'] }]);
});

test('fetchTitleMeta returns normalized rich metadata from a compatible source', async () => {
  const meta = await fetchTitleMeta({
    sources: [{
      id: 'cinemeta', manifestUrl: 'https://addon.example/manifest.json',
      metaResources: [{ types: ['movie', 'series'], idPrefixes: ['tt'] }],
    }],
    type: 'movie', id: 'tt0133093',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ meta: {
        id: 'tt0133093', type: 'movie', name: 'The Matrix', releaseInfo: '1999',
        imdbRating: '8.7', director: ['Lana Wachowski'], writer: ['Lilly Wachowski'], cast: ['Keanu Reeves'],
      } }),
    }),
  });

  assert.equal(meta.imdbRating, '8.7');
  assert.deepEqual(meta.director, ['Lana Wachowski']);
  assert.deepEqual(meta.writer, ['Lilly Wachowski']);
  assert.deepEqual(meta.cast, ['Keanu Reeves']);
});

test('TMDB enrichment adds Brazil availability, classification, images, and expanded credits', async () => {
  const requests = [];
  const client = createTmdbClient({
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (String(url).includes('/find/tt0133093')) return { ok: true, json: async () => ({ movie_results: [{ id: 603 }] }) };
      if (String(url).includes('/movie/603?')) return { ok: true, json: async () => ({
        backdrop_path: '/matrix-backdrop.jpg',
        credits: {
          cast: [{ name: 'Keanu Reeves' }, { name: 'Laurence Fishburne' }],
          crew: [{ job: 'Director', name: 'Lana Wachowski' }, { job: 'Writer', name: 'Lilly Wachowski' }],
        },
        images: { logos: [{ file_path: '/matrix-logo.png', iso_639_1: 'en' }] },
        release_dates: { results: [{ iso_3166_1: 'BR', release_dates: [{ certification: '14' }] }] },
        'watch/providers': { results: { BR: { link: 'https://www.justwatch.com/br/filme/matrix', flatrate: [{ provider_name: 'Netflix', logo_path: '/netflix-logo.png' }], rent: [{ provider_name: 'Amazon Prime Video' }] } } },
      }) };
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const result = await client.enrich({ id: 'tt0133093', type: 'movie', cast: [], director: [], writer: [] });

  assert.match(requests[0], /api_key=test-key/);
  assert.match(requests[0], /language=pt-BR/);
  assert.equal(result.background, 'https://image.tmdb.org/t/p/w1280/matrix-backdrop.jpg');
  assert.equal(result.logo, 'https://image.tmdb.org/t/p/w500/matrix-logo.png');
  assert.equal(result.certificationBR, '14');
  assert.deepEqual(result.availabilityBR, { link: 'https://www.justwatch.com/br/filme/matrix', providers: ['Netflix', 'Amazon Prime Video'], providerLogos: [{ name: 'Netflix', logo: 'https://image.tmdb.org/t/p/w92/netflix-logo.png' }], subscriptionProviders: ['Netflix'] });
  assert.deepEqual(result.director, ['Lana Wachowski']);
  assert.deepEqual(result.writer, ['Lilly Wachowski']);
  assert.deepEqual(result.cast, ['Keanu Reeves', 'Laurence Fishburne']);
});

test('TMDB enrichment uses the requested locale and returns localized display fallbacks', async () => {
  const requests = [];
  const client = createTmdbClient({
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (String(url).includes('/find/tt1')) return { ok: true, json: async () => ({ movie_results: [{ id: 1 }] }) };
      return { ok: true, json: async () => ({ title: 'Título localizado', overview: 'Resumo localizado', 'watch/providers': { results: {} } }) };
    },
  });

  const result = await client.enrich({ id: 'tt1', type: 'movie', name: 'Source title', description: 'Source synopsis' }, 'en-US');

  assert.match(requests[0], /language=en-US/);
  assert.equal(result.displayTitle, 'Título localizado');
  assert.equal(result.displayDescription, 'Resumo localizado');
});

test('TMDB discovers Brazil subscription titles before resolving their IMDb IDs', async () => {
  const requests = [];
  const client = createTmdbClient({
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      const value = String(url);
      requests.push(value);
      if (value.includes('/watch/providers/movie')) return { ok: true, json: async () => ({ results: [{ provider_id: 8, provider_name: 'Netflix' }] }) };
      if (value.includes('/discover/movie') && value.includes('page=1')) return { ok: true, json: async () => ({ results: [{ id: 603, title: 'The Matrix', release_date: '1999-03-31', genre_ids: [27], poster_path: '/matrix.jpg', overview: 'A test film.' }] }) };
      if (value.includes('/discover/movie') && value.includes('page=2')) return { ok: true, json: async () => ({ results: [{ id: 604, title: 'The Matrix Reloaded', release_date: '1999-04-01', genre_ids: [27], poster_path: '/reloaded.jpg', overview: 'Another test film.' }] }) };
      if (value.includes('/movie/603/external_ids')) return { ok: true, json: async () => ({ imdb_id: 'tt0133093' }) };
      if (value.includes('/movie/604/external_ids')) return { ok: true, json: async () => ({ imdb_id: 'tt0234215' }) };
      throw new Error(`Unexpected request: ${value}`);
    },
  });

  const titles = await client.discoverProviderShelf({ year: 1999, genres: ['Horror'], type: 'movie', providerName: 'Netflix', page: 0 });

  assert.deepEqual(titles.map((title) => title.id), ['tt0133093', 'tt0234215']);
  const firstDiscover = requests.find((url) => url.includes('/discover/movie') && url.includes('page=1'));
  assert.match(firstDiscover, /watch_region=BR/);
  assert.match(firstDiscover, /with_watch_monetization_types=flatrate/);
  assert.match(firstDiscover, /with_watch_providers=8/);
  assert.match(firstDiscover, /with_genres=27/);
  assert.match(firstDiscover, /primary_release_date.gte=1980-01-01/);
  assert.match(firstDiscover, /primary_release_date.lte=1999-12-31/);
});

test('TMDB uses Prime Video’s Brazil-searchable provider record when provider names are duplicated', async () => {
  const requests = [];
  const client = createTmdbClient({
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      const value = String(url);
      requests.push(value);
      if (value.includes('/watch/providers/movie')) return { ok: true, json: async () => ({ results: [
        { provider_id: 9, provider_name: 'Amazon Prime Video' },
        { provider_id: 119, provider_name: 'Amazon Prime Video' },
      ] }) };
      if (value.includes('/discover/movie') && value.includes('with_watch_providers=119') && value.includes('page=1')) return { ok: true, json: async () => ({ results: [{ id: 603, title: 'The Matrix', release_date: '1999-03-31' }] }) };
      if (value.includes('/discover/movie') && value.includes('page=2')) return { ok: true, json: async () => ({ results: [] }) };
      if (value.includes('/movie/603/external_ids')) return { ok: true, json: async () => ({ imdb_id: 'tt0133093' }) };
      throw new Error(`Unexpected request: ${value}`);
    },
  });

  const titles = await client.discoverProviderShelf({ year: 1999, genres: ['Horror'], type: 'movie', providerName: 'Amazon Prime Video' });

  assert.deepEqual(titles.map((title) => title.id), ['tt0133093']);
  assert.match(requests.find((url) => url.includes('/discover/movie')), /with_watch_providers=119/);
});

test('CatalogueStore enriches compatible Stremio metadata with TMDB details when configured', async () => {
  const store = new CatalogueStore({
    tmdbClient: { enrich: async (title) => ({ ...title, certificationBR: '14', availabilityBR: { link: 'https://example.test/watch', providers: ['Netflix'] } }) },
    fetchImpl: async () => ({ ok: true, json: async () => ({ meta: { id: 'tt0133093', type: 'movie', name: 'The Matrix' } }) }),
  });
  store.sources = [{
    id: 'cinemeta', manifestUrl: 'https://addon.example/manifest.json', metaResources: [{ types: ['movie'], idPrefixes: ['tt'] }],
  }];

  const result = await store.titleMeta({ type: 'movie', id: 'tt0133093' });

  assert.equal(result.certificationBR, '14');
  assert.deepEqual(result.availabilityBR.providers, ['Netflix']);
});

test('CatalogueStore routes provider shelves through TMDB discovery before catalogue sources', async () => {
  let options;
  const store = new CatalogueStore({
    tmdbClient: {
      enabled: true,
      discoverProviderShelf: async (value) => {
        options = value;
        return [{ id: 'tt0133093', type: 'movie', name: 'The Matrix', year: 1999 }];
      },
    },
  });
  store.sources = [];

  const titles = await store.shelf({ year: 1999, genre: 'Horror', genres: ['Horror'], type: 'movie', provider: 'netflix', page: 1 });

  assert.deepEqual(titles.map((title) => title.id), ['tt0133093']);
  assert.deepEqual(options, { year: 1999, genres: ['Horror'], type: 'movie', providerIds: [8], providerNames: ['Netflix'], ignoreStoreYear: false, page: 1 });
});

test('CatalogueStore keeps the Stremio catalogue path when no streaming services are selected', async () => {
  const store = new CatalogueStore({ tmdbClient: { enabled: true, discoverProviderShelf: async () => { throw new Error('TMDB should not be used'); } } });
  store.sources = [];

  assert.deepEqual(await store.shelf({ year: 1999, genres: ['Horror'], type: 'movie', providers: [], page: 0 }), []);
});

test('CatalogueStore sends selected providers as one TMDB OR discovery query', async () => {
  let options;
  const store = new CatalogueStore({ tmdbClient: { enabled: true, discoverProviderShelf: async (value) => { options = value; return []; } } });
  store.sources = [];

  await store.shelf({ year: 1999, genres: ['Action'], type: 'movie', providers: ['max', 'netflix'], ignoreStoreYear: true, page: 0 });

  assert.deepEqual(options, { year: 1999, genres: ['Action'], type: 'movie', providerIds: [1899, 8], providerNames: ['HBO Max', 'Netflix'], ignoreStoreYear: true, page: 0 });
});

test('safeFetchJson revalidates a public redirect before following it', async () => {
  const calls = [];
  const fakeLookup = async () => [{ address: '203.0.113.10' }];
  const fakeFetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) return { status: 307, ok: false, headers: { get: (name) => name === 'location' ? 'https://catalog.example/data.json' : null } };
    return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({ metas: [] }) };
  };

  const result = await safeFetchJson(new URL('https://addon.example/catalog.json'), fakeFetch, fakeLookup);
  assert.deepEqual(result, { metas: [] });
  assert.deepEqual(calls, ['https://addon.example/catalog.json', 'https://catalog.example/data.json']);
});

test('safeFetchImage returns bounded public image data and rejects other content', async () => {
  const fakeLookup = async () => [{ address: '203.0.113.10' }];
  const image = await safeFetchImage('https://images.example/poster.jpg', async () => ({
    status: 200,
    ok: true,
    headers: { get: (name) => name === 'content-type' ? 'image/jpeg' : name === 'content-length' ? '3' : null },
    arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
  }), fakeLookup);
  assert.equal(image.contentType, 'image/jpeg');
  assert.deepEqual([...image.body], [1, 2, 3]);

  await assert.rejects(() => safeFetchImage('https://images.example/not-image', async () => ({
    status: 200,
    ok: true,
    headers: { get: (name) => name === 'content-type' ? 'text/html' : null },
  }), fakeLookup), /image/);
});

test('fetchStoreShelf aggregates year catalogues then applies the aisle', async () => {
  const requests = [];
  const fakeFetch = async (url) => {
    requests.push(url);
    const year = Number(url.match(/genre=(\d{4})/)[1]);
    return {
      ok: true,
      json: async () => ({ metas: [
        { id: `h-${year}`, type: 'movie', name: `Horror ${year}`, releaseInfo: String(year), genres: ['Horror'] },
        { id: `c-${year}`, type: 'movie', name: `Comedy ${year}`, releaseInfo: String(year), genres: ['Comedy'] },
      ] }),
    };
  };

  const titles = await fetchStoreShelf({
    source: { id: 'test', manifestUrl: 'https://addon.example/manifest.json', catalogs: [{ type: 'movie', id: 'year', extras: ['genre'], options: { genre: [] } }] },
    genre: 'Horror', year: 1999, type: 'movie', fetchImpl: fakeFetch, yearWindow: 3, pageCount: 1,
  });

  assert.equal(requests.length, 3);
  assert.deepEqual(titles.map((item) => item.id), ['h-1999', 'h-1998', 'h-1997']);
});

test('fetchStoreShelf merges related genre catalogue pages into one aisle', async () => {
  const requests = [];
  const fakeFetch = async (url) => {
    requests.push(url);
    const genre = decodeURIComponent(url.match(/genre=([^&.]+)/)[1]);
    return { ok: true, json: async () => ({ metas: [
      { id: genre.toLowerCase(), type: 'movie', name: genre, releaseInfo: '1999', genres: [genre] },
    ] }) };
  };
  const titles = await fetchStoreShelf({
    source: {
      id: 'test', manifestUrl: 'https://addon.example/manifest.json',
      catalogs: [{ type: 'movie', id: 'top', extras: ['genre'], options: { genre: ['Crime', 'Thriller'] }, pageSize: 50 }],
    },
    genres: ['Crime', 'Thriller', 'Mystery'], year: 1999, type: 'movie', fetchImpl: fakeFetch, pageCount: 1,
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(titles.map((item) => item.id).sort(), ['crime', 'thriller']);
});

test('fetchStoreShelf paginates capability-matched year catalogues and keeps healthy pages', async () => {
  const requests = [];
  const fakeFetch = async (url) => {
    requests.push(url);
    if (url.includes('skip=50')) throw new Error('temporary page failure');
    const year = Number(url.match(/genre=(\d{4})/)[1]);
    const skip = Number(url.match(/skip=(\d+)/)[1]);
    return {
      ok: true,
      json: async () => ({ metas: [
        { id: `h-${year}-${skip}`, type: 'movie', name: `Horror ${year} ${skip}`, releaseInfo: String(year), genres: ['Horror'] },
      ] }),
    };
  };

  const titles = await fetchStoreShelf({
    source: {
      id: 'tmdb',
      manifestUrl: 'https://addon.example/manifest.json',
      catalogs: [{ type: 'movie', id: 'tmdb.year', extras: ['genre', 'skip'], options: { genre: ['1999', '1998'] }, pageSize: 50 }],
    },
    genre: 'Horror', year: 1999, type: 'movie', fetchImpl: fakeFetch, yearWindow: 2, pageCount: 3,
  });

  assert.equal(requests.length, 6);
  assert.ok(requests.some((url) => url.includes('tmdb.year/genre=1999&skip=100.json')));
  assert.deepEqual(titles.map((item) => item.id), ['h-1999-0', 'h-1999-100', 'h-1998-0', 'h-1998-100']);
});

test('fetchStoreShelf requests the next catalogue pages for a later stand', async () => {
  const requests = [];
  const fakeFetch = async (url) => {
    requests.push(url);
    const skip = Number(url.match(/skip=(\d+)/)[1]);
    return { ok: true, json: async () => ({ metas: [
      { id: `h-${skip}`, type: 'movie', name: `Horror ${skip}`, releaseInfo: '1999', genres: ['Horror'] },
    ] }) };
  };

  const titles = await fetchStoreShelf({
    source: {
      id: 'tmdb', manifestUrl: 'https://addon.example/manifest.json',
      catalogs: [{ type: 'movie', id: 'tmdb.year', extras: ['genre', 'skip'], options: { genre: ['1999'] }, pageSize: 50 }],
    },
    genre: 'Horror', year: 1999, type: 'movie', fetchImpl: fakeFetch, yearWindow: 1, pageCount: 2, page: 1,
  });

  assert.deepEqual(requests.map((url) => Number(url.match(/skip=(\d+)/)[1])), [100, 150]);
  assert.deepEqual(titles.map((item) => item.id), ['h-100', 'h-150']);
});
