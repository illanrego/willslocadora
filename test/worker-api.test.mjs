import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocadoraWorker } from '../workers/locadora-api/src/index.mjs';

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('worker searches the whole TMDB catalogue across movies and series', async () => {
  const requests = [];
  const worker = createLocadoraWorker({
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (String(url).includes('/search/movie')) return response({ results: [{ id: 603, title: 'The Matrix', release_date: '1999-03-30', poster_path: '/matrix.jpg', backdrop_path: '/matrix-bg.jpg', overview: 'A hacker learns the truth.', vote_average: 8.7 }] });
      if (String(url).includes('/search/tv')) return response({ results: [{ id: 2316, name: 'The Office', first_air_date: '2005-03-24', poster_path: '/office.jpg', backdrop_path: null, overview: 'Office comedy.', vote_average: 8.6 }] });
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const result = await worker.fetch(new Request('https://api.example/v1/search?q=matrix&locale=en-US'), { TMDB_API_KEY: 'test' });

  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {
    query: 'matrix',
    titles: [
      { id: 'tmdb:603', type: 'movie', name: 'The Matrix', year: 1999, poster: 'https://image.tmdb.org/t/p/w500/matrix.jpg', background: 'https://image.tmdb.org/t/p/w1280/matrix-bg.jpg', description: 'A hacker learns the truth.', imdbRating: '8.7', genres: [], source: 'tmdb-search' },
      { id: 'tmdb:2316', type: 'series', name: 'The Office', year: 2005, poster: 'https://image.tmdb.org/t/p/w500/office.jpg', background: '', description: 'Office comedy.', imdbRating: '8.6', genres: [], source: 'tmdb-search' },
    ],
  });
  assert.equal(requests.length, 2);
  assert.ok(requests.every((url) => url.includes('query=matrix')));
});

test('worker rejects invalid catalogue search queries', async () => {
  const worker = createLocadoraWorker();
  const result = await worker.fetch(new Request('https://api.example/v1/search?q=x'), { TMDB_API_KEY: 'test' });
  assert.equal(result.status, 400);
  assert.deepEqual(await result.json(), { error: 'Invalid catalogue search' });
});
