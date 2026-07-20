const test = require('node:test');
const assert = require('node:assert/strict');

const {
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
