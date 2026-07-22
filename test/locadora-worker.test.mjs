import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocadoraWorker } from '../workers/locadora-api/src/index.mjs';

const env = {
  ALLOWED_ORIGINS: 'https://will.github.io,http://127.0.0.1:4173',
  TMDB_API_KEY: 'test-key',
};

function context() {
  return { waitUntil() {} };
}

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
      assert.equal(url.searchParams.get('append_to_response'), 'credits,watch/providers,release_dates,images');
      return Response.json({
        title: 'The Matrix', overview: 'A choice.', release_date: '1999-03-31', poster_path: '/matrix.jpg', vote_average: 8.2, genres: [{ id: 28, name: 'Action' }],
        credits: { crew: [{ job: 'Director', name: 'Lana Wachowski' }, { job: 'Screenplay', name: 'Lilly Wachowski' }], cast: [{ name: 'Keanu Reeves' }] },
        'watch/providers': { results: { BR: { link: 'https://www.themoviedb.org/movie/603/watch?locale=BR', flatrate: [{ provider_name: 'Netflix', logo_path: '/netflix.png' }] } } },
        release_dates: { results: [{ iso_3166_1: 'BR', release_dates: [{ certification: '14' }] }] },
        images: { logos: [{ iso_639_1: 'pt', file_path: '/matrix-logo.png' }] },
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
  assert.equal(body.titles[0].id, 'tt0000011');
  assert.equal(body.hasNextStand, false);
  assert.deepEqual(body.titles[0].genres, ['Romance']);

  const discovery = requested.find((url) => url.pathname === '/3/discover/tv');
  assert.equal(discovery.searchParams.get('watch_region'), 'BR');
  assert.equal(discovery.searchParams.get('with_watch_monetization_types'), 'flatrate');
  assert.equal(discovery.searchParams.get('with_watch_providers'), '119|307');
  assert.equal(discovery.searchParams.get('with_genres'), '10766');
});
