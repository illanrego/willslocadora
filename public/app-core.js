(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LocadoraCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function parseReleaseYear(value) {
    const match = String(value == null ? '' : value).match(/(?:18|19|20)\d{2}/);
    return match ? Number(match[0]) : null;
  }

  function normalizeStringList(value) {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean);
    return [];
  }

  function normalizeTitle(meta, source) {
    return {
      id: String(meta.id || ''),
      type: meta.type === 'series' ? 'series' : 'movie',
      name: String(meta.name || 'Untitled'),
      year: parseReleaseYear(meta.releaseInfo || meta.released || meta.year),
      genres: Array.isArray(meta.genres) ? meta.genres.filter(Boolean).map(String) : [],
      poster: typeof meta.poster === 'string' ? meta.poster : '',
      background: typeof meta.background === 'string' ? meta.background : '',
      description: typeof meta.description === 'string' ? meta.description : '',
      imdbRating: meta.imdbRating == null ? '' : String(meta.imdbRating),
      director: normalizeStringList(meta.director),
      writer: normalizeStringList(meta.writer),
      cast: normalizeStringList(meta.cast),
      source: String(source || ''),
    };
  }

  function filterByStore(titles, options) {
    const genre = String(options.genre || '').toLowerCase();
    const year = Number(options.year);
    return titles.filter((title) => {
      if (!Number.isInteger(title.year) || title.year > year || title.year < year - 4) return false;
      return !genre || title.genres.some((item) => item.toLowerCase() === genre);
    });
  }

  function richness(item) {
    return (item.description || '').length + (item.poster ? 100 : 0) + ((item.genres || []).length * 20) +
      ((item.director || []).length + (item.writer || []).length + (item.cast || []).length) * 10 + (item.imdbRating ? 20 : 0);
  }

  function deduplicateTitles(titles) {
    const unique = new Map();
    for (const title of titles) {
      const key = `${title.type}:${title.id}`;
      const current = unique.get(key);
      if (!current || richness(title) > richness(current)) unique.set(key, title);
    }
    return Array.from(unique.values());
  }

  function createStremioUri(title) {
    const validType = title && (title.type === 'movie' || title.type === 'series');
    const validId = title && /^[a-zA-Z0-9:_-]+$/.test(String(title.id || ''));
    if (!validType || !validId) throw new Error('Invalid title for Stremio handoff');
    return `stremio:///detail/${title.type}/${title.id}`;
  }

  return { createStremioUri, deduplicateTitles, filterByStore, normalizeTitle, parseReleaseYear };
}));
