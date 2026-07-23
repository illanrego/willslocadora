(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LocadoraCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clampStoreYear(value) {
    const year = Number(value);
    return Math.max(1920, Math.min(2026, Number.isFinite(year) ? Math.round(year) : 1999));
  }

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
    const genres = (Array.isArray(options.genres) ? options.genres : [options.genre])
      .filter(Boolean).map((genre) => String(genre).toLowerCase());
    const year = Number(options.year);
    const yearWindow = Number.isInteger(options.yearWindow) && options.yearWindow > 0 ? options.yearWindow : 5;
    return titles.filter((title) => {
      if (!Number.isInteger(title.year) || title.year > year || title.year < year - (yearWindow - 1)) return false;
      return !genres.length || title.genres.some((item) => genres.includes(item.toLowerCase()));
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

  function createLetterboxdUrl(title) {
    const id = String(title?.id || '');
    if (/^tt\d+$/.test(id)) return `https://letterboxd.com/imdb/${id}/`;
    const tmdbMatch = id.match(/^tmdb:(\d+)$/);
    if (tmdbMatch) return `https://letterboxd.com/tmdb/${tmdbMatch[1]}/`;
    return `https://letterboxd.com/search/${encodeURIComponent(String(title?.name || ''))}/`;
  }

  function createStremioUri(title) {
    const validType = title && (title.type === 'movie' || title.type === 'series');
    const validId = title && /^[a-zA-Z0-9:_-]+$/.test(String(title.id || ''));
    if (!validType || !validId) throw new Error('Invalid title for Stremio handoff');
    return `stremio:///detail/${title.type}/${title.id}`;
  }

  function rentalTitleKey(title) {
    if (!title || (title.type !== 'movie' && title.type !== 'series') || !String(title.id || '').trim()) return '';
    return `${title.type}:${title.id}`;
  }

  function normalizeRentalTitle(value) {
    if (!value || typeof value !== 'object' || !rentalTitleKey(value)) return null;
    return {
      id: String(value.id),
      type: value.type,
      name: String(value.name || 'Untitled'),
      year: parseReleaseYear(value.year) || null,
      poster: typeof value.poster === 'string' ? value.poster : '',
      background: typeof value.background === 'string' ? value.background : '',
      description: typeof value.description === 'string' ? value.description : '',
    };
  }

  function normalizeRentalTitles(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).map(normalizeRentalTitle).filter((title) => {
      const key = rentalTitleKey(title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeRentalState(value) {
    let source = value;
    if (typeof value === 'string') {
      try { source = JSON.parse(value); } catch { source = {}; }
    }
    source = source && typeof source === 'object' ? source : {};
    const counter = normalizeRentalTitles(source.counter);
    const rentedTitles = normalizeRentalTitles(source.rented && source.rented.titles);
    const rentedKeys = new Set(rentedTitles.map(rentalTitleKey));
    const returned = (Array.isArray(source.returned) ? source.returned : []).map((entry) => {
      const title = normalizeRentalTitle(entry && entry.title);
      const watchedStatus = ['watched', 'not_watched', 'unknown'].includes(entry && entry.watchedStatus) ? entry.watchedStatus : 'unknown';
      return title ? { title, watchedStatus } : null;
    }).filter(Boolean);
    return {
      counter: rentedTitles.length ? [] : counter.filter((title) => !rentedKeys.has(rentalTitleKey(title))),
      rented: rentedTitles.length ? { titles: rentedTitles } : null,
      returned,
    };
  }

  function rentCounterTitles(value) {
    const state = normalizeRentalState(value);
    if (!state.counter.length || state.rented) return state;
    return { ...state, counter: [], rented: { titles: state.counter } };
  }

  function returnRentedTitle(value, key, watchedStatus) {
    const state = normalizeRentalState(value);
    if (!state.rented || !['watched', 'not_watched', 'unknown'].includes(watchedStatus)) return state;
    const title = state.rented.titles.find((item) => rentalTitleKey(item) === key);
    if (!title) return state;
    const remaining = state.rented.titles.filter((item) => rentalTitleKey(item) !== key);
    return {
      ...state,
      rented: remaining.length ? { titles: remaining } : null,
      returned: [...state.returned, { title, watchedStatus }],
    };
  }

  return { clampStoreYear, createLetterboxdUrl, createStremioUri, deduplicateTitles, filterByStore, normalizeTitle, parseReleaseYear, rentalTitleKey, normalizeRentalState, rentCounterTitles, returnRentedTitle };
}));
