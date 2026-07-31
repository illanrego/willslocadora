import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocadoraDataWorker } from '../workers/locadora-data/src/index.mjs';

function jsonRequest(path, { method = 'GET', token = 'valid-token', body } = {}) {
  return new Request(`https://data.example${path}`, {
    method,
    headers: {
      origin: 'https://www.sitedoillan.com.br',
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function createRepository() {
  return {
    async getState(userId) {
      assert.equal(userId, 'user_clerk_123');
      return {
        profile: { userId, username: 'will' },
        watchlist: [],
        activeRental: { id: 'rental-1', items: [] },
        history: [],
      };
    },
  };
}

test('data Worker returns only the authenticated member state', async () => {
  const worker = createLocadoraDataWorker({
    authenticate: async (request) => request.headers.get('authorization') === 'Bearer valid-token' ? 'user_clerk_123' : null,
    createRepository: () => createRepository(),
  });

  const response = await worker.fetch(jsonRequest('/v1/state'), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://www.sitedoillan.com.br');
  assert.deepEqual(await response.json(), {
    profile: { userId: 'user_clerk_123', username: 'will' },
    watchlist: [],
    activeRental: { id: 'rental-1', items: [] },
    history: [],
  });
});

test('data Worker rejects requests without a valid Clerk token', async () => {
  const worker = createLocadoraDataWorker({
    authenticate: async () => null,
    createRepository: () => createRepository(),
  });

  const response = await worker.fetch(jsonRequest('/v1/state', { token: 'invalid-token' }), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Authentication required' });
});

test('data Worker creates a public username for the authenticated Clerk member', async () => {
  const calls = [];
  const worker = createLocadoraDataWorker({
    authenticate: async () => 'user_clerk_123',
    createRepository: () => ({
      async upsertProfile(userId, username) {
        calls.push({ userId, username });
        return { userId, username, createdAt: '2026-07-30T12:00:00Z' };
      },
    }),
  });

  const response = await worker.fetch(jsonRequest('/v1/profile', { method: 'PUT', body: { username: 'Will_Rego' } }), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ userId: 'user_clerk_123', username: 'will_rego' }]);
  assert.deepEqual(await response.json(), { profile: { userId: 'user_clerk_123', username: 'will_rego', createdAt: '2026-07-30T12:00:00Z' } });
});

test('data Worker rejects an invalid public username before touching the archive', async () => {
  const worker = createLocadoraDataWorker({
    authenticate: async () => 'user_clerk_123',
    createRepository: () => ({ upsertProfile: async () => assert.fail('must not write') }),
  });

  const response = await worker.fetch(jsonRequest('/v1/profile', { method: 'PUT', body: { username: 'no spaces!' } }), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Username must be 3–24 lowercase letters, numbers, underscores, or hyphens' });
});

test('data Worker saves an authenticated member title to the watchlist with a canonical TMDB key', async () => {
  const calls = [];
  const worker = createLocadoraDataWorker({
    authenticate: async () => 'user_clerk_123',
    createRepository: () => ({
      async saveWatchlist(userId, title) {
        calls.push({ userId, title });
        return { id: 'watch-1', ...title, addedAt: '2026-07-30T12:00:00Z', completedAt: null };
      },
    }),
  });

  const response = await worker.fetch(jsonRequest('/v1/watchlist', {
    method: 'POST',
    body: { title: { tmdbId: 603, type: 'movie', name: 'The Matrix', year: 1999 }, source: 'locadora' },
  }), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 201);
  assert.deepEqual(calls, [{ userId: 'user_clerk_123', title: {
    canonicalKey: 'movie:603', tmdbId: 603, type: 'movie', name: 'The Matrix', year: 1999, source: 'locadora', sourceNote: null,
  } }]);
  assert.deepEqual(await response.json(), { watchlistItem: {
    id: 'watch-1', canonicalKey: 'movie:603', tmdbId: 603, type: 'movie', name: 'The Matrix', year: 1999, source: 'locadora', sourceNote: null, addedAt: '2026-07-30T12:00:00Z', completedAt: null,
  } });
});

test('data Worker refuses malformed or unsupported watchlist titles', async () => {
  const worker = createLocadoraDataWorker({
    authenticate: async () => 'user_clerk_123',
    createRepository: () => ({ saveWatchlist: async () => assert.fail('must not write') }),
  });

  const response = await worker.fetch(jsonRequest('/v1/watchlist', {
    method: 'POST',
    body: { title: { tmdbId: 'not-a-number', type: 'documentary', name: '' }, source: 'other' },
  }), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid watchlist title' });
});

test('data Worker rents canonical titles through one server-side operation', async () => {
  const calls = [];
  const worker = createLocadoraDataWorker({
    authenticate: async () => 'user_clerk_123',
    createRepository: () => ({
      async rentTitles(userId, titles) {
        calls.push({ userId, titles });
        return { id: 'rental-1', openedAt: '2026-07-30T12:00:00Z', items: titles };
      },
    }),
  });
  const response = await worker.fetch(jsonRequest('/v1/rentals', {
    method: 'POST',
    body: { titles: [
      { tmdbId: 603, type: 'movie', name: 'The Matrix', year: 1999 },
      { tmdbId: 1396, type: 'series', name: 'Breaking Bad', year: 2008 },
    ] },
  }), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 201);
  assert.deepEqual(calls, [{ userId: 'user_clerk_123', titles: [
    { canonicalKey: 'movie:603', tmdbId: 603, type: 'movie', name: 'The Matrix', year: 1999 },
    { canonicalKey: 'series:1396', tmdbId: 1396, type: 'series', name: 'Breaking Bad', year: 2008 },
  ] }]);
  assert.deepEqual(await response.json(), { rental: { id: 'rental-1', openedAt: '2026-07-30T12:00:00Z', items: [
    { canonicalKey: 'movie:603', tmdbId: 603, type: 'movie', name: 'The Matrix', year: 1999 },
    { canonicalKey: 'series:1396', tmdbId: 1396, type: 'series', name: 'Breaking Bad', year: 2008 },
  ] } });
});

test('data Worker refuses rental batches larger than the three active-title limit', async () => {
  const worker = createLocadoraDataWorker({
    authenticate: async () => 'user_clerk_123',
    createRepository: () => ({ rentTitles: async () => assert.fail('must not write') }),
  });
  const title = { tmdbId: 603, type: 'movie', name: 'The Matrix', year: 1999 };
  const response = await worker.fetch(jsonRequest('/v1/rentals', { method: 'POST', body: { titles: [title, { ...title, tmdbId: 604 }, { ...title, tmdbId: 605 }, { ...title, tmdbId: 606 }] } }), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Choose one to three distinct titles' });
});

test('data Worker returns a member title and records the watched outcome', async () => {
  const calls = [];
  const itemId = '11111111-1111-4111-8111-111111111111';
  const worker = createLocadoraDataWorker({
    authenticate: async () => 'user_clerk_123',
    createRepository: () => ({
      async returnRentalItem(userId, receivedItemId, watchedStatus) {
        calls.push({ userId, itemId: receivedItemId, watchedStatus });
        return { id: receivedItemId, returnedAt: '2026-07-30T13:00:00Z', watchedStatus };
      },
    }),
  });
  const response = await worker.fetch(jsonRequest(`/v1/rental-items/${itemId}/return`, { method: 'POST', body: { watchedStatus: 'watched' } }), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ userId: 'user_clerk_123', itemId, watchedStatus: 'watched' }]);
  assert.deepEqual(await response.json(), { rentalItem: { id: itemId, returnedAt: '2026-07-30T13:00:00Z', watchedStatus: 'watched' } });
});

test('data Worker accepts only the three settled return outcomes', async () => {
  const worker = createLocadoraDataWorker({
    authenticate: async () => 'user_clerk_123',
    createRepository: () => ({ returnRentalItem: async () => assert.fail('must not write') }),
  });
  const response = await worker.fetch(jsonRequest('/v1/rental-items/not-a-uuid/return', { method: 'POST', body: { watchedStatus: 'maybe' } }), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid rental return' });
});

test('data Worker exposes only the signed-in member history in pages', async () => {
  const calls = [];
  const worker = createLocadoraDataWorker({
    authenticate: async () => 'user_clerk_123',
    createRepository: () => ({
      async listHistory(userId, offset) {
        calls.push({ userId, offset });
        return { history: [{ id: 'item-1', name: 'The Matrix' }], hasMore: true };
      },
    }),
  });
  const response = await worker.fetch(jsonRequest('/v1/history?offset=20'), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ userId: 'user_clerk_123', offset: 20 }]);
  assert.deepEqual(await response.json(), { history: [{ id: 'item-1', name: 'The Matrix' }], hasMore: true });
});

test('data Worker checks public username availability for the authenticated member', async () => {
  const worker = createLocadoraDataWorker({
    authenticate: async () => 'user_clerk_123',
    createRepository: () => ({ isUsernameAvailable: async (userId, username) => userId === 'user_clerk_123' && username === 'will_rego' }),
  });
  const response = await worker.fetch(jsonRequest('/v1/usernames/will_rego'), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { username: 'will_rego', available: true });
});
