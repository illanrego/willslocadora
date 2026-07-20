'use strict';

const TMDB_API_ROOT = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_ROOT = 'https://image.tmdb.org/t/p';
const SUPPORTED_LOCALES = new Set(['pt-BR', 'en-US']);
const TMDB_GENRES = Object.freeze({
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18,
  Family: 10751, Fantasy: 14, Horror: 27, Mystery: 9648, Romance: 10749, 'Sci-Fi': 878, Thriller: 53,
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

  async function discoverProviderShelf({ year, genres, type, providerName, page = 0, locale = 'pt-BR' }) {
    if (!apiKey) return [];
    const requestedLocale = normalizeLocale(locale);
    const tmdbType = type === 'series' ? 'tv' : 'movie';
    const provider = await providerId(tmdbType, providerName, requestedLocale);
    if (!provider) return [];
    const genreIds = [...new Set((genres || []).map((genre) => TMDB_GENRES[genre]).filter(Boolean))];
    const startYear = Number(year) - 19;
    const dateKey = tmdbType === 'movie' ? 'primary_release_date' : 'first_air_date';
    const fetchPage = (number) => {
      const query = new URLSearchParams({
        watch_region: 'BR',
        with_watch_monetization_types: 'flatrate',
        with_watch_providers: String(provider),
        page: String(number),
        [`${dateKey}.gte`]: `${startYear}-01-01`,
        [`${dateKey}.lte`]: `${year}-12-31`,
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
    return discovered.flatMap((title, index) => {
      const id = imdbIds[index];
      if (!/^tt\d+$/.test(id)) return [];
      return [{
        id,
        type,
        name: title.title || title.name || 'Untitled',
        year: yearFromDate(title.release_date || title.first_air_date),
        genres: (title.genre_ids || []).map((genreId) => Object.keys(TMDB_GENRES).find((name) => TMDB_GENRES[name] === genreId)).filter(Boolean),
        poster: imageUrl(title.poster_path, 'w500'),
        background: imageUrl(title.backdrop_path, 'w1280'),
        description: title.overview || '',
        imdbRating: title.vote_average ? String(title.vote_average) : '',
        director: [], writer: [], cast: [], source: 'tmdb-discover',
        availabilityBR: { link: '', providers: [providerName], subscriptionProviders: [providerName] },
      }];
    });
  }

  return {
    enabled: Boolean(apiKey),
    discoverProviderShelf,
    async enrich(title, locale = 'pt-BR') {
      if (!apiKey || !/^tt\d+$/.test(title.id || '')) return title;
      const requestedLocale = normalizeLocale(locale);
      const type = title.type === 'series' ? 'tv' : 'movie';
      const matches = await request(`/find/${encodeURIComponent(title.id)}?external_source=imdb_id`, requestedLocale);
      const match = type === 'movie' ? matches.movie_results?.[0] : matches.tv_results?.[0];
      if (!match?.id) return title;

      const append = type === 'movie'
        ? 'credits,images,release_dates,watch/providers'
        : 'credits,images,content_ratings,watch/providers';
      const details = await request(`/${type}/${match.id}?append_to_response=${append}`, requestedLocale);
      const credits = details.credits || {};
      const directors = crewNames(credits.crew, ['Director']);
      const writers = crewNames(credits.crew, ['Writer', 'Screenplay', 'Story', 'Teleplay', 'Characters', 'Creator']);
      const cast = uniqueNames((credits.cast || []).map((person) => person.name)).slice(0, 12);
      const preferredLogoLanguage = requestedLocale === 'pt-BR' ? 'pt' : 'en';
      const logo = (details.images?.logos || []).find((image) => image.iso_639_1 === preferredLogoLanguage)
        || (details.images?.logos || []).find((image) => image.iso_639_1 === 'en' || image.iso_639_1 === 'pt')
        || details.images?.logos?.[0];

      return {
        ...title,
        displayTitle: details.title || details.name || title.name || '',
        displayDescription: details.overview || title.description || '',
        tagline: details.tagline || '',
        background: imageUrl(details.backdrop_path, 'w1280') || title.background,
        logo: imageUrl(logo?.file_path, 'w500'),
        certificationBR: brazilCertification(title.type, details),
        availabilityBR: brazilAvailability(details),
        director: uniqueNames([...directors, ...(title.director || [])]),
        writer: uniqueNames([...writers, ...(title.writer || [])]),
        cast: uniqueNames([...cast, ...(title.cast || [])]).slice(0, 12),
      };
    },
  };
}

module.exports = { createTmdbClient };
