import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocadoraWorker } from '../workers/locadora-api/src/index.mjs';

const env = {
  ALLOWED_ORIGINS: 'https://will.github.io,http://127.0.0.1:4173,null',
  TMDB_API_KEY: 'test-key',
};

function context() {
  return { waitUntil() {} };
}

test('Worker allows the exact null origin emitted by signed Samsung widgets', async () => {
  const worker = createLocadoraWorker({ fetchImpl: async () => Response.json({ title: 'The Matrix' }) });
  const response = await worker.fetch(new Request('https://api.example/v1/health', { headers: { origin: 'null' } }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'null');
});

test('public worker exposes the Brazil provider registry with exact CORS', async () => {
  const worker = createLocadoraWorker({ fetchImpl: async () => { throw new Error('not needed'); } });
  const response = await worker.fetch(new Request('https://api.example/v1/providers', {
    headers: { origin: 'https://will.github.io' },
  }), env, context());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://will.github.io');
  const { providers } = await response.json();
  assert.deepEqual(providers.find((provider) => provider.id === 'globoplay'), {
    id: 'globoplay', tmdbProviderId: 307, canonicalName: 'Globoplay', displayName: 'Globoplay', logoPath: '/images/providers/globoplay.svg',
  });
});

test('public worker exposes only the catalogue policy version and filters blocked search titles', async () => {
  const worker = createLocadoraWorker({
    fetchImpl: async (input) => {
      const url = new URL(input);
      if (url.pathname === '/3/search/tv') return Response.json({ results: [] });
      assert.equal(url.pathname, '/3/search/movie');
      return Response.json({ results: [
        { id: 603, title: 'The Matrix', release_date: '1999-03-31' },
        { id: 604, title: 'The Matrix Reloaded', release_date: '2003-05-15' },
      ] });
    },
  });
  const catalogueEnv = { ...env, CATALOGUE_POLICY: { async get() { return { version: 4, activeKeys: ['movie:603'] }; } } };
  const version = await worker.fetch(new Request('https://api.example/v1/catalogue-policy'), catalogueEnv, context());
  assert.equal(version.status, 200);
  assert.deepEqual(await version.json(), { version: 4 });
  const response = await worker.fetch(new Request('https://api.example/v1/search?q=matrix&locale=en-US'), catalogueEnv, context());
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).titles.map((title) => title.id), ['tmdb:604']);
});

test('public worker returns a neutral unavailable response for blocked title metadata', async () => {
  let upstreamCalls = 0;
  const worker = createLocadoraWorker({ fetchImpl: async () => { upstreamCalls += 1; throw new Error('must not fetch blocked title'); } });
  const catalogueEnv = { ...env, CATALOGUE_POLICY: { async get() { return { version: 7, activeKeys: ['movie:603'] }; } } };
  const response = await worker.fetch(new Request('https://api.example/v1/title?type=movie&id=tmdb%3A603&locale=pt-BR'), catalogueEnv, context());
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Catalogue title unavailable' });
  assert.equal(upstreamCalls, 0);
});

test('public worker rejects unknown origins and invalid shelf requests before calling upstreams', async () => {
  let upstreamCalls = 0;
  const worker = createLocadoraWorker({ fetchImpl: async () => { upstreamCalls += 1; throw new Error('not needed'); } });

  const forbiddenOrigin = await worker.fetch(new Request('https://api.example/v1/providers', {
    headers: { origin: 'https://not-allowed.example' },
  }), env, context());
  assert.equal(forbiddenOrigin.status, 403);

  const invalidShelf = await worker.fetch(new Request('https://api.example/v1/shelf?year=2027&genre=Action&type=movie'), env, context());
  assert.equal(invalidShelf.status, 400);
  assert.equal(upstreamCalls, 0);
});

test('public worker rate limits catalogue routes without blocking health checks', async () => {
  const worker = createLocadoraWorker({ fetchImpl: async () => assert.fail('must not call TMDB') });
  const limitedEnv = { ...env, CATALOG_RATE_LIMITER: { async limit() { return { success: false }; } } };
  const limited = await worker.fetch(new Request('https://api.example/v1/search?q=matrix', { headers: { origin: 'https://will.github.io', 'cf-connecting-ip': '203.0.113.1' } }), limitedEnv, context());
  const health = await worker.fetch(new Request('https://api.example/v1/health', { headers: { origin: 'https://will.github.io', 'cf-connecting-ip': '203.0.113.1' } }), limitedEnv, context());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal(health.status, 200);
});

test('public worker normalizes title metadata without exposing its TMDB key', async () => {
  const worker = createLocadoraWorker({
    fetchImpl: async (input) => {
      const url = new URL(input);
      assert.equal(url.searchParams.get('api_key'), 'test-key');
      if (url.pathname === '/3/find/tt0133093') {
        assert.equal(url.searchParams.get('external_source'), 'imdb_id');
        return Response.json({ movie_results: [{ id: 603 }] });
      }
      assert.equal(url.pathname, '/3/movie/603');
      assert.equal(url.searchParams.get('append_to_response'), 'credits,watch/providers,release_dates,images,external_ids');
      return Response.json({
        title: 'The Matrix', overview: 'A choice.', release_date: '1999-03-31', poster_path: '/matrix.jpg', vote_average: 8.2, genres: [{ id: 28, name: 'Action' }],
        credits: { crew: [{ job: 'Director', name: 'Lana Wachowski' }, { job: 'Screenplay', name: 'Lilly Wachowski' }], cast: [{ name: 'Keanu Reeves' }] },
        'watch/providers': { results: { BR: { link: 'https://www.themoviedb.org/movie/603/watch?locale=BR', flatrate: [{ provider_name: 'Netflix', logo_path: '/netflix.png' }] } } },
        release_dates: { results: [{ iso_3166_1: 'BR', release_dates: [{ certification: '14' }] }] },
        images: { logos: [{ iso_639_1: 'pt', file_path: '/matrix-logo.png' }] },
        external_ids: { imdb_id: 'tt0133093' },
      });
    },
  });

  const response = await worker.fetch(new Request('https://api.example/v1/title?type=movie&id=tt0133093&locale=pt-BR'), env, context());
  assert.equal(response.status, 200);
  const { meta } = await response.json();
  assert.equal(meta.name, 'The Matrix');
  assert.equal(meta.id, 'tt0133093');
  assert.equal(meta.poster, 'https://image.tmdb.org/t/p/w500/matrix.jpg');
  assert.deepEqual(meta.director, ['Lana Wachowski']);
  assert.deepEqual(meta.writer, ['Lilly Wachowski']);
  assert.deepEqual(meta.cast, ['Keanu Reeves']);
  assert.equal(meta.certificationBR, '14');
  assert.equal(meta.logo, 'https://image.tmdb.org/t/p/w500/matrix-logo.png');
  assert.deepEqual(meta.availabilityBR.providers, ['Netflix']);
  assert.equal(JSON.stringify(meta).includes('test-key'), false);
});

test('public worker edge-caches stable title metadata and reapplies exact CORS', async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const stored = new Map();
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
    async match(request) { return stored.get(request.url)?.clone(); },
    async put(request, response) { stored.set(request.url, response.clone()); },
  } } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'caches', original); else delete globalThis.caches; });
  let upstreamCalls = 0;
  const pending = [];
  const worker = createLocadoraWorker({ fetchImpl: async () => {
    upstreamCalls += 1;
    return Response.json({ title: 'The Matrix', release_date: '1999-03-31', genres: [] });
  } });
  const cacheEnv = { ...env, ALLOWED_ORIGINS: `${env.ALLOWED_ORIGINS},https://other.example` };
  const first = await worker.fetch(new Request('https://api.example/v1/title?type=movie&id=tmdb%3A603&locale=pt-BR', { headers: { origin: 'https://will.github.io' } }), cacheEnv, { waitUntil(promise) { pending.push(promise); } });
  await Promise.all(pending);
  const second = await worker.fetch(new Request('https://api.example/v1/title?locale=pt-BR&id=tmdb%3A603&type=movie&ignored=1', { headers: { origin: 'https://other.example' } }), cacheEnv, context());
  assert.equal(first.headers.get('x-locadora-cache'), 'MISS');
  assert.equal(second.headers.get('x-locadora-cache'), 'HIT');
  assert.equal(second.headers.get('access-control-allow-origin'), 'https://other.example');
  assert.equal(upstreamCalls, 1);
});

test('public worker returns three featured titles for a selected store year', async () => {
  const worker = createLocadoraWorker({
    fetchImpl: async (input) => {
      const url = new URL(input);
      assert.equal(url.pathname, '/3/discover/movie');
      assert.equal(url.searchParams.get('primary_release_date.gte'), '1999-01-01');
      return Response.json({ results: [
        { id: 1, title: 'First', release_date: '1999-01-01', poster_path: '/first.jpg' },
        { id: 2, title: 'Second', release_date: '1999-02-01', poster_path: '/second.jpg' },
        { id: 3, title: 'Third', release_date: '1999-03-01', poster_path: '/third.jpg' },
        { id: 4, title: 'Fourth', release_date: '1999-04-01', poster_path: '/fourth.jpg' },
      ] });
    },
  });
  const response = await worker.fetch(new Request('https://api.example/v1/featured?year=1999'), env, context());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.year, 1999);
  assert.deepEqual(body.titles.map((title) => title.name), ['First', 'Second', 'Third']);
});

test('public worker proxies only TMDB poster URLs', async () => {
  const worker = createLocadoraWorker({
    fetchImpl: async (input) => {
      assert.equal(String(input), 'https://image.tmdb.org/t/p/w500/poster.jpg');
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
    },
  });
  const allowed = await worker.fetch(new Request('https://api.example/v1/image?url=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw500%2Fposter.jpg'), env, context());
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('content-type'), 'image/jpeg');
  assert.equal((await allowed.arrayBuffer()).byteLength, 3);

  const blocked = await worker.fetch(new Request('https://api.example/v1/image?url=https%3A%2F%2Fevil.example%2Fposter.jpg'), env, context());
  assert.equal(blocked.status, 400);
});

test('public worker uses TMDB Brazil flatrate discovery for provider-filtered shelves', async () => {
  const requested = [];
  const worker = createLocadoraWorker({
    fetchImpl: async (input) => {
      const url = new URL(input);
      requested.push(url);
      if (url.pathname === '/3/discover/tv') {
        return Response.json({ results: [{ id: 11, name: 'Novela', first_air_date: '2004-01-01', genre_ids: [10766], poster_path: '/poster.jpg' }] });
      }
      if (url.pathname === '/3/tv/11/external_ids') return Response.json({ imdb_id: 'tt0000011' });
      throw new Error(`Unexpected upstream URL: ${url}`);
    },
  });

  const response = await worker.fetch(new Request('https://api.example/v1/shelf?year=2010&genre=Romance&type=series&providers=globoplay,prime-video'), env, context());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.titles[0].id, 'tmdb:11');
  assert.equal(body.titles[0].imdbId, 'tt0000011');
  assert.equal(body.hasNextStand, false);
  assert.deepEqual(body.titles[0].genres, ['Romance']);

  const discovery = requested.find((url) => url.pathname === '/3/discover/tv');
  assert.equal(discovery.searchParams.get('watch_region'), 'BR');
  assert.equal(discovery.searchParams.get('with_watch_monetization_types'), 'flatrate');
  assert.equal(discovery.searchParams.get('with_watch_providers'), '119|307');
  assert.equal(discovery.searchParams.get('with_genres'), '10766');
  assert.equal(discovery.searchParams.get('include_adult'), 'false');
});

// --- Credit stands (Phase A) -------------------------------------------------

function creditStub({ personData, externalIds = {}, availability = {}, requests = [] } = {}) {
  return async (input) => {
    const url = new URL(input);
    requests.push(url);
    if (/^\/3\/person\/[1-9][0-9]*$/.test(url.pathname)) {
      assert.equal(url.searchParams.get('append_to_response'), 'combined_credits');
      return Response.json(personData);
    }
    let match = url.pathname.match(/^\/3\/(movie|tv)\/(\d+)\/external_ids$/);
    if (match) {
      const key = `${match[1]}:${match[2]}`;
      return Response.json({ imdb_id: Object.hasOwn(externalIds, key) ? externalIds[key] : `tt${String(match[2]).padStart(7, '0')}` });
    }
    match = url.pathname.match(/^\/3\/(movie|tv)\/(\d+)\/watch\/providers$/);
    if (match) {
      const key = `${match[1]}:${match[2]}`;
      return Response.json({ results: { BR: Object.hasOwn(availability, key) ? availability[key] : { link: `https://www.themoviedb.org/movie/${match[2]}/watch?locale=BR`, flatrate: [] } } });
    }
    throw new Error(`Unexpected upstream URL: ${url}`);
  };
}

function tarantinoFixture() {
  return {
    id: 138, name: 'Quentin Tarantino', known_for_department: 'Directing', profile_path: '/qt.jpg',
    combined_credits: {
      cast: [
        { id: 680, media_type: 'movie', title: 'Pulp Fiction', release_date: '1994-10-14', vote_count: 30000, popularity: 90, character: 'Jimmie Dimmick' },
        { id: 24, media_type: 'movie', title: 'Kill Bill', release_date: '2003-10-10', vote_count: 20000, popularity: 80, character: 'Crazy 88' },
        { id: 1, media_type: 'movie', title: 'Talk Show', release_date: '2000-01-01', vote_count: 10, popularity: 5, character: 'Self - Guest' },
        { id: 2, media_type: 'movie', title: 'Documentary', release_date: '2001-01-01', vote_count: 9, popularity: 4, character: 'Himself' },
      ],
      crew: [
        { id: 680, media_type: 'movie', title: 'Pulp Fiction', release_date: '1994-10-14', vote_count: 30000, popularity: 90, department: 'Directing', job: 'Director' },
        { id: 24, media_type: 'movie', title: 'Kill Bill', release_date: '2003-10-10', vote_count: 20000, popularity: 80, department: 'Directing', job: 'Director' },
        { id: 680, media_type: 'movie', title: 'Pulp Fiction', release_date: '1994-10-14', vote_count: 100, popularity: 2, department: 'Directing', job: 'Director' },
        { id: 680, media_type: 'movie', title: 'Pulp Fiction', release_date: '1994-10-14', vote_count: 30000, popularity: 90, department: 'Writing', job: 'Screenplay' },
        { id: 24, media_type: 'movie', title: 'Kill Bill', release_date: '2003-10-10', vote_count: 20000, popularity: 80, department: 'Writing', job: 'Writer' },
        { id: 500, media_type: 'movie', title: 'Stunt Reel', release_date: '1990-01-01', vote_count: 5, popularity: 1, department: 'Crew', job: 'Stunts' },
      ],
    },
  };
}

function actingFixture(count, startYear = 1999) {
  return {
    id: 138, name: 'Test Actor', known_for_department: 'Acting', profile_path: '/actor.jpg',
    combined_credits: {
      cast: Array.from({ length: count }, (_, index) => ({
        id: 1000 + index, media_type: 'movie', title: `Film ${index + 1}`, release_date: `${startYear}-01-01`,
        vote_count: 1000 - index, popularity: 50 - index, genre_ids: [18], poster_path: `/p${index}.jpg`,
      })),
      crew: [],
    },
  };
}

test('public worker exposes a person profile with allowlisted roles and long-lived cache headers', async () => {
  const worker = createLocadoraWorker({ fetchImpl: creditStub({ personData: tarantinoFixture() }) });
  const response = await worker.fetch(new Request('https://api.example/v1/person?id=138&locale=pt-BR', { headers: { origin: 'https://will.github.io' } }), env, context());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=86400, s-maxage=604800, stale-if-error=604800');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://will.github.io');
  const { person } = await response.json();
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

test('public worker returns an empty profile image when TMDB has none', async () => {
  const worker = createLocadoraWorker({ fetchImpl: creditStub({ personData: { id: 5, name: 'No Face', combined_credits: { cast: [], crew: [] } } }) });
  const response = await worker.fetch(new Request('https://api.example/v1/person?id=5'), env, context());
  const { person } = await response.json();
  assert.equal(person.profile, '');
  assert.deepEqual(person.roles, []);
});

test('public worker rejects invalid person requests before calling TMDB', async () => {
  let calls = 0;
  const worker = createLocadoraWorker({ fetchImpl: async () => { calls += 1; throw new Error('not needed'); } });
  for (const query of ['id=abc', 'id=0', 'id=138&locale=fr-FR', 'id=']) {
    const response = await worker.fetch(new Request(`https://api.example/v1/person?${query}`), env, context());
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), { error: 'Invalid person request' });
  }
  assert.equal(calls, 0);
});

test('public worker returns a neutral error when the TMDB person lookup fails', async () => {
  const worker = createLocadoraWorker({ fetchImpl: async () => new Response('nope', { status: 500 }) });
  const response = await worker.fetch(new Request('https://api.example/v1/person?id=138'), env, context());
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Catalogue service is temporarily unavailable' });
});

test('public worker filters a credit stand by department and job, excludes self credits, and dedupes', async () => {
  const worker = createLocadoraWorker({ fetchImpl: creditStub({ personData: tarantinoFixture() }) });
  const base = 'https://api.example/v1/credit-stand?person=138&type=movie&year=2004&ignoreStoreYear=true';

  const directing = await worker.fetch(new Request(`${base}&department=Directing&job=Director`), env, context());
  const directingBody = await directing.json();
  assert.deepEqual(directingBody.titles.map((title) => title.id), ['tmdb:680', 'tmdb:24']);
  assert.equal(directingBody.person.total, 2);

  const screenplay = await worker.fetch(new Request(`${base}&department=Writing&job=Screenplay`), env, context());
  assert.deepEqual((await screenplay.json()).titles.map((title) => title.id), ['tmdb:680']);

  const acting = await worker.fetch(new Request(`${base}&department=Acting`), env, context());
  const actingBody = await acting.json();
  assert.deepEqual(actingBody.titles.map((title) => title.id), ['tmdb:680', 'tmdb:24']);
  assert.equal(actingBody.person.total, 2);
});

test('public worker pages a credit stand at 40 titles and reports hasNextStand', async () => {
  const worker = createLocadoraWorker({ fetchImpl: creditStub({ personData: actingFixture(45) }) });
  const base = 'https://api.example/v1/credit-stand?person=138&department=Acting&type=movie&year=1999&ignoreStoreYear=true';

  const first = await worker.fetch(new Request(`${base}&stand=0`), env, context());
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'public, max-age=3600, s-maxage=86400, stale-if-error=604800');
  const firstBody = await first.json();
  assert.equal(firstBody.titles.length, 40);
  assert.equal(firstBody.titles[0].id, 'tmdb:1000');
  assert.equal(firstBody.titles[0].imdbId, 'tt0001000');
  assert.equal(firstBody.titles[0].source, 'tmdb-person');
  assert.equal(firstBody.hasNextStand, true);
  assert.deepEqual(firstBody.person, { id: '138', name: 'Test Actor', department: 'Acting', job: '', total: 45, profile: 'https://image.tmdb.org/t/p/w185/actor.jpg' });
  assert.equal(firstBody.stand, 0);

  const second = await worker.fetch(new Request(`${base}&stand=1`), env, context());
  const secondBody = await second.json();
  assert.equal(secondBody.titles.length, 5);
  assert.equal(secondBody.titles[0].id, 'tmdb:1040');
  assert.equal(secondBody.hasNextStand, false);
});

test('public worker applies the store year window only when ignoreStoreYear is false', async () => {
  const personData = {
    id: 138, name: 'Y', combined_credits: { cast: [
      { id: 301, media_type: 'movie', title: 'New', release_date: '1994-05-01', vote_count: 30 },
      { id: 302, media_type: 'movie', title: 'Edge', release_date: '1990-01-01', vote_count: 20 },
      { id: 303, media_type: 'movie', title: 'Old', release_date: '1980-01-01', vote_count: 10 },
    ], crew: [] },
  };
  const worker = createLocadoraWorker({ fetchImpl: creditStub({ personData }) });
  const base = 'https://api.example/v1/credit-stand?person=138&department=Acting&type=movie&year=1994';

  const windowed = await worker.fetch(new Request(`${base}&ignoreStoreYear=false`), env, context());
  assert.deepEqual((await windowed.json()).titles.map((title) => title.id), ['tmdb:301', 'tmdb:302']);

  const all = await worker.fetch(new Request(`${base}&ignoreStoreYear=true`), env, context());
  assert.deepEqual((await all.json()).titles.map((title) => title.id), ['tmdb:301', 'tmdb:302', 'tmdb:303']);
});

test('public worker intersects credit-stand titles with requested Brazil providers', async () => {
  const personData = {
    id: 138, name: 'P', combined_credits: { cast: [
      { id: 401, media_type: 'movie', title: 'On Netflix', release_date: '1999-01-01', vote_count: 30 },
      { id: 402, media_type: 'movie', title: 'Elsewhere', release_date: '1999-02-01', vote_count: 20 },
    ], crew: [] },
  };
  const availability = {
    'movie:401': { link: 'https://www.themoviedb.org/movie/401/watch?locale=BR', flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png' }] },
    'movie:402': { link: 'https://www.themoviedb.org/movie/402/watch?locale=BR', flatrate: [{ provider_id: 11, provider_name: 'MUBI' }] },
  };
  const worker = createLocadoraWorker({ fetchImpl: creditStub({ personData, availability }) });
  const response = await worker.fetch(new Request('https://api.example/v1/credit-stand?person=138&department=Acting&type=movie&year=1999&ignoreStoreYear=true&providers=netflix'), env, context());
  const body = await response.json();
  assert.deepEqual(body.titles.map((title) => title.id), ['tmdb:401']);
  assert.deepEqual(body.titles[0].availabilityBR, {
    link: 'https://www.themoviedb.org/movie/401/watch?locale=BR', providers: ['Netflix'], subscriptionProviders: ['Netflix'],
  });
  assert.equal(body.person.total, 2);
  assert.deepEqual(body.providers, ['netflix']);
});

test('public worker keeps a provider-filtered credit stand inside the Workers subrequest budget', async () => {
  const personData = actingFixture(45);
  const availability = Object.fromEntries(Array.from({ length: 45 }, (_, index) => [`movie:${1000 + index}`, {
    link: `https://www.themoviedb.org/movie/${1000 + index}/watch?locale=BR`,
    flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png' }],
  }]));
  let upstreamCalls = 0;
  const stub = creditStub({ personData, availability });
  const worker = createLocadoraWorker({ fetchImpl: (input, init) => { upstreamCalls += 1; return stub(input, init); } });
  const base = 'https://api.example/v1/credit-stand?person=138&department=Acting&type=movie&year=1999&ignoreStoreYear=true&providers=netflix';

  const first = await worker.fetch(new Request(`${base}&stand=0`), env, context());
  const firstBody = await first.json();
  assert.equal(firstBody.titles.length, 20);
  assert.equal(firstBody.titles[0].id, 'tmdb:1000');
  assert.equal(firstBody.person.total, 45);
  assert.equal(firstBody.hasNextStand, true);
  // One combined_credits call + 20 availability lookups + 20 IMDb lookups: inside the free-plan cap of 50.
  assert.ok(upstreamCalls <= 42, `expected at most 42 upstream calls, saw ${upstreamCalls}`);

  const second = await worker.fetch(new Request(`${base}&stand=1`), env, context());
  const secondBody = await second.json();
  assert.equal(secondBody.titles[0].id, 'tmdb:1020');
  assert.equal(secondBody.hasNextStand, true);
});

test('public worker drops blocked credit-stand titles and titles without a real IMDb id', async () => {
  const personData = {
    id: 138, name: 'B', combined_credits: { cast: [
      { id: 501, media_type: 'movie', title: 'Kept', release_date: '1999-01-01', vote_count: 30 },
      { id: 502, media_type: 'movie', title: 'Blocked', release_date: '1999-02-01', vote_count: 20 },
      { id: 503, media_type: 'movie', title: 'No IMDb', release_date: '1999-03-01', vote_count: 10 },
    ], crew: [] },
  };
  const worker = createLocadoraWorker({ fetchImpl: creditStub({ personData, externalIds: { 'movie:503': '' } }) });
  const catalogueEnv = { ...env, CATALOGUE_POLICY: { async get() { return { version: 9, activeKeys: ['movie:502'] }; } } };
  const response = await worker.fetch(new Request('https://api.example/v1/credit-stand?person=138&department=Acting&type=movie&year=1999&ignoreStoreYear=true'), catalogueEnv, context());
  const body = await response.json();
  assert.deepEqual(body.titles.map((title) => title.id), ['tmdb:501']);
  assert.equal(body.person.total, 3);
});

test('public worker rejects invalid credit-stand filters before calling TMDB', async () => {
  let calls = 0;
  const worker = createLocadoraWorker({ fetchImpl: async () => { calls += 1; throw new Error('not needed'); } });
  const queries = [
    'person=abc&department=Acting&year=1999',
    'person=138&department=NotADepartment&year=1999',
    'person=138&department=Acting&year=2027',
    'person=138&department=Acting&year=1999&stand=99',
    'person=138&department=Acting&year=1999&providers=unknown',
    'person=138&department=Acting&year=1999&type=book',
    'person=138&department=Acting&year=1999&locale=fr-FR',
    'person=138&department=Acting&year=1999&sort=chrono',
    'department=Acting&year=1999',
  ];
  for (const query of queries) {
    const response = await worker.fetch(new Request(`https://api.example/v1/credit-stand?${query}`), env, context());
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), { error: 'Invalid credit stand filters' });
  }
  assert.equal(calls, 0);
});

test('public worker adds id-bearing credits to title metadata without changing the legacy arrays', async () => {
  const cast = Array.from({ length: 12 }, (_, index) => ({ id: 2000 + index, name: `Actor ${index}`, character: `Role ${index}` }));
  const crew = [
    { id: 138, name: 'Quentin Tarantino', department: 'Directing', job: 'Director' },
    { id: 138, name: 'Quentin Tarantino', department: 'Writing', job: 'Screenplay' },
    { id: 1000787, name: 'Sally Menke', department: 'Editing', job: 'Editor' },
    { id: 1000787, name: 'Sally Menke', department: 'Editing', job: 'Editor' },
    { id: 9, name: 'Grip Person', department: 'Crew', job: 'Grip' },
  ];
  const worker = createLocadoraWorker({
    fetchImpl: async (input) => {
      const url = new URL(input);
      if (url.pathname === '/3/find/tt0110912') return Response.json({ movie_results: [{ id: 680 }] });
      assert.equal(url.pathname, '/3/movie/680');
      return Response.json({
        title: 'Pulp Fiction', release_date: '1994-10-14', credits: { cast, crew },
        'watch/providers': { results: {} },
        external_ids: { imdb_id: 'tt0110912' },
      });
    },
  });
  const response = await worker.fetch(new Request('https://api.example/v1/title?type=movie&id=tt0110912&locale=pt-BR'), env, context());
  const { meta } = await response.json();
  assert.deepEqual(meta.director, ['Quentin Tarantino']);
  assert.deepEqual(meta.writer, ['Quentin Tarantino']);
  assert.equal(meta.cast.length, 10);
  assert.deepEqual(meta.credits.director, [{ id: '138', name: 'Quentin Tarantino' }]);
  assert.deepEqual(meta.credits.writer, [{ id: '138', name: 'Quentin Tarantino' }]);
  assert.equal(meta.credits.cast.length, 10);
  assert.deepEqual(meta.credits.cast[0], { id: '2000', name: 'Actor 0', character: 'Role 0' });
  assert.deepEqual(meta.credits.crew, [
    { id: '138', name: 'Quentin Tarantino', department: 'Directing', job: 'Director' },
    { id: '138', name: 'Quentin Tarantino', department: 'Writing', job: 'Screenplay' },
    { id: '1000787', name: 'Sally Menke', department: 'Editing', job: 'Editor' },
  ]);
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

function datedFixture(count) {
  return {
    id: 138, name: 'Ordered', combined_credits: { cast: Array.from({ length: count }, (_, index) => ({
      id: 2000 + index, media_type: 'movie', title: `Film ${index}`, release_date: `${1950 + index}-01-01`,
      vote_count: 1000 - index, popularity: 100 - index,
    })), crew: [] },
  };
}

test('public worker maps shelf sort to TMDB sort_by and a rating vote floor', async () => {
  const requests = [];
  const worker = createLocadoraWorker({
    fetchImpl: async (input) => {
      const url = new URL(input);
      requests.push(url);
      if (url.pathname === '/3/discover/movie' || url.pathname === '/3/discover/tv') return Response.json({ results: [] });
      throw new Error(`Unexpected upstream URL: ${url}`);
    },
  });
  const discover = () => requests.filter((url) => url.pathname.startsWith('/3/discover/'));

  const relevance = await worker.fetch(new Request('https://api.example/v1/shelf?year=2000&genre=Action&type=movie&sort=relevance'), env, context());
  assert.equal(relevance.status, 200);
  assert.equal((await relevance.json()).sort, 'relevance');
  assert.ok(discover().length);
  assert.ok(discover().every((url) => url.searchParams.get('sort_by') === 'popularity.desc' && !url.searchParams.has('vote_count.gte')));

  requests.length = 0;
  const movieYear = await worker.fetch(new Request('https://api.example/v1/shelf?year=2000&genre=Action&type=movie&sort=year'), env, context());
  assert.equal(movieYear.status, 200);
  assert.ok(discover().every((url) => url.searchParams.get('sort_by') === 'primary_release_date.desc' && !url.searchParams.has('vote_count.gte')));

  requests.length = 0;
  await worker.fetch(new Request('https://api.example/v1/shelf?year=2000&genre=Action&type=series&sort=year'), env, context());
  assert.ok(discover().every((url) => url.pathname === '/3/discover/tv' && url.searchParams.get('sort_by') === 'first_air_date.desc'));

  requests.length = 0;
  await worker.fetch(new Request('https://api.example/v1/shelf?year=2000&genre=Action&type=movie&sort=rating'), env, context());
  assert.ok(discover().every((url) => url.searchParams.get('sort_by') === 'vote_average.desc' && url.searchParams.get('vote_count.gte') === '200'));
});

test('public worker rejects an unknown shelf sort before calling TMDB', async () => {
  let calls = 0;
  const worker = createLocadoraWorker({ fetchImpl: async () => { calls += 1; throw new Error('not needed'); } });
  const response = await worker.fetch(new Request('https://api.example/v1/shelf?year=2000&genre=Action&type=movie&sort=chrono'), env, context());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid shelf filters' });
  assert.equal(calls, 0);
});

test('public worker reorders a credit stand by year and rating while relevance stays the default', async () => {
  const worker = createLocadoraWorker({ fetchImpl: creditStub({ personData: ratedFixture() }) });
  const base = 'https://api.example/v1/credit-stand?person=138&department=Acting&type=movie&year=2020&ignoreStoreYear=true';

  const relevance = await worker.fetch(new Request(`${base}&sort=relevance`), env, context());
  const relevanceBody = await relevance.json();
  assert.deepEqual(relevanceBody.titles.map((title) => title.id), ['tmdb:701', 'tmdb:702', 'tmdb:703']);
  assert.equal(relevanceBody.sort, 'relevance');

  const year = await worker.fetch(new Request(`${base}&sort=year`), env, context());
  assert.deepEqual((await year.json()).titles.map((title) => title.id), ['tmdb:702', 'tmdb:703', 'tmdb:701']);

  const rating = await worker.fetch(new Request(`${base}&sort=rating`), env, context());
  assert.deepEqual((await rating.json()).titles.map((title) => title.id), ['tmdb:701', 'tmdb:703', 'tmdb:702']);
});

test('public worker reorders the filmography before slicing so sorted paging stays monotone', async () => {
  const worker = createLocadoraWorker({ fetchImpl: creditStub({ personData: datedFixture(45) }) });
  const base = 'https://api.example/v1/credit-stand?person=138&department=Acting&type=movie&year=2020&ignoreStoreYear=true&sort=year';

  const first = await worker.fetch(new Request(`${base}&stand=0`), env, context());
  const firstBody = await first.json();
  assert.equal(firstBody.titles.length, 40);
  assert.equal(firstBody.titles[0].id, 'tmdb:2044');
  assert.equal(firstBody.titles[39].id, 'tmdb:2005');
  assert.equal(firstBody.hasNextStand, true);

  const second = await worker.fetch(new Request(`${base}&stand=1`), env, context());
  const secondBody = await second.json();
  assert.equal(secondBody.titles.length, 5);
  assert.equal(secondBody.titles[0].id, 'tmdb:2004');
  assert.equal(secondBody.titles[4].id, 'tmdb:2000');
  assert.equal(secondBody.hasNextStand, false);

  const relevance = await worker.fetch(new Request(`${base.replace('&sort=year', '&sort=relevance')}&stand=0`), env, context());
  assert.equal((await relevance.json()).titles[0].id, 'tmdb:2000');
});

test('public worker keeps a provider-filtered sorted credit stand inside the Workers subrequest budget', async () => {
  const personData = { id: 138, name: 'P', combined_credits: { cast: Array.from({ length: 45 }, (_, index) => ({
    id: 3000 + index, media_type: 'movie', title: `Film ${index}`, release_date: `${1950 + index}-01-01`,
    vote_count: 1000 - index, popularity: 100 - index,
  })), crew: [] } };
  const availability = Object.fromEntries(Array.from({ length: 45 }, (_, index) => [`movie:${3000 + index}`, {
    link: `https://www.themoviedb.org/movie/${3000 + index}/watch?locale=BR`,
    flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png' }],
  }]));
  let upstreamCalls = 0;
  const stub = creditStub({ personData, availability });
  const worker = createLocadoraWorker({ fetchImpl: (input, init) => { upstreamCalls += 1; return stub(input, init); } });
  const base = 'https://api.example/v1/credit-stand?person=138&department=Acting&type=movie&year=2020&ignoreStoreYear=true&providers=netflix&sort=year';

  const first = await worker.fetch(new Request(`${base}&stand=0`), env, context());
  const firstBody = await first.json();
  assert.equal(firstBody.titles.length, 20);
  assert.equal(firstBody.titles[0].id, 'tmdb:3044');
  assert.equal(firstBody.sort, 'year');
  assert.ok(upstreamCalls <= 42, `expected at most 42 upstream calls, saw ${upstreamCalls}`);

  const second = await worker.fetch(new Request(`${base}&stand=1`), env, context());
  assert.equal((await second.json()).titles[0].id, 'tmdb:3024');
});
