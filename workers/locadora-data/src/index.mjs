import { createClient } from '@supabase/supabase-js';
import { APIError, betterAuth } from 'better-auth';
import { bearer, username } from 'better-auth/plugins';
import { Pool } from 'pg';
import { PostgresDialect } from 'kysely';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const HISTORY_PAGE_SIZE = 20;
const DEFAULT_RESEND_FROM = "Will's Locadora <contato@mail.sitedoillan.com.br>";
const DEFAULT_ADMIN_EMAIL = 'emaildoillan@protonmail.com';
export const CATALOGUE_POLICY_KEY = 'catalogue-policy-v1';

function allowedOrigins(value) {
  return new Set(String(value || '').split(',').map((origin) => origin.trim()).filter(Boolean));
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigins(env.ALLOWED_ORIGINS).has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

function adminEmail(env) {
  return String(env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
}

export function isReservedWillUsername(value) {
  const compact = String(value || '').trim().toLowerCase().replace(/[_-]/g, '');
  return compact.replace(/[il1]/g, 'l') === 'wlll';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function queueTransactionalEmail(env, ctx, message) {
  const task = sendResendEmail(env, message).catch((error) => {
    console.error('transactional email failed', error?.message || 'unknown email error');
  });
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(task);
  else void task;
}

export async function sendResendEmail(env, { to, subject, text, html }) {
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('RESEND_API_KEY is not configured; transactional email skipped');
    return { skipped: true };
  }
  const from = String(env.RESEND_FROM_EMAIL || DEFAULT_RESEND_FROM).trim();
  if (!from) throw new Error('RESEND_FROM_EMAIL is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'user-agent': 'locadora-data-worker',
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });
  if (!response.ok) throw new Error(`Resend rejected transactional email (${response.status})`);
  return response.json().catch(() => ({}));
}

function createAuth(env, ctx) {
  const connectionString = env.HYPERDRIVE?.connectionString || required(env.DATABASE_URL, 'DATABASE_URL');
  // Hyperdrive owns the reusable origin pool. A request-scoped pg pool prevents
  // unrelated Worker requests from queuing behind stale or slow client sockets.
  const pool = new Pool({ connectionString, max: 1, idleTimeoutMillis: 5000, connectionTimeoutMillis: 5000, allowExitOnIdle: true });
  pool.on('error', (error) => console.error('Better Auth database pool error', error?.message || 'unknown database error'));
  const auth = betterAuth({
    database: new PostgresDialect({ pool }),
    baseURL: required(env.AUTH_BASE_URL, 'AUTH_BASE_URL'),
    basePath: '/api/auth',
    secret: required(env.BETTER_AUTH_SECRET, 'BETTER_AUTH_SECRET'),
    trustedOrigins: [...allowedOrigins(env.ALLOWED_ORIGINS)],
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        const safeUrl = escapeHtml(url);
        queueTransactionalEmail(env, ctx, {
          to: user.email,
          subject: 'Confirme seu email na Locadora',
          text: `Confirme seu email para a Locadora abrindo este link:\n\n${url}\n\nO link expira em uma hora.`,
          html: `<p>Confirme seu email para a Locadora:</p><p><a href="${safeUrl}">Confirmar email</a></p><p>O link expira em uma hora.</p>`,
        });
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        const safeUrl = escapeHtml(url);
        queueTransactionalEmail(env, ctx, {
          to: user.email,
          subject: 'Redefina sua senha da Locadora',
          text: `Para escolher uma nova senha, abra este link:\n\n${url}\n\nO link expira em uma hora.`,
          html: `<p>Para escolher uma nova senha da Locadora:</p><p><a href="${safeUrl}">Redefinir senha</a></p><p>O link expira em uma hora.</p>`,
        });
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (isReservedWillUsername(user.username) && String(user.email || '').trim().toLowerCase() !== adminEmail(env)) {
              throw new APIError('CONFLICT', { message: 'That username is reserved' });
            }
          },
        },
        update: {
          before: async (user) => {
            if (user.username !== undefined && isReservedWillUsername(user.username)) {
              throw new APIError('CONFLICT', { message: 'That username is reserved' });
            }
          },
        },
      },
    },
    plugins: [username({ displayUsername: false, usernameValidator: (value) => /^[a-z0-9_-]{3,24}$/.test(value) }), bearer()],
    advanced: { useSecureCookies: true },
  });
  return {
    auth,
    async close() {
      try { await pool.end(); }
      catch (error) { console.error('Better Auth database pool close failed', error?.message || 'unknown database error'); }
    },
  };
}

async function authenticateBetterAuth(request, env) {
  const runtime = createAuth(env);
  try {
    const session = await runtime.auth.api.getSession({ headers: request.headers });
    return session?.user?.id || null;
  } finally {
    await runtime.close();
  }
}

async function authenticateAdmin(request, env, ctx) {
  const runtime = createAuth(env, ctx);
  try {
    const session = await runtime.auth.api.getSession({ headers: request.headers });
    const user = session?.user;
    return user && String(user.email || '').trim().toLowerCase() === adminEmail(env) ? user : null;
  } finally {
    await runtime.close();
  }
}

class ApiError extends Error {
  constructor(status, message, code = '') { super(message); this.status = status; this.code = code; }
}

export function databaseError(error) {
  if (!error) return;
  if (error.code === '23505') throw new ApiError(409, 'That public username is already taken');
  if (error.message === 'catalogue_title_blocked') throw new ApiError(409, 'That title is no longer available in the catalogue', 'CATALOGUE_TITLE_BLOCKED');
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

function mapTitleRow(row, blockedKeys = new Set()) {
  return {
    id: row.id,
    canonicalKey: row.canonical_key,
    tmdbId: row.tmdb_id,
    type: row.title_type,
    name: row.title_snapshot,
    year: row.release_year_snapshot,
    ...(blockedKeys.has(row.canonical_key) ? { unavailable: true } : {}),
  };
}

function mapWatchlistRow(row) {
  return { ...mapTitleRow(row), source: row.source, sourceNote: row.source_note, addedAt: row.added_at, completedAt: row.completed_at };
}

function mapCollectionRow(row) {
  return { ...mapWatchlistRow(row), collection: row.collection };
}

function mapRentalItemRow(row, blockedKeys = new Set()) {
  return { ...mapTitleRow(row, blockedKeys), rentedAt: row.rented_at, returnedAt: row.returned_at, watchedStatus: row.watched_status };
}

export function mapActiveRentalRow(row, blockedKeys = new Set()) {
  if (!row) return null;
  return {
    id: row.id,
    openedAt: row.opened_at,
    items: (row.rental_items || []).filter((item) => !item.returned_at).map((item) => mapRentalItemRow(item, blockedKeys)),
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

export function normalizeCatalogueBlock(value) {
  const tmdbId = Number(value?.tmdbId);
  const type = value?.type === 'movie' || value?.type === 'series' ? value.type : '';
  const reason = String(value?.reason || '').trim().replace(/\s+/g, ' ');
  if (!Number.isSafeInteger(tmdbId) || tmdbId < 1 || !type || reason.length < 1 || reason.length > 500) return null;
  return { type, tmdbId, canonicalKey: `${type}:${tmdbId}`, reason };
}

function mapCatalogueBlockRow(row) {
  return {
    id: row.id,
    type: row.title_type,
    tmdbId: Number(row.tmdb_id),
    canonicalKey: row.canonical_key,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    removedBy: row.removed_by,
    removedAt: row.removed_at,
    active: !row.removed_at,
  };
}

function mapAdminReviewRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    canonicalKey: row.canonical_key,
    rating: Number(row.rating),
    body: row.body_censored,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    moderationReason: row.moderation_reason,
    moderatedBy: row.moderated_by,
    moderatedAt: row.moderated_at,
  };
}

function metricsWindow(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function publishCataloguePolicy(repository, env) {
  const activeKeys = await repository.listActiveCatalogueKeys();
  const binding = env.CATALOGUE_POLICY;
  if (!binding || typeof binding.get !== 'function' || typeof binding.put !== 'function') {
    return { version: 0, activeKeys };
  }
  let previousVersion = 0;
  try {
    const previous = await binding.get(CATALOGUE_POLICY_KEY, 'json');
    previousVersion = Number(previous?.version) || 0;
  } catch (error) {
    console.warn('catalogue policy read failed before publish', error?.message || 'unknown KV error');
  }
  const policy = { version: previousVersion + 1, activeKeys, updatedAt: new Date().toISOString() };
  await binding.put(CATALOGUE_POLICY_KEY, JSON.stringify(policy), { expirationTtl: 60 * 60 * 24 * 30 });
  return policy;
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
      const result = await database.rpc('set_member_username', {
        p_user_id: userId,
        p_username: username,
      }).single();
      databaseError(result.error);
      return { userId: result.data.user_id, username: result.data.username, createdAt: result.data.created_at };
    },
    async saveCollectionMembership(userId, collection, title) {
      const result = await database.rpc('save_saved_title_membership', {
        p_user_id: userId,
        p_collection: collection,
        p_canonical_key: title.canonicalKey,
        p_tmdb_id: title.tmdbId,
        p_title_type: title.type,
        p_title_snapshot: title.name,
        p_release_year_snapshot: title.year,
        p_source: title.source,
        p_source_note: title.sourceNote,
      }).single();
      databaseError(result.error);
      return mapCollectionRow(result.data);
    },
    async saveWatchlist(userId, title) {
      const membership = await this.saveCollectionMembership(userId, 'watch_later', title);
      const { collection, ...watchlistItem } = membership;
      return watchlistItem;
    },
    async removeCollectionMembership(userId, collection, canonicalKey) {
      const result = await database.rpc('remove_saved_title_membership', {
        p_user_id: userId, p_collection: collection, p_canonical_key: canonicalKey,
      });
      databaseError(result.error);
      return { removed: Boolean(result.data) };
    },
    async isTitleBlocked(canonicalKey) {
      const result = await database.from('catalogue_blocks').select('id').eq('canonical_key', canonicalKey).is('removed_at', null).maybeSingle();
      databaseError(result.error);
      return Boolean(result.data);
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
      const result = await database.from('user').select('id, email').eq('username', username).maybeSingle();
      databaseError(result.error);
      if (isReservedWillUsername(username) && (!result.data || result.data.id !== userId || String(result.data.email || '').trim().toLowerCase() !== adminEmail(env))) return false;
      return !result.data || result.data.id === userId;
    },
    async listAdminUsers() {
      const [usersResult, rentalsResult, reviewsResult] = await Promise.all([
        database.from('user').select('id, email, username, emailVerified, createdAt, updatedAt').order('createdAt', { ascending: false }),
        database.from('rental_items').select('user_id, returned_at, watched_status'),
        database.from('reviews').select('user_id, deleted_at'),
      ]);
      [usersResult, rentalsResult, reviewsResult].forEach(({ error }) => databaseError(error));
      const rentals = new Map();
      (rentalsResult.data || []).forEach((row) => {
        const current = rentals.get(row.user_id) || { rentals: 0, activeRentals: 0, watched: 0 };
        current.rentals += 1;
        if (!row.returned_at) current.activeRentals += 1;
        if (row.watched_status === 'watched') current.watched += 1;
        rentals.set(row.user_id, current);
      });
      const reviews = new Map();
      (reviewsResult.data || []).forEach((row) => {
        if (row.deleted_at) return;
        reviews.set(row.user_id, (reviews.get(row.user_id) || 0) + 1);
      });
      return (usersResult.data || []).map((user) => ({
        id: user.id,
        email: user.email,
        username: user.username,
        emailVerified: Boolean(user.emailVerified),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        rentalCount: rentals.get(user.id)?.rentals || 0,
        activeRentalCount: rentals.get(user.id)?.activeRentals || 0,
        watchedCount: rentals.get(user.id)?.watched || 0,
        reviewCount: reviews.get(user.id) || 0,
      }));
    },
    async getAdminUserDetail(userId) {
      const [userResult, savedResult, rentalResult] = await Promise.all([
        database.from('user').select('id, email, username, emailVerified, createdAt, updatedAt').eq('id', userId).maybeSingle(),
        database.from('saved_title_memberships').select('id, canonical_key, tmdb_id, title_type, title_snapshot, release_year_snapshot, collection, source, source_note, added_at, completed_at').eq('user_id', userId).order('added_at', { ascending: false }).limit(50),
        database.from('rental_items').select('id, canonical_key, tmdb_id, title_type, title_snapshot, release_year_snapshot, rented_at, returned_at, watched_status').eq('user_id', userId).order('rented_at', { ascending: false }).limit(50),
      ]);
      [userResult, savedResult, rentalResult].forEach(({ error }) => databaseError(error));
      if (!userResult.data) return null;
      const items = rentalResult.data || [];
      return {
        user: {
          id: userResult.data.id,
          email: userResult.data.email,
          username: userResult.data.username,
          emailVerified: Boolean(userResult.data.emailVerified),
          createdAt: userResult.data.createdAt,
          updatedAt: userResult.data.updatedAt,
        },
        collections: {
          watch_later: (savedResult.data || []).filter((row) => row.collection === 'watch_later' && !row.completed_at).map(mapCollectionRow),
          favorite: (savedResult.data || []).filter((row) => row.collection === 'favorite').map(mapCollectionRow),
        },
        activeRental: items.filter((row) => !row.returned_at).map((row) => mapRentalItemRow(row)),
        history: items.filter((row) => row.returned_at).map((row) => mapRentalItemRow(row)),
      };
    },
    async listCatalogueBlocks({ query = '', active = 'all', limit = 50, offset = 0 } = {}) {
      let request = database.from('catalogue_blocks')
        .select('id, title_type, tmdb_id, canonical_key, reason, created_by, created_at, removed_by, removed_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (active === 'active') request = request.is('removed_at', null);
      if (active === 'history') request = request.not('removed_at', 'is', null);
      const value = String(query).trim();
      if (value) {
        const escaped = value.replace(/[%,]/g, '');
        request = request.or(`canonical_key.ilike.%${escaped}%,reason.ilike.%${escaped}%`);
      }
      const result = await request;
      databaseError(result.error);
      return { blocks: (result.data || []).map(mapCatalogueBlockRow), total: result.count || 0, limit, offset };
    },
    async createCatalogueBlock(adminId, block) {
      const existing = await database.from('catalogue_blocks')
        .select('id, title_type, tmdb_id, canonical_key, reason, created_by, created_at, removed_by, removed_at')
        .eq('title_type', block.type).eq('tmdb_id', block.tmdbId).is('removed_at', null).maybeSingle();
      databaseError(existing.error);
      if (existing.data) return mapCatalogueBlockRow(existing.data);
      const result = await database.from('catalogue_blocks').insert({
        title_type: block.type,
        tmdb_id: block.tmdbId,
        reason: block.reason,
        created_by: adminId,
      }).select('id, title_type, tmdb_id, canonical_key, reason, created_by, created_at, removed_by, removed_at').single();
      databaseError(result.error);
      return mapCatalogueBlockRow(result.data);
    },
    async restoreCatalogueBlock(adminId, type, tmdbId) {
      const result = await database.from('catalogue_blocks').update({
        removed_at: new Date().toISOString(),
        removed_by: adminId,
      }).eq('title_type', type).eq('tmdb_id', tmdbId).is('removed_at', null)
        .select('id, title_type, tmdb_id, canonical_key, reason, created_by, created_at, removed_by, removed_at').maybeSingle();
      databaseError(result.error);
      return result.data ? mapCatalogueBlockRow(result.data) : null;
    },
    async listActiveCatalogueKeys() {
      const result = await database.from('catalogue_blocks').select('canonical_key').is('removed_at', null).order('canonical_key');
      databaseError(result.error);
      return (result.data || []).map((row) => row.canonical_key);
    },
    async listAdminReviews({ visibility = 'all', limit = 50, offset = 0 } = {}) {
      let request = database.from('reviews')
        .select('id, user_id, canonical_key, rating, body_censored, visibility, created_at, updated_at, moderation_reason, moderated_by, moderated_at', { count: 'exact' })
        .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (visibility === 'public' || visibility === 'hidden') request = request.eq('visibility', visibility);
      const result = await request;
      databaseError(result.error);
      return { reviews: (result.data || []).map(mapAdminReviewRow), total: result.count || 0, limit, offset };
    },
    async moderateReview(adminId, reviewId, action, reason = '') {
      const update = action === 'hide'
        ? { visibility: 'hidden', moderation_reason: reason, moderated_by: adminId, moderated_at: new Date().toISOString() }
        : { visibility: 'public', moderation_reason: null, moderated_by: null, moderated_at: null };
      const result = await database.from('reviews').update(update).eq('id', reviewId)
        .select('id, user_id, canonical_key, rating, body_censored, visibility, created_at, updated_at, moderation_reason, moderated_by, moderated_at').maybeSingle();
      databaseError(result.error);
      return result.data ? mapAdminReviewRow(result.data) : null;
    },
    async getAdminMetrics({ from, to }) {
      const [rentals, returnedItems, reviews, users, blocks, rentalUsers] = await Promise.all([
        database.from('rentals').select('id', { count: 'exact', head: true }).gte('opened_at', from).lt('opened_at', to),
        database.from('rental_items').select('id', { count: 'exact', head: true }).gte('returned_at', from).lt('returned_at', to),
        database.from('reviews').select('id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', to),
        database.from('user').select('id', { count: 'exact', head: true }).gte('createdAt', from).lt('createdAt', to),
        database.from('catalogue_blocks').select('id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', to),
        database.from('rental_items').select('user_id').gte('rented_at', from).lt('rented_at', to).limit(10000),
      ]);
      [rentals, returnedItems, reviews, users, blocks, rentalUsers].forEach(({ error }) => databaseError(error));
      return {
        from, to,
        rentals: rentals.count || 0,
        returns: returnedItems.count || 0,
        reviews: reviews.count || 0,
        newUsers: users.count || 0,
        catalogueBlocks: blocks.count || 0,
        activeUsers: new Set((rentalUsers.data || []).map((row) => row.user_id)).size,
      };
    },
    async revokeUserSessions(userId) {
      const result = await database.from('session').delete({ count: 'exact' }).eq('userId', userId);
      databaseError(result.error);
      return { revoked: result.count || 0 };
    },
    async listHistory(userId, offset, blockedKeys = null) {
      const activeBlockedKeys = blockedKeys || new Set(await this.listActiveCatalogueKeys());
      const result = await database.from('rental_items')
        .select('id, canonical_key, tmdb_id, title_type, title_snapshot, release_year_snapshot, rented_at, returned_at, watched_status')
        .eq('user_id', userId).not('returned_at', 'is', null)
        .order('returned_at', { ascending: false }).range(offset, offset + HISTORY_PAGE_SIZE);
      databaseError(result.error);
      const rows = result.data || [];
      return { history: rows.slice(0, HISTORY_PAGE_SIZE).map((row) => mapRentalItemRow(row, activeBlockedKeys)), hasMore: rows.length > HISTORY_PAGE_SIZE };
    },
    async getState(userId) {
      const blockedKeys = new Set(await this.listActiveCatalogueKeys());
      const [profileResult, watchlistResult, rentalResult, history] = await Promise.all([
        database.from('profiles').select('user_id, username, created_at').eq('user_id', userId).maybeSingle(),
        database.from('saved_title_memberships').select('id, canonical_key, tmdb_id, title_type, title_snapshot, release_year_snapshot, collection, source, source_note, added_at, completed_at').eq('user_id', userId).order('added_at', { ascending: false }),
        database.from('rentals').select('id, opened_at, rental_items(id, canonical_key, tmdb_id, title_type, title_snapshot, release_year_snapshot, rented_at, returned_at, watched_status)').eq('user_id', userId).is('returned_at', null).maybeSingle(),
        this.listHistory(userId, 0, blockedKeys),
      ]);
      [profileResult, watchlistResult, rentalResult].forEach(({ error }) => databaseError(error));
      return {
        profile: profileResult.data ? { userId: profileResult.data.user_id, username: profileResult.data.username, createdAt: profileResult.data.created_at } : null,
        watchlist: (watchlistResult.data || []).filter((row) => !blockedKeys.has(row.canonical_key) && row.collection === 'watch_later' && !row.completed_at).map(mapWatchlistRow),
        collections: {
          watch_later: (watchlistResult.data || []).filter((row) => !blockedKeys.has(row.canonical_key) && row.collection === 'watch_later' && !row.completed_at).map(mapCollectionRow),
          favorite: (watchlistResult.data || []).filter((row) => !blockedKeys.has(row.canonical_key) && row.collection === 'favorite').map(mapCollectionRow),
        },
        activeRental: mapActiveRentalRow(rentalResult.data, blockedKeys),
        history: history.history,
        historyHasMore: history.hasMore,
      };
    },
  };
}

export function createLocadoraDataWorker({ authenticate = authenticateBetterAuth, adminAuthenticate = authenticateAdmin, createRepository = createSupabaseRepository, authFactory = createAuth } = {}) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') {
        const headers = corsHeaders(request, env);
        if (url.pathname.startsWith('/api/auth')) {
          headers['access-control-allow-credentials'] = 'true';
          headers['access-control-expose-headers'] = 'set-auth-token';
        }
        return new Response(null, { status: 204, headers });
      }
      if (url.pathname.startsWith('/api/auth')) {
        if (env.AUTH_RATE_LIMITER) {
          const client = request.headers.get('cf-connecting-ip') || 'unknown-client';
          const allowed = await env.AUTH_RATE_LIMITER.limit({ key: `${client}:${url.pathname}` });
          if (!allowed.success) return new Response(JSON.stringify({ message: 'Too many authentication attempts; try again shortly', code: 'RATE_LIMITED' }), {
            status: 429,
            headers: { ...JSON_HEADERS, ...corsHeaders(request, env), 'access-control-allow-credentials': 'true', 'retry-after': '60' },
          });
        }
        const runtime = authFactory(env, ctx);
        const auth = runtime.auth || runtime;
        try {
          const authResponse = await auth.handler(request);
          const headers = new Headers(authResponse.headers);
          Object.entries(corsHeaders(request, env)).forEach(([key, value]) => headers.set(key, value));
          headers.set('access-control-allow-credentials', 'true');
          const exposed = headers.get('access-control-expose-headers') || '';
          headers.set('access-control-expose-headers', [...new Set([...exposed.split(',').map((item) => item.trim()).filter(Boolean), 'set-auth-token'])].join(', '));
          if (authResponse.status >= 500) {
            headers.set('content-type', 'application/json; charset=utf-8');
            return new Response(JSON.stringify({ message: 'Authentication service temporarily unavailable', code: 'AUTH_SERVICE_UNAVAILABLE' }), { status: 503, headers });
          }
          return new Response(authResponse.body, { status: authResponse.status, headers });
        } catch (error) {
          console.error('auth request failed', error);
          return response(request, env, { error: 'Authentication service unavailable' }, 503);
        } finally {
          await runtime.close?.();
        }
      }
      const isAdminUsersRequest = request.method === 'GET' && url.pathname === '/v1/admin/users';
      const adminUserDetailMatch = request.method === 'GET' ? url.pathname.match(/^\/v1\/admin\/users\/([^/]+)$/) : null;
      const adminRevokeMatch = request.method === 'POST' ? url.pathname.match(/^\/v1\/admin\/users\/([^/]+)\/revoke-sessions$/) : null;
      const isCatalogueBlocksRequest = (request.method === 'GET' || request.method === 'POST') && url.pathname === '/v1/admin/catalogue/blocks';
      const catalogueRestoreMatch = request.method === 'POST' ? url.pathname.match(/^\/v1\/admin\/catalogue\/blocks\/(movie|series)\/([1-9][0-9]*)\/restore$/) : null;
      const isAdminReviewsRequest = request.method === 'GET' && url.pathname === '/v1/admin/reviews';
      const adminReviewMatch = request.method === 'POST' ? url.pathname.match(/^\/v1\/admin\/reviews\/([^/]+)\/(hide|restore)$/) : null;
      const isAdminMetricsRequest = request.method === 'GET' && url.pathname === '/v1/admin/metrics';
      if (isAdminUsersRequest || adminUserDetailMatch || adminRevokeMatch || isCatalogueBlocksRequest || catalogueRestoreMatch || isAdminReviewsRequest || adminReviewMatch || isAdminMetricsRequest) {
        if (env.AUTH_RATE_LIMITER) {
          const client = request.headers.get('cf-connecting-ip') || 'unknown-client';
          const allowed = await env.AUTH_RATE_LIMITER.limit({ key: `${client}:/v1/admin` });
          if (!allowed.success) return response(request, env, { error: 'Too many admin requests; try again shortly', code: 'RATE_LIMITED' }, 429);
        }
        let adminUser;
        try { adminUser = await adminAuthenticate(request, env, ctx); }
        catch (error) {
          console.error('admin authentication failed', error?.message || 'unknown auth error');
          return response(request, env, { error: 'Authentication service unavailable' }, 503);
        }
        if (!adminUser) return response(request, env, { error: 'Admin access required' }, 403);
        try {
          const repository = createRepository(env);
          if (isAdminUsersRequest) return response(request, env, { users: await repository.listAdminUsers() });
          if (adminUserDetailMatch) {
            const userId = decodeURIComponent(adminUserDetailMatch[1]);
            if (!userId || userId.length > 128) return response(request, env, { error: 'Invalid user ID' }, 400);
            const detail = await repository.getAdminUserDetail(userId);
            if (!detail) return response(request, env, { error: 'User not found' }, 404);
            return response(request, env, detail);
          }
          if (adminRevokeMatch) {
            const userId = decodeURIComponent(adminRevokeMatch[1]);
            if (!userId || userId.length > 128) return response(request, env, { error: 'Invalid user ID' }, 400);
            return response(request, env, await repository.revokeUserSessions(userId));
          }
          if (isCatalogueBlocksRequest && request.method === 'GET') {
            const active = url.searchParams.get('active') || 'all';
            const limit = Number(url.searchParams.get('limit') || 50);
            const offset = Number(url.searchParams.get('offset') || 0);
            if (!['all', 'active', 'history'].includes(active) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
              return response(request, env, { error: 'Invalid catalogue block pagination' }, 400);
            }
            return response(request, env, { ...(await repository.listCatalogueBlocks({ query: url.searchParams.get('q') || '', active, limit, offset })) });
          }
          if (catalogueRestoreMatch) {
            const restored = await repository.restoreCatalogueBlock(adminUser.id, catalogueRestoreMatch[1], Number(catalogueRestoreMatch[2]));
            if (!restored) return response(request, env, { error: 'Active catalogue block not found' }, 404);
            const policy = await publishCataloguePolicy(repository, env);
            return response(request, env, { block: restored, policyVersion: policy.version });
          }
          if (isAdminReviewsRequest) {
            const visibility = url.searchParams.get('visibility') || 'all';
            const limit = Number(url.searchParams.get('limit') || 50);
            const offset = Number(url.searchParams.get('offset') || 0);
            if (!['all', 'public', 'hidden'].includes(visibility) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) return response(request, env, { error: 'Invalid review pagination' }, 400);
            return response(request, env, await repository.listAdminReviews({ visibility, limit, offset }));
          }
          if (isAdminMetricsRequest) {
            const now = new Date();
            const from = metricsWindow(url.searchParams.get('from')) || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const to = metricsWindow(url.searchParams.get('to')) || now.toISOString();
            if (from >= to || new Date(to).getTime() - new Date(from).getTime() > 366 * 24 * 60 * 60 * 1000) return response(request, env, { error: 'Invalid metrics date range' }, 400);
            return response(request, env, { metrics: await repository.getAdminMetrics({ from, to }) });
          }
          if (adminReviewMatch) {
            const reviewId = decodeURIComponent(adminReviewMatch[1]);
            if (!isUuid(reviewId)) return response(request, env, { error: 'Invalid review ID' }, 400);
            const body = await readJson(request);
            const reason = String(body?.reason || '').trim().replace(/\s+/g, ' ');
            if (adminReviewMatch[2] === 'hide' && (reason.length < 1 || reason.length > 500)) return response(request, env, { error: 'A hidden review needs a reason up to 500 characters' }, 400);
            const review = await repository.moderateReview(adminUser.id, reviewId, adminReviewMatch[2], reason);
            if (!review) return response(request, env, { error: 'Review not found' }, 404);
            return response(request, env, { review });
          }
          const block = normalizeCatalogueBlock(await readJson(request));
          if (!block) return response(request, env, { error: 'Catalogue blocks need a movie or series type, positive TMDB id, and a reason up to 500 characters' }, 400);
          const created = await repository.createCatalogueBlock(adminUser.id, block);
          const policy = await publishCataloguePolicy(repository, env);
          return response(request, env, { block: created, policyVersion: policy.version }, 201);
        } catch (error) {
          console.error('admin request failed', error);
          return response(request, env, { error: error.message || 'The Locadora archive is unavailable' }, error.status || 503);
        }
      }
      const isStateRequest = request.method === 'GET' && url.pathname === '/v1/state';
      const isHistoryRequest = request.method === 'GET' && url.pathname === '/v1/history';
      const usernameMatch = request.method === 'GET' ? url.pathname.match(/^\/v1\/usernames\/([a-z0-9_-]{3,24})$/) : null;
      const isProfileRequest = request.method === 'PUT' && url.pathname === '/v1/profile';
      const isWatchlistRequest = request.method === 'POST' && url.pathname === '/v1/watchlist';
      const collectionMatch = url.pathname.match(/^\/v1\/collections\/(watch_later|favorite)(?:\/(movie|series)\/([1-9][0-9]*))?$/);
      const isCollectionSaveRequest = request.method === 'POST' && collectionMatch && !collectionMatch[2];
      const isCollectionRemoveRequest = request.method === 'DELETE' && collectionMatch && collectionMatch[2];
      const isRentalRequest = request.method === 'POST' && url.pathname === '/v1/rentals';
      const returnMatch = request.method === 'POST' ? url.pathname.match(/^\/v1\/rental-items\/([^/]+)\/return$/) : null;
      const publicReviewsMatch = request.method === 'GET' ? url.pathname.match(/^\/v1\/titles\/(movie|series)\/([1-9][0-9]*)\/reviews$/) : null;
      const reviewWriteMatch = request.method === 'POST' ? url.pathname.match(/^\/v1\/titles\/(movie|series)\/([1-9][0-9]*)\/review$/) : null;
      const reviewEligibilityMatch = request.method === 'GET' ? url.pathname.match(/^\/v1\/titles\/(movie|series)\/([1-9][0-9]*)\/review-eligibility$/) : null;
      if (!isStateRequest && !isHistoryRequest && !usernameMatch && !isProfileRequest && !isWatchlistRequest && !isCollectionSaveRequest && !isCollectionRemoveRequest && !isRentalRequest && !returnMatch && !publicReviewsMatch && !reviewWriteMatch && !reviewEligibilityMatch) return response(request, env, { error: 'Not found' }, 404);

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
        if (isCollectionRemoveRequest) {
          return response(request, env, await repository.removeCollectionMembership(userId, collectionMatch[1], `${collectionMatch[2]}:${collectionMatch[3]}`));
        }
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
          if (await repository.isTitleBlocked?.(title.canonicalKey)) return response(request, env, { error: 'That title is no longer available in the catalogue', code: 'CATALOGUE_TITLE_BLOCKED' }, 409);
          return response(request, env, { watchlistItem: await repository.saveWatchlist(userId, title) }, 201);
        }
        if (isCollectionSaveRequest) {
          const title = normalizeTitle({ ...body?.title, source: body?.source, sourceNote: body?.sourceNote });
          if (!title) return response(request, env, { error: 'Invalid collection title' }, 400);
          if (await repository.isTitleBlocked?.(title.canonicalKey)) return response(request, env, { error: 'That title is no longer available in the catalogue', code: 'CATALOGUE_TITLE_BLOCKED' }, 409);
          return response(request, env, { membership: await repository.saveCollectionMembership(userId, collectionMatch[1], title) }, 201);
        }
        if (isRentalRequest) {
          const titles = Array.isArray(body?.titles) ? body.titles.map((title) => normalizeTitle(title, { requireSource: false })) : [];
          const distinct = new Set(titles.filter(Boolean).map((title) => title.canonicalKey));
          if (titles.length < 1 || titles.length > 3 || titles.some((title) => !title) || distinct.size !== titles.length) return response(request, env, { error: 'Choose one to three distinct titles' }, 400);
          const blocked = (await Promise.all(titles.map((title) => repository.isTitleBlocked?.(title.canonicalKey)))).some(Boolean);
          if (blocked) return response(request, env, { error: 'That title is no longer available in the catalogue', code: 'CATALOGUE_TITLE_BLOCKED' }, 409);
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
        return response(request, env, { error: error.message || 'The Locadora archive is unavailable', ...(error.code ? { code: error.code } : {}) }, error.status || 503);
      }
    },
  };
}

export default createLocadoraDataWorker();
