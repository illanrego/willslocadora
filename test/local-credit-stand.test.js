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

  for (const query of ['person=abc&department=Directing&year=2004', 'person=138&department=Nope&year=2004', 'person=138&department=Directing&year=2027']) {
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
