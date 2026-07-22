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
      assert.equal(url.pathname, '/3/find/tt0133093');
      assert.equal(url.searchParams.get('api_key'), 'test-key');
      assert.equal(url.searchParams.get('external_source'), 'imdb_id');
      return Response.json({ movie_results: [{ id: 603, title: 'The Matrix', overview: 'A choice.', release_date: '1999-03-31', poster_path: '/matrix.jpg', vote_average: 8.2, genres: [{ id: 28, name: 'Action' }] }] });
    },
  });

  const response = await worker.fetch(new Request('https://api.example/v1/title?type=movie&id=tt0133093&locale=pt-BR'), env, context());
  assert.equal(response.status, 200);
  const { meta } = await response.json();
  assert.equal(meta.name, 'The Matrix');
  assert.equal(meta.id, 'tt0133093');
  assert.equal(meta.poster, 'https://image.tmdb.org/t/p/w500/matrix.jpg');
  assert.equal(JSON.stringify(meta).includes('test-key'), false);
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
  assert.deepEqual(body.titles[0].genres, ['Romance']);

  const discovery = requested.find((url) => url.pathname === '/3/discover/tv');
  assert.equal(discovery.searchParams.get('watch_region'), 'BR');
  assert.equal(discovery.searchParams.get('with_watch_monetization_types'), 'flatrate');
  assert.equal(discovery.searchParams.get('with_watch_providers'), '119|307');
  assert.equal(discovery.searchParams.get('with_genres'), '10766');
});
