import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocadoraDataWorker, databaseError, mapActiveRentalRow } from '../workers/locadora-data/src/index.mjs';

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

test('active rental state excludes tapes that have already been returned', () => {
  const active = mapActiveRentalRow({
    id: 'rental-1',
    opened_at: '2026-08-01T10:00:00Z',
    rental_items: [
      { id: 'item-active', tmdb_id: 603, title_type: 'movie', title_snapshot: 'The Matrix', release_year_snapshot: 1999, rented_at: '2026-08-01T10:00:00Z', returned_at: null },
      { id: 'item-returned', tmdb_id: 680, title_type: 'movie', title_snapshot: 'Pulp Fiction', release_year_snapshot: 1994, rented_at: '2026-08-01T10:00:00Z', returned_at: '2026-08-01T12:00:00Z' },
    ],
  });

  assert.deepEqual(active.items.map((item) => item.id), ['item-active']);
});

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

test('data Worker serves public reviews for a canonical title without a Clerk token', async () => {
  let authenticationAttempts = 0;
  const calls = [];
  const worker = createLocadoraDataWorker({
    authenticate: async () => { authenticationAttempts += 1; return null; },
    createRepository: () => ({
      async listPublicTitleReviews(canonicalKey) {
        calls.push(canonicalKey);
        return { summary: { averageRating: 4.5, ratingCount: 2 }, reviews: [{ id: 'review-1', username: 'will', rating: 4.5, body: 'Muito bom.', createdAt: '2026-08-02T12:00:00Z' }] };
      },
    }),
  });

  const response = await worker.fetch(jsonRequest('/v1/titles/movie/603/reviews', { token: '' }), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 200);
  assert.equal(authenticationAttempts, 0);
  assert.deepEqual(calls, ['movie:603']);
  assert.deepEqual(await response.json(), { summary: { averageRating: 4.5, ratingCount: 2 }, reviews: [{ id: 'review-1', username: 'will', rating: 4.5, body: 'Muito bom.', createdAt: '2026-08-02T12:00:00Z' }] });
});

test('data Worker accepts half-star reviews only from the authenticated member', async () => {
  const calls = [];
  const worker = createLocadoraDataWorker({
    authenticate: async () => 'user_clerk_123',
    createRepository: () => ({
      async saveReview(userId, canonicalKey, review) {
        calls.push({ userId, canonicalKey, review });
        return { id: 'review-1', username: 'will', ...review, createdAt: '2026-08-02T12:00:00Z', updatedAt: '2026-08-02T12:00:00Z' };
      },
    }),
  });

  const response = await worker.fetch(jsonRequest('/v1/titles/movie/603/review', { method: 'POST', body: { rating: 4.5, body: 'Muito bom.' } }), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 201);
  assert.deepEqual(calls, [{ userId: 'user_clerk_123', canonicalKey: 'movie:603', review: { rating: 4.5, body: 'Muito bom.' } }]);
  assert.deepEqual(await response.json(), { review: { id: 'review-1', username: 'will', rating: 4.5, body: 'Muito bom.', createdAt: '2026-08-02T12:00:00Z', updatedAt: '2026-08-02T12:00:00Z' } });
});

test('data Worker checks review eligibility against authenticated watched history', async () => {
  const calls = [];
  const worker = createLocadoraDataWorker({
    authenticate: async () => 'user_clerk_123',
    createRepository: () => ({
      async canReviewTitle(userId, canonicalKey) { calls.push({ userId, canonicalKey }); return true; },
    }),
  });
  const response = await worker.fetch(jsonRequest('/v1/titles/series/1396/review-eligibility'), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ userId: 'user_clerk_123', canonicalKey: 'series:1396' }]);
  assert.deepEqual(await response.json(), { eligible: true });
});

test('data Worker rejects non-half-star or blank review submissions before archive writes', async () => {
  const worker = createLocadoraDataWorker({
    authenticate: async () => 'user_clerk_123',
    createRepository: () => ({ saveReview: async () => assert.fail('must not write') }),
  });

  const response = await worker.fetch(jsonRequest('/v1/titles/movie/603/review', { method: 'POST', body: { rating: 4.2, body: '   ' } }), { ALLOWED_ORIGINS: 'https://www.sitedoillan.com.br' });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'A review needs a half-star rating and a short text' });
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

test('database error mapping treats an inactive rental item as not found', () => {
  assert.throws(
    () => databaseError({ message: 'active_rental_item_not_found' }),
    (error) => error.status === 404 && error.message === 'That active rental item was not found',
  );
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
