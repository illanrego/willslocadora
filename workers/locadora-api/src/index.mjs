const TMDB_ROOT = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_HOST = 'image.tmdb.org';
const MAX_TITLES = 40;
const LOCALES = new Set(['pt-BR', 'en-US']);

const PROVIDERS = Object.freeze([
  ['netflix', 8, 'Netflix', 'Netflix', '/images/providers/netflix.svg'],
  ['prime-video', 119, 'Amazon Prime Video', 'Prime Video', '/images/providers/prime-video.svg'],
  ['max', 1899, 'HBO Max', 'Max', '/images/providers/hbo-max.svg'],
  ['disney-plus', 337, 'Disney Plus', 'Disney+', '/images/providers/disney-plus.svg'],
  ['globoplay', 307, 'Globoplay', 'Globoplay', '/images/providers/globoplay.svg'],
  ['paramount-plus', 531, 'Paramount Plus', 'Paramount+', '/images/providers/paramount-plus.svg'],
  ['apple-tv-plus', 350, 'Apple TV Plus', 'Apple TV+', '/images/providers/apple-tv-plus.svg'],
  ['mubi', 11, 'MUBI', 'MUBI', '/images/providers/mubi.svg'],
  ['crunchyroll', 283, 'Crunchyroll', 'Crunchyroll', '/images/providers/crunchyroll.svg'],
].map(([id, tmdbProviderId, canonicalName, displayName, logoPath]) => Object.freeze({ id, tmdbProviderId, canonicalName, displayName, logoPath })));
const PROVIDERS_BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]));

const MOVIE_GENRES = Object.freeze({
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18,
  Family: 10751, Fantasy: 14, Horror: 27, Mystery: 9648, Romance: 10749, 'Sci-Fi': 878, Thriller: 53,
});
const TV_GENRES = Object.freeze({
  Action: 10759, Adventure: 10759, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18,
  Family: 10751, Fantasy: 10765, Horror: 9648, Mystery: 9648, Romance: 10766, 'Sci-Fi': 10765, Thriller: 9648,
});
const TV_GENRE_NAMES = Object.freeze({ 16: 'Animation', 18: 'Drama', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 9648: 'Mystery', 10751: 'Family', 10759: 'Action', 10765: 'Sci-Fi', 10766: 'Romance' });

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', ...headers } });
}

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean));
}

function cors(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return { ok: true, headers: {} };
  if (!allowedOrigins(env).has(origin)) return { ok: false, headers: {} };
  return { ok: true, headers: { 'access-control-allow-origin': origin, vary: 'origin' } };
}

function validShelf(url) {
  const year = Number(url.searchParams.get('year'));
  const genre = url.searchParams.get('genre') || '';
  const genres = genre.split(',').map((value) => value.trim()).filter(Boolean);
  const type = url.searchParams.get('type') === 'series' ? 'series' : 'movie';
  const stand = Number(url.searchParams.get('stand') || 0);
  const requested = url.searchParams.get('providers') ?? url.searchParams.get('provider') ?? '';
  const providers = [...new Set(requested.split(',').map((id) => id.trim()).filter((id) => PROVIDERS_BY_ID.has(id)))].sort();
  const ignoreStoreYear = url.searchParams.get('ignoreStoreYear') === 'true';
  if (!Number.isInteger(year) || year < 1920 || year > 2026 || !genres.length || genres.length > 3 || genres.some((value) => value.length > 20) || !Number.isInteger(stand) || stand < 0 || stand > 20 || (requested && !providers.length) || (ignoreStoreYear && !providers.length)) return null;
  return { year, genre, genres, type, stand, providers, ignoreStoreYear };
}

function imageUrl(path, size) {
  return typeof path === 'string' && path.startsWith('/') ? `https://${TMDB_IMAGE_HOST}/t/p/${size}${path}` : '';
}

function yearFromDate(value) {
  const year = Number(String(value || '').slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

async function mapWithConcurrency(items, mapper, limit = 4) {
  const values = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      values[index] = await mapper(items[index]);
    }
  }));
  return values;
}

function createTmdb(env, fetchImpl) {
  if (!env.TMDB_API_KEY) throw new Error('TMDB is not configured');
  async function request(path, locale = 'pt-BR') {
    const url = new URL(`${TMDB_ROOT}${path}`);
    url.searchParams.set('api_key', env.TMDB_API_KEY);
    url.searchParams.set('language', LOCALES.has(locale) ? locale : 'pt-BR');
    const response = await fetchImpl(url.href, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`TMDB request failed (${response.status})`);
    return response.json();
  }
  return { request };
}

async function shelf(filters, env, fetchImpl) {
  const tmdb = createTmdb(env, fetchImpl);
  const tmdbType = filters.type === 'series' ? 'tv' : 'movie';
  const genreMap = tmdbType === 'tv' ? TV_GENRES : MOVIE_GENRES;
  const genreIds = [...new Set(filters.genres.map((genre) => genreMap[genre]).filter(Boolean))];
  const dateKey = tmdbType === 'tv' ? 'first_air_date' : 'primary_release_date';
  const providerIds = filters.providers.map((id) => PROVIDERS_BY_ID.get(id).tmdbProviderId).sort((a, b) => a - b);
  const firstPage = filters.stand * 2 + 1;
  const loadPage = (page) => {
    const query = new URLSearchParams({ page: String(page), [`${dateKey}.gte`]: `${filters.ignoreStoreYear ? 1920 : filters.year - (providerIds.length ? 19 : 4)}-01-01`, [`${dateKey}.lte`]: `${filters.ignoreStoreYear ? 2026 : filters.year}-12-31` });
    if (genreIds.length) query.set('with_genres', genreIds.join('|'));
    if (providerIds.length) {
      query.set('watch_region', 'BR');
      query.set('with_watch_monetization_types', 'flatrate');
      query.set('with_watch_providers', providerIds.join('|'));
    }
    return tmdb.request(`/discover/${tmdbType}?${query}`);
  };
  const pages = await Promise.all([loadPage(firstPage), loadPage(firstPage + 1)]);
  const discovered = pages.flatMap((page) => Array.isArray(page.results) ? page.results : []).slice(0, MAX_TITLES);
  const imdbIds = await mapWithConcurrency(discovered, async (title) => {
    try { return (await tmdb.request(`/${tmdbType}/${title.id}/external_ids`)).imdb_id || ''; } catch { return ''; }
  });
  const selectedNames = filters.providers.map((id) => PROVIDERS_BY_ID.get(id).canonicalName);
  const genreName = (id) => tmdbType === 'tv' ? TV_GENRE_NAMES[id] : Object.keys(MOVIE_GENRES).find((name) => MOVIE_GENRES[name] === id);
  return discovered.flatMap((title, index) => /^tt\d+$/.test(imdbIds[index] || '') ? [{
    id: imdbIds[index], type: filters.type, name: title.title || title.name || 'Untitled', year: yearFromDate(title.release_date || title.first_air_date),
    genres: (title.genre_ids || []).map(genreName).filter(Boolean), poster: imageUrl(title.poster_path, 'w500'), background: imageUrl(title.backdrop_path, 'w1280'),
    description: title.overview || '', imdbRating: title.vote_average ? String(title.vote_average) : '', director: [], writer: [], cast: [], source: 'tmdb-discover',
    availabilityBR: { link: '', providers: selectedNames, subscriptionProviders: selectedNames },
  }] : []);
}

async function titleMeta({ type, id, locale }, env, fetchImpl) {
  if (!['movie', 'series'].includes(type) || !/^[a-zA-Z0-9:_-]+$/.test(id) || !LOCALES.has(locale)) throw new Error('Invalid title metadata request');
  const tmdb = createTmdb(env, fetchImpl);
  let title;
  if (/^tt\d+$/.test(id)) {
    const found = await tmdb.request(`/find/${id}?external_source=imdb_id`, locale);
    title = (type === 'series' ? found.tv_results : found.movie_results)?.[0];
  } else if (/^tmdb:\d+$/.test(id)) {
    const tmdbType = type === 'series' ? 'tv' : 'movie';
    title = await tmdb.request(`/${tmdbType}/${id.slice(5)}`, locale);
  }
  if (!title) return { id, type };
  return {
    id, type, name: title.title || title.name || 'Untitled', year: yearFromDate(title.release_date || title.first_air_date),
    description: title.overview || '', poster: imageUrl(title.poster_path, 'w500'), background: imageUrl(title.backdrop_path, 'w1280'),
    imdbRating: title.vote_average ? String(title.vote_average) : '', genres: (title.genres || []).map((genre) => genre.name).filter(Boolean),
  };
}

async function featured(year, env, fetchImpl) {
  if (!Number.isInteger(year) || year < 1920 || year > 2026) throw new Error('Invalid featured year');
  const tmdb = createTmdb(env, fetchImpl);
  const query = new URLSearchParams({ sort_by: 'popularity.desc', 'primary_release_date.gte': `${year}-01-01`, 'primary_release_date.lte': `${year}-12-31`, 'vote_count.gte': '20' });
  const data = await tmdb.request(`/discover/movie?${query}`);
  return (data.results || []).slice(0, 3).map((title) => ({
    id: `tmdb:${title.id}`, type: 'movie', name: title.title || 'Untitled', year: yearFromDate(title.release_date),
    poster: imageUrl(title.poster_path, 'w500'), background: imageUrl(title.backdrop_path, 'w1280'), description: title.overview || '', genres: [],
  }));
}

async function image(source, fetchImpl) {
  let url;
  try { url = new URL(source); } catch { throw new Error('Invalid image URL'); }
  if (url.protocol !== 'https:' || url.hostname !== TMDB_IMAGE_HOST || !url.pathname.startsWith('/t/p/')) throw new Error('Image URL is not allowed');
  const response = await fetchImpl(url.href, { headers: { accept: 'image/*' }, signal: AbortSignal.timeout(5000) });
  const contentType = response.headers.get('content-type') || '';
  const length = Number(response.headers.get('content-length') || 0);
  if (!response.ok || !contentType.toLowerCase().startsWith('image/') || length > 8_000_000) throw new Error('Image is unavailable');
  const body = await response.arrayBuffer();
  if (body.byteLength > 8_000_000) throw new Error('Image is too large');
  return { contentType: contentType.split(';')[0], body };
}

export function createLocadoraWorker({ fetchImpl = fetch } = {}) {
  return {
    async fetch(request, env, ctx) {
      const policy = cors(request, env);
      if (!policy.ok) return json({ error: 'Origin is not allowed' }, 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...policy.headers, 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, policy.headers);
      const url = new URL(request.url);
      try {
        if (url.pathname === '/v1/health') return json({ ok: true, service: 'locadora-api' }, 200, policy.headers);
        if (url.pathname === '/v1/providers') return json({ providers: PROVIDERS }, 200, { ...policy.headers, 'cache-control': 'public, max-age=604800' });
        if (url.pathname === '/v1/featured') {
          const year = Number(url.searchParams.get('year'));
          const titles = await featured(year, env, fetchImpl);
          return json({ titles, year }, 200, { ...policy.headers, 'cache-control': 'public, max-age=86400, s-maxage=604800' });
        }
        if (url.pathname === '/v1/image') {
          const result = await image(url.searchParams.get('url') || '', fetchImpl);
          return new Response(result.body, { status: 200, headers: { ...policy.headers, 'content-type': result.contentType, 'cache-control': 'public, max-age=86400, s-maxage=604800', 'x-content-type-options': 'nosniff' } });
        }
        if (url.pathname === '/v1/title') {
          const meta = await titleMeta({ type: url.searchParams.get('type'), id: url.searchParams.get('id') || '', locale: url.searchParams.get('locale') || 'pt-BR' }, env, fetchImpl);
          return json({ meta }, 200, { ...policy.headers, 'cache-control': 'public, max-age=86400, s-maxage=604800' });
        }
        if (url.pathname === '/v1/shelf') {
          const filters = validShelf(url);
          if (!filters) return json({ error: 'Invalid shelf filters' }, 400, policy.headers);
          const titles = await shelf(filters, env, fetchImpl);
          return json({ titles, year: filters.year, genre: filters.genre, type: filters.type, stand: filters.stand, providers: filters.providers, ignoreStoreYear: filters.ignoreStoreYear }, 200, { ...policy.headers, 'cache-control': 'public, max-age=900, s-maxage=3600' });
        }
        return json({ error: 'Not found' }, 404, policy.headers);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const status = /^(Invalid|Image URL is not allowed)/.test(message) ? 400 : 502;
        const publicError = /TMDB is not configured/.test(message) ? 'Catalogue service is not configured'
          : status === 400 ? message : 'Catalogue service is temporarily unavailable';
        return json({ error: publicError }, status, policy.headers);
      }
    },
  };
}

export default createLocadoraWorker();
