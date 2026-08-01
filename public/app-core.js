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
    const imdbId = /^tt\d+$/.test(String(meta.imdbId || '')) ? String(meta.imdbId) : '';
    return {
      id: String(meta.id || ''),
      ...(imdbId ? { imdbId } : {}),
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

  function createImdbUrl(title) {
    const id = String(title?.imdbId || title?.id || '');
    if (/^tt\d+$/.test(id)) return `https://www.imdb.com/title/${id}/`;
    return `https://www.imdb.com/find/?q=${encodeURIComponent(String(title?.name || ''))}`;
  }

  function createLetterboxdUrl(title) {
    const imdbId = String(title?.imdbId || '');
    if (/^tt\d+$/.test(imdbId)) return `https://letterboxd.com/imdb/${imdbId}/`;
    const id = String(title?.id || '');
    if (/^tt\d+$/.test(id)) return `https://letterboxd.com/imdb/${id}/`;
    const tmdbMatch = id.match(/^tmdb:(\d+)$/);
    if (tmdbMatch) return `https://letterboxd.com/tmdb/${tmdbMatch[1]}/`;
    return `https://letterboxd.com/search/${encodeURIComponent(String(title?.name || ''))}/`;
  }

  function createStremioUri(title) {
    const validType = title && (title.type === 'movie' || title.type === 'series');
    const id = String(title?.imdbId || title?.id || '');
    if (!validType || !/^tt\d+$/.test(id)) throw new Error('Invalid title for Stremio handoff');
    return `stremio:///detail/${title.type}/${id}`;
  }

  function rentalTitleKey(title) {
    if (!title || (title.type !== 'movie' && title.type !== 'series') || !String(title.id || '').trim()) return '';
    return `${title.type}:${title.id}`;
  }

  function normalizeRentalTitle(value) {
    if (!value || typeof value !== 'object' || !rentalTitleKey(value)) return null;
    const imdbId = /^tt\d+$/.test(String(value.imdbId || '')) ? String(value.imdbId) : '';
    return {
      id: String(value.id),
      ...(imdbId ? { imdbId } : {}),
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

  const MAX_CESTA_TITLES = 15;
  const MAX_RENTAL_TITLES = 3;

  function updateRentalBasket(value, title, activeRental = null) {
    const titles = normalizeRentalTitles(value).slice(0, MAX_CESTA_TITLES);
    if (activeRental?.titles?.length) return { titles, changed: false, reason: 'active_rental' };
    const normalized = normalizeRentalTitle(title);
    const key = rentalTitleKey(normalized);
    if (!key) return { titles, changed: false, reason: 'invalid_title' };
    const existing = titles.findIndex((item) => rentalTitleKey(item) === key);
    if (existing >= 0) return { titles: titles.filter((_, index) => index !== existing), changed: true, reason: 'removed' };
    if (titles.length >= MAX_CESTA_TITLES) return { titles, changed: false, reason: 'full' };
    return { titles: [...titles, normalized], changed: true, reason: 'added' };
  }

  function normalizeRentalState(value) {
    let source = value;
    if (typeof value === 'string') {
      try { source = JSON.parse(value); } catch { source = {}; }
    }
    source = source && typeof source === 'object' ? source : {};
    const counter = normalizeRentalTitles(source.counter).slice(0, MAX_CESTA_TITLES);
    const rentedTitles = normalizeRentalTitles(source.rented && source.rented.titles).slice(0, MAX_RENTAL_TITLES);
    const returned = (Array.isArray(source.returned) ? source.returned : []).map((entry) => {
      const title = normalizeRentalTitle(entry && entry.title);
      const watchedStatus = ['watched', 'not_watched', 'unknown'].includes(entry && entry.watchedStatus) ? entry.watchedStatus : 'unknown';
      return title ? { title, watchedStatus } : null;
    }).filter(Boolean);
    return {
      counter,
      rented: rentedTitles.length ? { titles: rentedTitles } : null,
      returned,
    };
  }

  function serializeRentalTitle(title) {
    const match = String(title?.id || '').match(/^tmdb:(\d+)$/);
    if (!match || !['movie', 'series'].includes(title?.type)) return null;
    return { tmdbId: Number(match[1]), type: title.type, name: String(title.name || 'Untitled'), year: parseReleaseYear(title.year) || null };
  }

  function validateRentalResponse(value, requestedTitles) {
    const requested = Array.isArray(requestedTitles) ? requestedTitles : [];
    const rental = value?.rental;
    const items = rental?.items;
    const itemKey = (title) => `${title?.type || title?.title_type || title?.media_type}:${title?.tmdbId ?? title?.tmdb_id}`;
    const requestedKeys = new Set(requested.map(itemKey));
    const itemKeys = Array.isArray(items) ? items.map(itemKey) : [];
    const valid = String(rental?.id || '').length > 0
      && requested.length >= 1 && requested.length <= 3
      && Array.isArray(items) && items.length === requested.length
      && items.every((title) => {
        const tmdbId = Number(title?.tmdbId ?? title?.tmdb_id);
        return String(title?.id || '').length > 0 && Number.isInteger(tmdbId) && tmdbId > 0 && ['movie', 'series'].includes(title?.type || title?.title_type || title?.media_type);
      })
      && itemKeys.length === new Set(itemKeys).size
      && itemKeys.every((key) => requestedKeys.has(key));
    if (!valid) throw new Error('Invalid rental response from the member service');
    return value;
  }

  function prepareCounterSelection(value) {
    return normalizeRentalTitles(value).slice();
  }

  function removeCounterSelection(value, title) {
    const key = rentalTitleKey(title);
    return prepareCounterSelection(value).filter((item) => rentalTitleKey(item) !== key);
  }

  function rentCounterTitles(value) {
    const state = normalizeRentalState(value);
    if (!state.counter.length || state.counter.length > MAX_RENTAL_TITLES || state.rented) return state;
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

  async function submitRentalReturns(value, request) {
    const validStatuses = new Set(['watched', 'not_watched', 'unknown']);
    const entries = (Array.isArray(value) ? value : []).filter((entry) => String(entry?.itemId || '').trim() && validStatuses.has(entry?.watchedStatus));
    const result = { succeeded: [], failed: [] };
    for (const entry of entries) {
      try {
        await request(String(entry.itemId), entry.watchedStatus);
        result.succeeded.push(String(entry.itemId));
      } catch (error) {
        result.failed.push({ itemId: String(entry.itemId), error });
      }
    }
    return result;
  }

  return { clampStoreYear, createImdbUrl, createLetterboxdUrl, createStremioUri, deduplicateTitles, filterByStore, normalizeTitle, parseReleaseYear, rentalTitleKey, normalizeRentalState, prepareCounterSelection, removeCounterSelection, rentCounterTitles, returnRentedTitle, serializeRentalTitle, submitRentalReturns, updateRentalBasket, validateRentalResponse };
}));
