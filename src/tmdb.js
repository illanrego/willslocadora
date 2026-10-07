'use strict';

const { PROVIDERS_BY_ID } = require('./providers.js');

const TMDB_API_ROOT = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_ROOT = 'https://image.tmdb.org/t/p';
const SUPPORTED_LOCALES = new Set(['pt-BR', 'en-US']);
// Credit-stand department allowlist — mirrors workers/locadora-api/src/index.mjs.
const CREDIT_DEPARTMENTS = new Set(['Acting', 'Directing', 'Writing', 'Camera', 'Editing', 'Visual Effects', 'Sound', 'Art', 'Production', 'Music', 'Costume & Make-Up', 'Lighting']);
const CREDIT_WRITER_JOBS = ['Writer', 'Screenplay', 'Story', 'Teleplay'];
const SELF_CHARACTERS = new Set(['Self', 'Himself', 'Herself']);
const TMDB_MOVIE_GENRES = Object.freeze({
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18,
  Family: 10751, Fantasy: 14, Horror: 27, Mystery: 9648, Romance: 10749, 'Sci-Fi': 878, Thriller: 53,
});
const TMDB_TV_GENRES = Object.freeze({
  Action: 10759, Adventure: 10759, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18,
  Family: 10751, Fantasy: 10765, Horror: 9648, Mystery: 9648, Romance: 10766, 'Sci-Fi': 10765, Thriller: 9648,
});
const TMDB_TV_GENRE_NAMES = Object.freeze({
  16: 'Animation', 18: 'Drama', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 9648: 'Mystery',
  10751: 'Family', 10759: 'Action', 10765: 'Sci-Fi', 10766: 'Romance',
});

const PREFERRED_PROVIDER_IDS = Object.freeze({ 'Amazon Prime Video': 119 });

function normalizeLocale(locale) {
  return SUPPORTED_LOCALES.has(locale) ? locale : 'pt-BR';
}

function imageUrl(path, size) {
  return typeof path === 'string' && path.startsWith('/') ? `${TMDB_IMAGE_ROOT}/${size}${path}` : '';
}

function uniqueNames(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function yearFromDate(value) {
  const year = Number(String(value || '').slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

function mapWithConcurrency(items, mapper, limit = 8) {
  const results = new Array(items.length);
  let next = 0;
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]);
    }
  })).then(() => results);
}

function providerLogoEntries(groups) {
  const entries = new Map();
  for (const provider of groups.flatMap((group) => group || [])) {
    const logo = imageUrl(provider?.logo_path, 'w92');
    if (provider?.provider_name && logo && !entries.has(provider.provider_name)) {
      entries.set(provider.provider_name, { name: String(provider.provider_name), logo });
    }
  }
  return [...entries.values()];
}

function crewNames(crew, jobs) {
  return uniqueNames((Array.isArray(crew) ? crew : [])
    .filter((person) => jobs.includes(person.job))
    .map((person) => person.name));
}

function brazilCertification(type, details) {
  if (type === 'movie') {
    const country = (details.release_dates?.results || []).find((result) => result.iso_3166_1 === 'BR');
    return (country?.release_dates || []).map((release) => release.certification).find(Boolean) || '';
  }
  return (details.content_ratings?.results || []).find((result) => result.iso_3166_1 === 'BR')?.rating || '';
}

function brazilAvailability(details) {
  const offers = details['watch/providers']?.results?.BR;
  if (!offers) return { link: '', providers: [], subscriptionProviders: [] };
  const groups = ['flatrate', 'free', 'ads', 'rent', 'buy'];
  const groupedProviders = groups.map((group) => offers[group] || []);
  return {
    link: typeof offers.link === 'string' ? offers.link : '',
    providers: uniqueNames(groupedProviders.flatMap((group) => group.map((provider) => provider.provider_name))),
    providerLogos: providerLogoEntries(groupedProviders),
    subscriptionProviders: uniqueNames((offers.flatrate || []).map((provider) => provider.provider_name)),
  };
}

function creditGenreName(tmdbType, genreId) {
  return tmdbType === 'tv'
    ? TMDB_TV_GENRE_NAMES[genreId]
    : Object.keys(TMDB_MOVIE_GENRES).find((name) => TMDB_MOVIE_GENRES[name] === genreId);
}

function normalizedCreditType(mediaType) {
  return mediaType === 'tv' ? 'series' : 'movie';
}

function isSelfCharacter(character) {
  const value = String(character || '').trim();
  return SELF_CHARACTERS.has(value) || value.startsWith('Self ') || value.startsWith('Self-');
}

function brazilFlatrate(details) {
  const br = details?.results?.BR || {};
  return { link: typeof br.link === 'string' ? br.link : '', flatrate: Array.isArray(br.flatrate) ? br.flatrate : [] };
}

// cast entries carry no TMDB department/job, so they are normalized to Acting/Acting.
function buildRoles(cast, crew) {
  const counts = new Map();
  const add = (department, job) => {
    if (!CREDIT_DEPARTMENTS.has(department)) return;
    const key = `${department}\u0000${job}`;
    const entry = counts.get(key) || { department, job, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  };
  for (const item of Array.isArray(cast) ? cast : []) add('Acting', 'Acting');
  for (const item of Array.isArray(crew) ? crew : []) add(item.department, item.job || '');
  return [...counts.values()].sort((a, b) => b.count - a.count
    || (a.department < b.department ? -1 : a.department > b.department ? 1 : 0)
    || (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
}

function buildPersonProfile(data, id) {
  return {
    id: String(id),
    name: data?.name || 'Untitled',
    profile: imageUrl(data?.profile_path, 'w185'),
    knownFor: data?.known_for_department || '',
    roles: buildRoles(data?.combined_credits?.cast, data?.combined_credits?.crew),
  };
}

function creditEntries(data, { department, job, type }) {
  const cast = Array.isArray(data?.cast) ? data.cast : [];
  const crew = Array.isArray(data?.crew) ? data.crew : [];
  const entries = [];
  if (department === 'Acting') {
    for (const item of cast) if (!isSelfCharacter(item.character)) entries.push({ item });
  } else {
    for (const item of crew) {
      if (item.department !== department) continue;
      if (job && item.job !== job) continue;
      entries.push({ item });
    }
  }
  return entries.filter((entry) => type === 'all' || normalizedCreditType(entry.item.media_type) === type);
}

function dedupeCredits(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    const key = `${normalizedCreditType(entry.item.media_type)}:${entry.item.id}`;
    const current = byKey.get(key);
    if (!current || (Number(entry.item.vote_count) || 0) > (Number(current.item.vote_count) || 0)) byKey.set(key, entry);
  }
  return [...byKey.values()];
}

function sortCredits(entries) {
  return [...entries].sort((a, b) => {
    const votes = (Number(b.item.vote_count) || 0) - (Number(a.item.vote_count) || 0);
    if (votes) return votes;
    const popularity = (Number(b.item.popularity) || 0) - (Number(a.item.popularity) || 0);
    if (popularity) return popularity;
    const dateA = String(a.item.release_date || a.item.first_air_date || '');
    const dateB = String(b.item.release_date || b.item.first_air_date || '');
    if (dateA !== dateB) return dateA < dateB ? 1 : -1;
    return (Number(a.item.id) || 0) - (Number(b.item.id) || 0);
  });
}

function createTmdbClient({ apiKey = '', fetchImpl = fetch } = {}) {
  const providerIds = new Map();

  async function request(path, locale) {
    const url = new URL(`${TMDB_API_ROOT}${path}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('language', normalizeLocale(locale));
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`TMDB request failed (${response.status})`);
    return response.json();
  }

  async function providerId(type, providerName, locale) {
    const key = `${type}:${providerName}`;
    if (providerIds.has(key)) return providerIds.get(key);
    const data = await request(`/watch/providers/${type}`, locale);
    const matches = (data.results || []).filter((provider) => provider.provider_name === providerName);
    const id = matches.find((provider) => provider.provider_id === PREFERRED_PROVIDER_IDS[providerName])?.provider_id
      || matches[0]?.provider_id;
    providerIds.set(key, id || null);
    return id || null;
  }

  async function discoverProviderShelf({ year, genres, type, providerName = '', providerNames = [], providerIds = [], ignoreStoreYear = false, page = 0, locale = 'pt-BR' }) {
    if (!apiKey) return [];
    const requestedLocale = normalizeLocale(locale);
    const tmdbType = type === 'series' ? 'tv' : 'movie';
    const selectedProviderIds = [...new Set(providerIds.map(Number).filter(Number.isInteger))];
    if (!selectedProviderIds.length && providerName) {
      const provider = await providerId(tmdbType, providerName, requestedLocale);
      if (provider) selectedProviderIds.push(provider);
    }
    if (!selectedProviderIds.length) return [];
    const genreMap = tmdbType === 'tv' ? TMDB_TV_GENRES : TMDB_MOVIE_GENRES;
    const genreIds = [...new Set((genres || []).map((genre) => genreMap[genre]).filter(Boolean))];
    const dateKey = tmdbType === 'movie' ? 'primary_release_date' : 'first_air_date';
    const fetchPage = (number) => {
      const query = new URLSearchParams({
        watch_region: 'BR',
        with_watch_monetization_types: 'flatrate',
        with_watch_providers: selectedProviderIds.join('|'),
        page: String(number),
        [`${dateKey}.gte`]: `${ignoreStoreYear ? 1920 : Number(year) - 19}-01-01`,
        [`${dateKey}.lte`]: `${ignoreStoreYear ? 2026 : year}-12-31`,
      });
      if (genreIds.length) query.set('with_genres', genreIds.join('|'));
      return request(`/discover/${tmdbType}?${query}`, requestedLocale);
    };
    const firstPage = Math.max(1, Number(page) * 2 + 1);
    const pages = await Promise.all([fetchPage(firstPage), fetchPage(firstPage + 1)]);
    const discovered = pages.flatMap((result) => result.results || []);
    const imdbIds = await mapWithConcurrency(discovered, async (title) => {
      try {
        const external = await request(`/${tmdbType}/${title.id}/external_ids`, requestedLocale);
        return external.imdb_id || '';
      } catch { return ''; }
    });
    const names = providerNames.length ? providerNames : [providerName];
    const genreName = (genreId) => tmdbType === 'tv'
      ? TMDB_TV_GENRE_NAMES[genreId]
      : Object.keys(TMDB_MOVIE_GENRES).find((name) => TMDB_MOVIE_GENRES[name] === genreId);
    return discovered.flatMap((title, index) => {
      const imdbId = imdbIds[index];
      if (!/^tt\d+$/.test(imdbId)) return [];
      return [{
        id: `tmdb:${title.id}`,
        imdbId,
        type,
        name: title.title || title.name || 'Untitled',
        year: yearFromDate(title.release_date || title.first_air_date),
        genres: (title.genre_ids || []).map(genreName).filter(Boolean),
        poster: imageUrl(title.poster_path, 'w500'),
        background: imageUrl(title.backdrop_path, 'w1280'),
        description: title.overview || '',
        imdbRating: title.vote_average ? String(title.vote_average) : '',
        director: [], writer: [], cast: [], source: 'tmdb-discover',
        availabilityBR: { link: '', providers: names, subscriptionProviders: names },
      }];
    });
  }

  async function discoverYearHits({ year, locale = 'pt-BR' }) {
    if (!apiKey) return [];
    const query = new URLSearchParams({
      sort_by: 'popularity.desc',
      'primary_release_date.gte': `${year}-01-01`,
      'primary_release_date.lte': `${year}-12-31`,
      'vote_count.gte': '20',
    });
    const result = await request(`/discover/movie?${query}`, locale);
    return (result.results || []).slice(0, 3).map((title) => ({
      id: `tmdb:${title.id}`, type: 'movie', name: title.title || 'Untitled', year: yearFromDate(title.release_date),
      poster: imageUrl(title.poster_path, 'w500'), background: imageUrl(title.backdrop_path, 'w1280'), description: title.overview || '', genres: [],
    }));
  }

  // Public-API dev parity: TMDB-backed person profile + credit stand (no Stremio source).
  async function personProfile(id, locale = 'pt-BR') {
    if (!apiKey) throw new Error('TMDB_API_KEY is required');
    const data = await request(`/person/${encodeURIComponent(id)}?append_to_response=combined_credits`, normalizeLocale(locale));
    return buildPersonProfile(data, id);
  }

  async function personCreditStand({ person, department, job = '', type = 'movie', year, ignoreStoreYear = true, providers = [], stand = 0, locale = 'pt-BR' }) {
    if (!apiKey) throw new Error('TMDB_API_KEY is required');
    const requestedLocale = normalizeLocale(locale);
    const data = await request(`/person/${encodeURIComponent(person)}?append_to_response=combined_credits`, requestedLocale);
    const profile = buildPersonProfile(data, person);
    const deduped = dedupeCredits(creditEntries(data?.combined_credits || {}, { department, job, type }));
    const total = deduped.length;
    let ordered = sortCredits(deduped);
    if (!ignoreStoreYear) {
      const span = providers.length ? 19 : 4;
      ordered = ordered.filter((entry) => {
        const titleYear = yearFromDate(entry.item.release_date || entry.item.first_air_date);
        return Number.isInteger(titleYear) && titleYear >= year - span && titleYear <= year;
      });
    }
    const requestedProviders = providers.map((id) => PROVIDERS_BY_ID.get(id)).filter(Boolean);
    const hydrate = async (entry) => {
      const item = entry.item;
      const titleType = normalizedCreditType(item.media_type);
      const tmdbType = titleType === 'series' ? 'tv' : 'movie';
      let imdbId = '';
      try { imdbId = (await request(`/${tmdbType}/${item.id}/external_ids`, requestedLocale)).imdb_id || ''; } catch { imdbId = ''; }
      if (!/^tt\d+$/.test(imdbId)) return null;
      let availability = { link: '', providers: [], subscriptionProviders: [] };
      if (requestedProviders.length) {
        let br = { link: '', flatrate: [] };
        try { br = brazilFlatrate(await request(`/${tmdbType}/${item.id}/watch/providers`, requestedLocale)); } catch { return null; }
        const flatrateIds = new Set((br.flatrate || []).map((provider) => provider.provider_id));
        const matching = requestedProviders.filter((provider) => flatrateIds.has(provider.tmdbProviderId));
        if (!matching.length) return null;
        const names = matching.map((provider) => provider.canonicalName);
        availability = { link: br.link || '', providers: names, subscriptionProviders: names };
      }
      return {
        id: `tmdb:${item.id}`, imdbId, type: titleType, name: item.title || item.name || 'Untitled',
        year: yearFromDate(item.release_date || item.first_air_date), poster: imageUrl(item.poster_path, 'w500'),
        background: imageUrl(item.backdrop_path, 'w1280'), description: item.overview || '',
        imdbRating: item.vote_average ? String(item.vote_average) : '',
        genres: (item.genre_ids || []).map((genreId) => creditGenreName(tmdbType, genreId)).filter(Boolean),
        director: [], writer: [], cast: [], source: 'tmdb-person', availabilityBR: availability,
      };
    };
    const pageStart = stand * 40;
    const pageEnd = pageStart + 40;
    const window = ordered.slice(0, pageEnd + 1);
    const hydrated = (await mapWithConcurrency(window, hydrate, 4)).filter(Boolean);
    const titles = hydrated.slice(pageStart, pageEnd);
    const hasNextStand = hydrated.length > pageEnd || ordered.length > window.length;
    return {
      person: { id: String(person), name: profile.name, department, job, total, profile: profile.profile },
      titles, hasNextStand, year, ignoreStoreYear, providers, stand,
    };
  }

  return {
    enabled: Boolean(apiKey),
    discoverProviderShelf,
    discoverYearHits,
    personProfile,
    personCreditStand,
    async enrich(title, locale = 'pt-BR') {
      if (!apiKey) return title;
      const requestedLocale = normalizeLocale(locale);
      const type = title.type === 'series' ? 'tv' : 'movie';
      const tmdbMatch = String(title.id || '').match(/^tmdb:(\d+)$/);
      const imdbId = /^tt\d+$/.test(String(title.imdbId || ''))
        ? String(title.imdbId)
        : /^tt\d+$/.test(String(title.id || '')) ? String(title.id) : '';
      let tmdbId = tmdbMatch?.[1] || '';
      if (!tmdbId && imdbId) {
        const matches = await request(`/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`, requestedLocale);
        const match = type === 'movie' ? matches.movie_results?.[0] : matches.tv_results?.[0];
        tmdbId = match?.id ? String(match.id) : '';
      }
      if (!tmdbId) return title;

      const append = type === 'movie'
        ? 'credits,images,release_dates,watch/providers'
        : 'credits,images,content_ratings,watch/providers';
      const details = await request(`/${type}/${tmdbId}?append_to_response=${append}`, requestedLocale);
      const credits = details.credits || {};
      const directors = crewNames(credits.crew, ['Director']);
      const writers = crewNames(credits.crew, ['Writer', 'Screenplay', 'Story', 'Teleplay', 'Characters', 'Creator']);
      const cast = uniqueNames((credits.cast || []).map((person) => person.name)).slice(0, 12);
      const preferredLogoLanguage = requestedLocale === 'pt-BR' ? 'pt' : 'en';
      const logo = (details.images?.logos || []).find((image) => image.iso_639_1 === preferredLogoLanguage)
        || (details.images?.logos || []).find((image) => image.iso_639_1 === 'en' || image.iso_639_1 === 'pt')
        || details.images?.logos?.[0];
      const runtime = title.type === 'movie' && Number.isSafeInteger(Number(details.runtime)) && Number(details.runtime) > 0
        ? Number(details.runtime) : null;

      return {
        ...title,
        id: `tmdb:${tmdbId}`,
        ...(imdbId ? { imdbId } : {}),
        displayTitle: details.title || details.name || title.name || '',
        displayDescription: details.overview || title.description || '',
        tagline: details.tagline || '',
        background: imageUrl(details.backdrop_path, 'w1280') || title.background,
        logo: imageUrl(logo?.file_path, 'w500'),
        ...(runtime ? { runtime } : {}),
        certificationBR: brazilCertification(title.type, details),
        availabilityBR: brazilAvailability(details),
        director: uniqueNames([...directors, ...(title.director || [])]),
        writer: uniqueNames([...writers, ...(title.writer || [])]),
        cast: uniqueNames([...cast, ...(title.cast || [])]).slice(0, 12),
      };
    },
  };
}

module.exports = { createTmdbClient, CREDIT_DEPARTMENTS };
