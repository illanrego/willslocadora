'use strict';

const TMDB_API_ROOT = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_ROOT = 'https://image.tmdb.org/t/p';

function imageUrl(path, size) {
  return typeof path === 'string' && path.startsWith('/') ? `${TMDB_IMAGE_ROOT}/${size}${path}` : '';
}

function uniqueNames(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
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
  if (!offers) return { link: '', providers: [] };
  const groups = ['flatrate', 'free', 'ads', 'rent', 'buy'];
  return {
    link: typeof offers.link === 'string' ? offers.link : '',
    providers: uniqueNames(groups.flatMap((group) => (offers[group] || []).map((provider) => provider.provider_name))),
  };
}

function createTmdbClient({ apiKey = '', fetchImpl = fetch } = {}) {
  async function request(path) {
    const url = new URL(`${TMDB_API_ROOT}${path}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('language', 'pt-BR');
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`TMDB request failed (${response.status})`);
    return response.json();
  }

  return {
    enabled: Boolean(apiKey),
    async enrich(title) {
      if (!apiKey || !/^tt\d+$/.test(title.id || '')) return title;
      const type = title.type === 'series' ? 'tv' : 'movie';
      const matches = await request(`/find/${encodeURIComponent(title.id)}?external_source=imdb_id`);
      const match = type === 'movie' ? matches.movie_results?.[0] : matches.tv_results?.[0];
      if (!match?.id) return title;

      const append = type === 'movie'
        ? 'credits,images,release_dates,watch/providers'
        : 'credits,images,content_ratings,watch/providers';
      const details = await request(`/${type}/${match.id}?append_to_response=${append}`);
      const credits = details.credits || {};
      const directors = crewNames(credits.crew, ['Director']);
      const writers = crewNames(credits.crew, ['Writer', 'Screenplay', 'Story', 'Teleplay', 'Characters', 'Creator']);
      const cast = uniqueNames((credits.cast || []).map((person) => person.name)).slice(0, 12);
      const logo = (details.images?.logos || []).find((image) => image.iso_639_1 === 'pt' || image.iso_639_1 === 'en') || details.images?.logos?.[0];

      return {
        ...title,
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
