import { verifyToken } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const HISTORY_PAGE_SIZE = 20;

function allowedOrigins(value) {
  return new Set(String(value || '').split(',').map((origin) => origin.trim()).filter(Boolean));
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigins(env.ALLOWED_ORIGINS).has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    vary: 'origin',
  };
}

function response(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...corsHeaders(request, env) } });
}

function required(value, label) {
  if (!value) throw new Error(`${label} is not configured`);
  return value;
}

async function authenticateClerk(request, env) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return null;
  try {
    const payload = await verifyToken(token, {
      secretKey: required(env.CLERK_SECRET_KEY, 'CLERK_SECRET_KEY'),
      authorizedParties: [...allowedOrigins(env.ALLOWED_ORIGINS)],
    });
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function databaseError(error) {
  if (!error) return;
  if (error.code === '23505') throw new ApiError(409, 'That public username is already taken');
  if (error.message === 'active_title_limit') throw new ApiError(409, 'You can have up to three active titles');
  if (error.message === 'title_already_rented') throw new ApiError(409, 'That title is already active at your counter');
  if (error.message === 'profile_required') throw new ApiError(409, 'Choose a public username first');
  if (error.message === 'watched_history_required') throw new ApiError(403, 'Return this title as watched before reviewing it');
  if (error.message === 'invalid_review') throw new ApiError(400, 'A review needs a half-star rating and a short text');
  if (['rental_item_not_found', 'active_rental_item_not_found'].includes(error.message)) throw new ApiError(404, 'That active rental item was not found');
  throw new Error('The Locadora archive is unavailable');
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapTitleRow(row) {
  return {
    id: row.id,
    canonicalKey: row.canonical_key,
    tmdbId: row.tmdb_id,
    type: row.title_type,
    name: row.title_snapshot,
    year: row.release_year_snapshot,
  };
}

function mapWatchlistRow(row) {
  return { ...mapTitleRow(row), source: row.source, sourceNote: row.source_note, addedAt: row.added_at, completedAt: row.completed_at };
}

function mapRentalItemRow(row) {
  return { ...mapTitleRow(row), rentedAt: row.rented_at, returnedAt: row.returned_at, watchedStatus: row.watched_status };
}

export function mapActiveRentalRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    openedAt: row.opened_at,
    items: (row.rental_items || []).filter((item) => !item.returned_at).map(mapRentalItemRow),
  };
}

function normalizeUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]{3,24}$/.test(username) ? username : '';
}

function normalizeTitle(value, { requireSource = true } = {}) {
  const tmdbId = Number(value?.tmdbId);
  const type = value?.type === 'movie' || value?.type === 'series' ? value.type : '';
  const name = String(value?.name || '').trim().replace(/\s+/g, ' ');
  const year = Number.isInteger(Number(value?.year)) && Number(value.year) >= 1870 && Number(value.year) <= 2100 ? Number(value.year) : null;
  const source = value?.source === 'locadora' || value?.source === 'letterboxd' || value?.source === 'startpage' ? value.source : '';
  const sourceNote = value?.sourceNote == null ? null : String(value.sourceNote).trim().slice(0, 240);
  if (!Number.isSafeInteger(tmdbId) || tmdbId < 1 || !type || !name || name.length > 240 || (requireSource && !source)) return null;
  return { canonicalKey: `${type}:${tmdbId}`, tmdbId, type, name, year, ...(requireSource ? { source, sourceNote } : {}) };
}

function normalizeReview(value) {
  const rating = Number(value?.rating);
  const body = String(value?.body || '').trim().replace(/\s+/g, ' ');
  if (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || Math.round(rating * 2) !== rating * 2 || !body || body.length > 1000) return null;
  return { rating, body };
}

async function readJson(request) {
  try { return await request.json(); }
  catch { return null; }
}

export function createSupabaseRepository(env) {
  const database = createClient(
    required(env.SUPABASE_URL, 'SUPABASE_URL'),
    required(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  return {
    async upsertProfile(userId, username) {
      const result = await database.from('profiles')
        .upsert({ user_id: userId, username }, { onConflict: 'user_id' })
        .select('user_id, username, created_at')
        .single();
      databaseError(result.error);
      return { userId: result.data.user_id, username: result.data.username, createdAt: result.data.created_at };
    },
    async saveWatchlist(userId, title) {
      const result = await database.rpc('save_watchlist_item', {
        p_user_id: userId,
        p_canonical_key: title.canonicalKey,
        p_tmdb_id: title.tmdbId,
        p_title_type: title.type,
        p_title_snapshot: title.name,
        p_release_year_snapshot: title.year,
        p_source: title.source,
        p_source_note: title.sourceNote,
      }).single();
      databaseError(result.error);
      return {
        id: result.data.id,
        canonicalKey: result.data.canonical_key,
        tmdbId: result.data.tmdb_id,
        type: result.data.title_type,
        name: result.data.title_snapshot,
        year: result.data.release_year_snapshot,
        source: result.data.source,
        sourceNote: result.data.source_note,
        addedAt: result.data.added_at,
        completedAt: result.data.completed_at,
      };
    },
    async rentTitles(userId, titles) {
      const result = await database.rpc('rent_titles', {
        p_user_id: userId,
        p_titles: titles.map((title) => ({
          canonical_key: title.canonicalKey,
          tmdb_id: title.tmdbId,
          title_type: title.type,
          title_snapshot: title.name,
          release_year_snapshot: title.year,
        })),
      }).single();
      databaseError(result.error);
      return { id: result.data.id, openedAt: result.data.opened_at, items: result.data.items || [] };
    },
    async returnRentalItem(userId, itemId, watchedStatus) {
      const result = await database.rpc('return_rental_item', {
        p_user_id: userId,
        p_rental_item_id: itemId,
        p_watched_status: watchedStatus,
      }).single();
      databaseError(result.error);
      return { id: result.data.id, returnedAt: result.data.returned_at, watchedStatus: result.data.watched_status };
    },
    async listPublicTitleReviews(canonicalKey) {
      const result = await database.rpc('get_public_title_reviews', { p_canonical_key: canonicalKey });
      databaseError(result.error);
      return result.data || { summary: { averageRating: 0, ratingCount: 0 }, reviews: [] };
    },
    async saveReview(userId, canonicalKey, review) {
      const result = await database.rpc('upsert_review', {
        p_user_id: userId,
        p_canonical_key: canonicalKey,
        p_rating: review.rating,
        p_body: review.body,
      }).single();
      databaseError(result.error);
      return {
        id: result.data.id,
        rating: Number(result.data.rating),
        body: result.data.body_censored,
        createdAt: result.data.created_at,
        updatedAt: result.data.updated_at,
      };
    },
    async canReviewTitle(userId, canonicalKey) {
      const result = await database.from('rental_items').select('id').eq('user_id', userId).eq('canonical_key', canonicalKey).eq('watched_status', 'watched').not('returned_at', 'is', null).limit(1).maybeSingle();
      databaseError(result.error);
      return Boolean(result.data);
    },
    async isUsernameAvailable(userId, username) {
      const result = await database.from('profiles').select('user_id').eq('username', username).maybeSingle();
      databaseError(result.error);
      return !result.data || result.data.user_id === userId;
    },
    async listHistory(userId, offset) {
      const result = await database.from('rental_items')
        .select('id, canonical_key, tmdb_id, title_type, title_snapshot, release_year_snapshot, rented_at, returned_at, watched_status')
        .eq('user_id', userId).not('returned_at', 'is', null)
        .order('returned_at', { ascending: false }).range(offset, offset + HISTORY_PAGE_SIZE);
      databaseError(result.error);
      const rows = result.data || [];
      return { history: rows.slice(0, HISTORY_PAGE_SIZE).map(mapRentalItemRow), hasMore: rows.length > HISTORY_PAGE_SIZE };
    },
    async getState(userId) {
      const [profileResult, watchlistResult, rentalResult, history] = await Promise.all([
        database.from('profiles').select('user_id, username, created_at').eq('user_id', userId).maybeSingle(),
        database.from('watchlist_items').select('id, canonical_key, tmdb_id, title_type, title_snapshot, release_year_snapshot, source, source_note, added_at').eq('user_id', userId).is('completed_at', null).order('added_at', { ascending: false }),
        database.from('rentals').select('id, opened_at, rental_items(id, canonical_key, tmdb_id, title_type, title_snapshot, release_year_snapshot, rented_at, returned_at, watched_status)').eq('user_id', userId).is('returned_at', null).maybeSingle(),
        this.listHistory(userId, 0),
      ]);
      [profileResult, watchlistResult, rentalResult].forEach(({ error }) => databaseError(error));
      return {
        profile: profileResult.data ? { userId: profileResult.data.user_id, username: profileResult.data.username, createdAt: profileResult.data.created_at } : null,
        watchlist: (watchlistResult.data || []).map(mapWatchlistRow),
        activeRental: mapActiveRentalRow(rentalResult.data),
        history: history.history,
        historyHasMore: history.hasMore,
      };
    },
  };
}

export function createLocadoraDataWorker({ authenticate = authenticateClerk, createRepository = createSupabaseRepository } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
      const isStateRequest = request.method === 'GET' && url.pathname === '/v1/state';
      const isHistoryRequest = request.method === 'GET' && url.pathname === '/v1/history';
      const usernameMatch = request.method === 'GET' ? url.pathname.match(/^\/v1\/usernames\/([a-z0-9_-]{3,24})$/) : null;
      const isProfileRequest = request.method === 'PUT' && url.pathname === '/v1/profile';
      const isWatchlistRequest = request.method === 'POST' && url.pathname === '/v1/watchlist';
      const isRentalRequest = request.method === 'POST' && url.pathname === '/v1/rentals';
      const returnMatch = request.method === 'POST' ? url.pathname.match(/^\/v1\/rental-items\/([^/]+)\/return$/) : null;
      const publicReviewsMatch = request.method === 'GET' ? url.pathname.match(/^\/v1\/titles\/(movie|series)\/([1-9][0-9]*)\/reviews$/) : null;
      const reviewWriteMatch = request.method === 'POST' ? url.pathname.match(/^\/v1\/titles\/(movie|series)\/([1-9][0-9]*)\/review$/) : null;
      const reviewEligibilityMatch = request.method === 'GET' ? url.pathname.match(/^\/v1\/titles\/(movie|series)\/([1-9][0-9]*)\/review-eligibility$/) : null;
      if (!isStateRequest && !isHistoryRequest && !usernameMatch && !isProfileRequest && !isWatchlistRequest && !isRentalRequest && !returnMatch && !publicReviewsMatch && !reviewWriteMatch && !reviewEligibilityMatch) return response(request, env, { error: 'Not found' }, 404);

      try {
        const repository = createRepository(env);
        if (publicReviewsMatch) {
          const canonicalKey = `${publicReviewsMatch[1]}:${publicReviewsMatch[2]}`;
          return response(request, env, await repository.listPublicTitleReviews(canonicalKey));
        }
        const userId = await authenticate(request, env);
        if (!userId) return response(request, env, { error: 'Authentication required' }, 401);
        if (reviewEligibilityMatch) {
          const canonicalKey = `${reviewEligibilityMatch[1]}:${reviewEligibilityMatch[2]}`;
          return response(request, env, { eligible: await repository.canReviewTitle(userId, canonicalKey) });
        }
        if (isStateRequest) return response(request, env, await repository.getState(userId));
        if (isHistoryRequest) {
          const offset = Number(url.searchParams.get('offset'));
          if (!Number.isInteger(offset) || offset < 0 || offset > 10000) return response(request, env, { error: 'Invalid history offset' }, 400);
          return response(request, env, await repository.listHistory(userId, offset));
        }
        if (usernameMatch) return response(request, env, { username: usernameMatch[1], available: await repository.isUsernameAvailable(userId, usernameMatch[1]) });
        const body = await readJson(request);
        if (reviewWriteMatch) {
          const review = normalizeReview(body);
          if (!review) return response(request, env, { error: 'A review needs a half-star rating and a short text' }, 400);
          const canonicalKey = `${reviewWriteMatch[1]}:${reviewWriteMatch[2]}`;
          return response(request, env, { review: await repository.saveReview(userId, canonicalKey, review) }, 201);
        }
        if (isWatchlistRequest) {
          const title = normalizeTitle({ ...body?.title, source: body?.source, sourceNote: body?.sourceNote });
          if (!title) return response(request, env, { error: 'Invalid watchlist title' }, 400);
          return response(request, env, { watchlistItem: await repository.saveWatchlist(userId, title) }, 201);
        }
        if (isRentalRequest) {
          const titles = Array.isArray(body?.titles) ? body.titles.map((title) => normalizeTitle(title, { requireSource: false })) : [];
          const distinct = new Set(titles.filter(Boolean).map((title) => title.canonicalKey));
          if (titles.length < 1 || titles.length > 3 || titles.some((title) => !title) || distinct.size !== titles.length) return response(request, env, { error: 'Choose one to three distinct titles' }, 400);
          return response(request, env, { rental: await repository.rentTitles(userId, titles) }, 201);
        }
        if (returnMatch) {
          const itemId = returnMatch[1];
          const watchedStatus = body?.watchedStatus;
          if (!isUuid(itemId) || !['watched', 'not_watched', 'unknown'].includes(watchedStatus)) return response(request, env, { error: 'Invalid rental return' }, 400);
          return response(request, env, { rentalItem: await repository.returnRentalItem(userId, itemId, watchedStatus) });
        }
        const username = normalizeUsername(body?.username);
        if (!username) return response(request, env, { error: 'Username must be 3–24 lowercase letters, numbers, underscores, or hyphens' }, 400);
        return response(request, env, { profile: await repository.upsertProfile(userId, username) });
      } catch (error) {
        console.error('locadora-data request failed', error);
        return response(request, env, { error: error.message || 'The Locadora archive is unavailable' }, error.status || 503);
      }
    },
  };
}

export default createLocadoraDataWorker();
