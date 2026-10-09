'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { createTmdbClient } = require('../src/tmdb.js');
const { createServer } = require('../src/server.js');

function stub({ personData, externalIds = {}, availability = {} }) {
  return async (input) => {
    const url = new URL(String(input));
    if (/^\/3\/person\/[1-9][0-9]*$/.test(url.pathname)) {
      assert.equal(url.searchParams.get('append_to_response'), 'combined_credits');
      return { ok: true, json: async () => personData };
    }
    let match = url.pathname.match(/^\/3\/(movie|tv)\/(\d+)\/external_ids$/);
    if (match) {
      const key = `${match[1]}:${match[2]}`;
      return { ok: true, json: async () => ({ imdb_id: Object.hasOwn(externalIds, key) ? externalIds[key] : `tt${String(match[2]).padStart(7, '0')}` }) };
    }
    match = url.pathname.match(/^\/3\/(movie|tv)\/(\d+)\/watch\/providers$/);
    if (match) {
      const key = `${match[1]}:${match[2]}`;
      return { ok: true, json: async () => ({ results: { BR: Object.hasOwn(availability, key) ? availability[key] : { link: '', flatrate: [] } } }) };
    }
    throw new Error(`Unexpected request: ${url}`);
  };
}

function tarantinoFixture() {
  return {
    id: 138, name: 'Quentin Tarantino', known_for_department: 'Directing', profile_path: '/qt.jpg',
    combined_credits: {
      cast: [
        { id: 680, media_type: 'movie', title: 'Pulp Fiction', release_date: '1994-10-14', vote_count: 30000, popularity: 90, character: 'Jimmie Dimmick' },
        { id: 24, media_type: 'movie', title: 'Kill Bill', release_date: '2003-10-10', vote_count: 20000, popularity: 80, character: 'Crazy 88' },
        { id: 1, media_type: 'movie', title: 'Talk Show', release_date: '2000-01-01', vote_count: 10, character: 'Self - Guest' },
        { id: 2, media_type: 'movie', title: 'Documentary', release_date: '2001-01-01', vote_count: 9, character: 'Himself' },
      ],
      crew: [
        { id: 680, media_type: 'movie', title: 'Pulp Fiction', release_date: '1994-10-14', vote_count: 30000, popularity: 90, department: 'Directing', job: 'Director' },
        { id: 24, media_type: 'movie', title: 'Kill Bill', release_date: '2003-10-10', vote_count: 20000, popularity: 80, department: 'Directing', job: 'Director' },
        { id: 680, media_type: 'movie', title: 'Pulp Fiction', release_date: '1994-10-14', vote_count: 100, popularity: 2, department: 'Directing', job: 'Director' },
        { id: 680, media_type: 'movie', title: 'Pulp Fiction', release_date: '1994-10-14', vote_count: 30000, popularity: 90, department: 'Writing', job: 'Screenplay' },
        { id: 24, media_type: 'movie', title: 'Kill Bill', release_date: '2003-10-10', vote_count: 20000, popularity: 80, department: 'Writing', job: 'Writer' },
        { id: 500, media_type: 'movie', title: 'Stunt Reel', release_date: '1990-01-01', vote_count: 5, department: 'Crew', job: 'Stunts' },
      ],
    },
  };
}

function actingFixture(count) {
  return {
    id: 138, name: 'Test Actor', known_for_department: 'Acting', profile_path: '/actor.jpg',
    combined_credits: {
      cast: Array.from({ length: count }, (_, index) => ({
        id: 1000 + index, media_type: 'movie', title: `Film ${index + 1}`, release_date: '1999-01-01',
        vote_count: 1000 - index, popularity: 50 - index, genre_ids: [18], poster_path: `/p${index}.jpg`,
      })),
      crew: [],
    },
  };
}

test('local TMDB client exposes a person profile with allowlisted roles', async () => {
  const client = createTmdbClient({ apiKey: 'test-key', fetchImpl: stub({ personData: tarantinoFixture() }) });
  const person = await client.personProfile('138');

  assert.equal(person.id, '138');
  assert.equal(person.name, 'Quentin Tarantino');
  assert.equal(person.profile, 'https://image.tmdb.org/t/p/w185/qt.jpg');
  assert.equal(person.knownFor, 'Directing');
  assert.deepEqual(person.roles, [
    { department: 'Acting', job: 'Acting', count: 4 },
    { department: 'Directing', job: 'Director', count: 3 },
    { department: 'Writing', job: 'Screenplay', count: 1 },
    { department: 'Writing', job: 'Writer', count: 1 },
  ]);
});

test('local TMDB client drops undated credits so announced projects stay off a stand', async () => {
  const personData = {
    id: 138, name: 'U', combined_credits: { cast: [
      { id: 601, media_type: 'movie', title: 'Released', release_date: '1999-05-01', vote_count: 30 },
      { id: 602, media_type: 'movie', title: 'Announced', vote_count: 900 },
    ], crew: [] },
  };
  const client = createTmdbClient({ apiKey: 'test-key', fetchImpl: stub({ personData }) });
  const stand = await client.personCreditStand({ person: '138', department: 'Acting', type: 'movie', year: 1999, ignoreStoreYear: true });

  assert.deepEqual(stand.titles.map((title) => title.id), ['tmdb:601']);
  assert.equal(stand.person.total, 1);
});

test('local TMDB client filters a credit stand by department, job, self-credit, and dedupe', async () => {
  const client = createTmdbClient({ apiKey: 'test-key', fetchImpl: stub({ personData: tarantinoFixture() }) });
  const base = { person: '138', type: 'movie', year: 2004, ignoreStoreYear: true };

  const directing = await client.personCreditStand({ ...base, department: 'Directing', job: 'Director' });
  assert.deepEqual(directing.titles.map((title) => title.id), ['tmdb:680', 'tmdb:24']);
  assert.equal(directing.person.total, 2);
  assert.equal(directing.titles[0].source, 'tmdb-person');
  assert.equal(directing.titles[0].imdbId, 'tt0000680');

  const screenplay = await client.personCreditStand({ ...base, department: 'Writing', job: 'Screenplay' });
  assert.deepEqual(screenplay.titles.map((title) => title.id), ['tmdb:680']);

  const acting = await client.personCreditStand({ ...base, department: 'Acting' });
  assert.deepEqual(acting.titles.map((title) => title.id), ['tmdb:680', 'tmdb:24']);
  assert.equal(acting.person.total, 2);
});

test('local TMDB client intersects a credit stand with requested Brazil providers', async () => {
  const personData = {
    id: 138, name: 'P', combined_credits: { cast: [
      { id: 401, media_type: 'movie', title: 'On Netflix', release_date: '1999-01-01', vote_count: 30 },
      { id: 402, media_type: 'movie', title: 'Elsewhere', release_date: '1999-02-01', vote_count: 20 },
    ], crew: [] },
  };
  const availability = {
    'movie:401': { link: 'https://www.themoviedb.org/movie/401/watch?locale=BR', flatrate: [{ provider_id: 8, provider_name: 'Netflix' }] },
    'movie:402': { link: 'https://www.themoviedb.org/movie/402/watch?locale=BR', flatrate: [{ provider_id: 11, provider_name: 'MUBI' }] },
  };
  const client = createTmdbClient({ apiKey: 'test-key', fetchImpl: stub({ personData, availability }) });
  const stand = await client.personCreditStand({ person: '138', department: 'Acting', type: 'movie', year: 1999, ignoreStoreYear: true, providers: ['netflix'] });

  assert.deepEqual(stand.titles.map((title) => title.id), ['tmdb:401']);
  assert.deepEqual(stand.titles[0].availabilityBR, {
    link: 'https://www.themoviedb.org/movie/401/watch?locale=BR', providers: ['Netflix'], subscriptionProviders: ['Netflix'],
  });
  assert.equal(stand.person.total, 2);
  assert.deepEqual(stand.providers, ['netflix']);
});

test('local TMDB client pages a credit stand at 40 titles', async () => {
  const client = createTmdbClient({ apiKey: 'test-key', fetchImpl: stub({ personData: actingFixture(45) }) });
  const base = { person: '138', department: 'Acting', type: 'movie', year: 1999, ignoreStoreYear: true };

  const first = await client.personCreditStand({ ...base, stand: 0 });
  assert.equal(first.titles.length, 40);
  assert.equal(first.titles[0].id, 'tmdb:1000');
  assert.equal(first.hasNextStand, true);

  const second = await client.personCreditStand({ ...base, stand: 1 });
  assert.equal(second.titles.length, 5);
  assert.equal(second.titles[0].id, 'tmdb:1040');
  assert.equal(second.hasNextStand, false);
});

function mixedCreditFixture() {
  return {
    id: 138, name: 'Mixed', known_for_department: 'Acting', profile_path: '/mixed.jpg',
    combined_credits: {
      cast: [
        { id: 801, media_type: 'movie', title: 'Movie One', release_date: '1990-01-01', vote_count: 100, popularity: 10 },
        { id: 802, media_type: 'tv', name: 'Show One', first_air_date: '2005-01-01', vote_count: 300, popularity: 30 },
        { id: 803, media_type: 'movie', title: 'Movie Two', release_date: '1995-01-01', vote_count: 200, popularity: 20 },
        { id: 804, media_type: 'tv', name: 'Show Two', first_air_date: '2000-01-01', vote_count: 400, popularity: 40 },
      ],
      crew: [],
    },
  };
}

test('local TMDB client orders a credit stand with a person movies before their series', async () => {
  const client = createTmdbClient({ apiKey: 'test-key', fetchImpl: stub({ personData: mixedCreditFixture() }) });
  const base = { person: '138', department: 'Acting', type: 'all', year: 2020, ignoreStoreYear: true };

  // Every movie precedes every series; each group keeps the requested sort internally.
  const relevance = await client.personCreditStand({ ...base, sort: 'relevance' });
  assert.deepEqual(relevance.titles.map((title) => title.id), ['tmdb:803', 'tmdb:801', 'tmdb:804', 'tmdb:802']);

  const year = await client.personCreditStand({ ...base, sort: 'year' });
  assert.deepEqual(year.titles.map((title) => title.id), ['tmdb:803', 'tmdb:801', 'tmdb:802', 'tmdb:804']);

  // A single-type stand is unchanged: only movies, still in the requested order.
  const movieOnly = await client.personCreditStand({ ...base, type: 'movie', sort: 'relevance' });
  assert.deepEqual(movieOnly.titles.map((title) => title.id), ['tmdb:803', 'tmdb:801']);
});

test('local server exposes person and credit-stand routes with Worker-shaped validation', async (t) => {
  const client = createTmdbClient({ apiKey: 'test-key', fetchImpl: stub({ personData: tarantinoFixture() }) });
  const server = createServer({ catalogue: { listSources: () => [], tmdbClient: client } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const person = await fetch(`${base}/api/person?id=138`);
  assert.equal(person.status, 200);
  const personBody = await person.json();
  assert.equal(personBody.person.name, 'Quentin Tarantino');
  assert.equal(personBody.person.roles.length, 4);
  assert.equal((await fetch(`${base}/api/person?id=abc`)).status, 400);
  assert.equal((await fetch(`${base}/api/person?id=138&locale=fr-FR`)).status, 400);
  assert.equal((await fetch(`${base}/api/person?id=138`, { method: 'POST' })).status, 405);

  const stand = await fetch(`${base}/api/credit-stand?person=138&department=Directing&job=Director&type=movie&year=2004&ignoreStoreYear=true`);
  assert.equal(stand.status, 200);
  const standBody = await stand.json();
  assert.deepEqual(standBody.titles.map((title) => title.id), ['tmdb:680', 'tmdb:24']);
  assert.deepEqual(standBody.person, { id: '138', name: 'Quentin Tarantino', department: 'Directing', job: 'Director', total: 2, profile: 'https://image.tmdb.org/t/p/w185/qt.jpg' });

  for (const query of ['person=abc&department=Directing&year=2004', 'person=138&department=Nope&year=2004', 'person=138&department=Directing&year=2027', 'person=138&department=Directing&year=2004&sort=chrono']) {
    const response = await fetch(`${base}/api/credit-stand?${query}`);
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), { error: 'Invalid credit stand filters' });
  }
});

test('local server reports an unconfigured TMDB bridge without leaking a secret', async (t) => {
  const server = createServer({ catalogue: { listSources: () => [], tmdbClient: { enabled: false } } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/person?id=138`);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Catalogue service is not configured' });
});

// --- Sort by year or rating (Addendum 2) -------------------------------------

function ratedFixture() {
  return {
    id: 138, name: 'Rated Person', known_for_department: 'Acting', profile_path: '/rated.jpg',
    combined_credits: {
      cast: [
        { id: 701, media_type: 'movie', title: 'Old Masterpiece', release_date: '1970-01-01', vote_count: 500, vote_average: 9.0, popularity: 5 },
        { id: 702, media_type: 'movie', title: 'New Blockbuster', release_date: '2019-01-01', vote_count: 400, vote_average: 7.0, popularity: 80 },
        { id: 703, media_type: 'movie', title: 'Middle', release_date: '1995-01-01', vote_count: 300, vote_average: 8.0, popularity: 20 },
      ],
      crew: [],
    },
  };
}

test('local TMDB client maps provider-shelf sort to TMDB sort_by and a rating vote floor', async () => {
  const requests = [];
  const client = createTmdbClient({
    apiKey: 'test-key',
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.startsWith('/3/discover/')) return { ok: true, json: async () => ({ results: [] }) };
      throw new Error(`Unexpected request: ${url}`);
    },
  });
  const discover = () => requests.filter((url) => url.pathname.startsWith('/3/discover/'));

  await client.discoverProviderShelf({ year: 2000, genres: ['Action'], type: 'movie', providerIds: [8], sort: 'relevance' });
  assert.ok(discover().length);
  assert.ok(discover().every((url) => url.searchParams.get('sort_by') === 'popularity.desc' && !url.searchParams.has('vote_count.gte')));

  requests.length = 0;
  await client.discoverProviderShelf({ year: 2000, genres: ['Action'], type: 'movie', providerIds: [8], sort: 'year' });
  assert.ok(discover().every((url) => url.searchParams.get('sort_by') === 'primary_release_date.desc'));

  requests.length = 0;
  await client.discoverProviderShelf({ year: 2000, genres: ['Action'], type: 'series', providerIds: [8], sort: 'year' });
  assert.ok(discover().every((url) => url.searchParams.get('sort_by') === 'first_air_date.desc'));

  requests.length = 0;
  await client.discoverProviderShelf({ year: 2000, genres: ['Action'], type: 'movie', providerIds: [8], sort: 'rating' });
  assert.ok(discover().every((url) => url.searchParams.get('sort_by') === 'vote_average.desc' && url.searchParams.get('vote_count.gte') === '200'));
});

test('local TMDB client reorders a credit stand by year and rating', async () => {
  const client = createTmdbClient({ apiKey: 'test-key', fetchImpl: stub({ personData: ratedFixture() }) });
  const base = { person: '138', department: 'Acting', type: 'movie', year: 2020, ignoreStoreYear: true };

  assert.deepEqual((await client.personCreditStand({ ...base, sort: 'relevance' })).titles.map((title) => title.id), ['tmdb:701', 'tmdb:702', 'tmdb:703']);
  assert.deepEqual((await client.personCreditStand({ ...base, sort: 'year' })).titles.map((title) => title.id), ['tmdb:702', 'tmdb:703', 'tmdb:701']);
  const rating = await client.personCreditStand({ ...base, sort: 'rating' });
  assert.deepEqual(rating.titles.map((title) => title.id), ['tmdb:701', 'tmdb:703', 'tmdb:702']);
  assert.equal(rating.sort, 'rating');
});

test('local TMDB client reorders the filmography before slicing so sorted paging stays monotone', async () => {
  const personData = { id: 138, name: 'Ordered', combined_credits: { cast: Array.from({ length: 45 }, (_, index) => ({
    id: 2000 + index, media_type: 'movie', title: `Film ${index}`, release_date: `${1950 + index}-01-01`,
    vote_count: 1000 - index, popularity: 100 - index,
  })), crew: [] } };
  const client = createTmdbClient({ apiKey: 'test-key', fetchImpl: stub({ personData }) });
  const base = { person: '138', department: 'Acting', type: 'movie', year: 2020, ignoreStoreYear: true, sort: 'year' };

  const first = await client.personCreditStand({ ...base, stand: 0 });
  assert.equal(first.titles.length, 40);
  assert.equal(first.titles[0].id, 'tmdb:2044');
  assert.equal(first.titles[39].id, 'tmdb:2005');

  const second = await client.personCreditStand({ ...base, stand: 1 });
  assert.equal(second.titles.length, 5);
  assert.equal(second.titles[0].id, 'tmdb:2004');
  assert.equal(second.titles[4].id, 'tmdb:2000');
});

test('local server validates and forwards the shelf sort parameter', async (t) => {
  const requested = [];
  const server = createServer({ catalogue: { listSources: () => [], shelf: async (options) => { requested.push(options); return []; } } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const ok = await fetch(`${base}/api/shelf?year=1999&genre=Action&type=movie&sort=rating`);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).sort, 'rating');
  assert.equal(requested[0].sort, 'rating');

  const bad = await fetch(`${base}/api/shelf?year=1999&genre=Action&type=movie&sort=chrono`);
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'Invalid shelf filters' });
});

test('local server reorders a credit stand by sort and rejects an unknown sort', async (t) => {
  const client = createTmdbClient({ apiKey: 'test-key', fetchImpl: stub({ personData: ratedFixture() }) });
  const server = createServer({ catalogue: { listSources: () => [], tmdbClient: client } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const year = await fetch(`${base}/api/credit-stand?person=138&department=Acting&type=movie&year=2020&ignoreStoreYear=true&sort=year`);
  assert.equal(year.status, 200);
  const yearBody = await year.json();
  assert.deepEqual(yearBody.titles.map((title) => title.id), ['tmdb:702', 'tmdb:703', 'tmdb:701']);
  assert.equal(yearBody.sort, 'year');

  const bad = await fetch(`${base}/api/credit-stand?person=138&department=Acting&type=movie&year=2020&ignoreStoreYear=true&sort=chrono`);
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'Invalid credit stand filters' });
});

test('local server accepts and forwards a mixed type=all shelf request', async (t) => {
  const requested = [];
  const server = createServer({ catalogue: { listSources: () => [], shelf: async (options) => { requested.push(options); return []; } } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const mixed = await fetch(`${base}/api/shelf?year=2000&genre=Action&type=all`);
  assert.equal(mixed.status, 200);
  assert.equal((await mixed.json()).type, 'all');
  assert.equal(requested[0].type, 'all');

  // An unknown type still degrades to the historical movie-only shelf.
  const unknown = await fetch(`${base}/api/shelf?year=2000&genre=Action&type=book`);
  assert.equal(unknown.status, 200);
  assert.equal(requested[1].type, 'movie');
});
