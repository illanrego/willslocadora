export const TV_RENTAL_STORAGE_KEY = 'locadora.tv.guestRental.v1';
export const MAX_BASKET_TITLES = 15;
export const MAX_RENTAL_TITLES = 3;

function titleKey(title) {
  if (!title || !['movie', 'series'].includes(title.type)) return '';
  const id = String(title.id || '').trim();
  return id ? `${title.type}:${id}` : '';
}

function titleSnapshot(title) {
  const key = titleKey(title);
  if (!key) return null;
  const imdbId = /^tt\d+$/.test(String(title.imdbId || '')) ? String(title.imdbId) : '';
  return {
    id: String(title.id),
    type: title.type,
    name: String(title.displayTitle || title.name || 'Sem título'),
    year: Number.isInteger(Number(title.year)) ? Number(title.year) : null,
    poster: typeof title.poster === 'string' ? title.poster : '',
    ...(imdbId ? { imdbId } : {}),
    ...(title.rentalItemId ? { rentalItemId: String(title.rentalItemId) } : {}),
  };
}

function uniqueTitles(values, maximum = MAX_BASKET_TITLES) {
  const seen = new Set();
  const titles = [];
  for (const value of Array.isArray(values) ? values : []) {
    const title = titleSnapshot(value);
    const key = titleKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
    if (titles.length >= maximum) break;
  }
  return titles;
}

export function emptyGuestRentalState() {
  return { version: 1, basket: [], activeRental: null, returned: [], lastView: null };
}

export function normalizeGuestRentalState(value) {
  const state = emptyGuestRentalState();
  if (!value || typeof value !== 'object') return state;
  state.basket = uniqueTitles(value.basket);
  if (value.activeRental && Array.isArray(value.activeRental.titles)) {
    const titles = uniqueTitles(value.activeRental.titles, MAX_RENTAL_TITLES).map((title) => ({
      ...title,
      rentedAt: String(value.activeRental.openedAt || title.rentedAt || new Date(0).toISOString()),
    }));
    if (titles.length) state.activeRental = {
      id: String(value.activeRental.id || 'local-rental'),
      openedAt: String(value.activeRental.openedAt || new Date(0).toISOString()),
      titles,
    };
  }
  state.returned = (Array.isArray(value.returned) ? value.returned : []).slice(-100).map((item) => {
    const title = titleSnapshot(item);
    if (!title) return null;
    return {
      ...title,
      watchedStatus: ['watched', 'not_watched'].includes(item.watchedStatus) ? item.watchedStatus : 'unknown',
      rentedAt: String(item.rentedAt || ''),
      returnedAt: String(item.returnedAt || ''),
    };
  }).filter(Boolean);
  if (value.lastView && typeof value.lastView === 'object') {
    state.lastView = {
      stand: Math.max(0, Number(value.lastView.stand) || 0),
      titleKey: String(value.lastView.titleKey || ''),
      mode: value.lastView.mode === 'flat' ? 'flat' : 'immersive',
      inspectionOpen: Boolean(value.lastView.inspectionOpen),
    };
  }
  return state;
}

export function loadGuestRentalState(storage) {
  try { return normalizeGuestRentalState(JSON.parse(storage.getItem(TV_RENTAL_STORAGE_KEY) || 'null')); }
  catch { return emptyGuestRentalState(); }
}

export function saveGuestRentalState(storage, state) {
  const normalized = normalizeGuestRentalState(state);
  storage.setItem(TV_RENTAL_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function toggleGuestBasket(state, title) {
  const next = normalizeGuestRentalState(state);
  const snapshot = titleSnapshot(title);
  const key = titleKey(snapshot);
  if (!snapshot) return { state: next, changed: false, reason: 'invalid_title' };
  const index = next.basket.findIndex((item) => titleKey(item) === key);
  if (index >= 0) {
    next.basket.splice(index, 1);
    return { state: next, changed: true, added: false };
  }
  if (next.activeRental) return { state: next, changed: false, reason: 'active_rental' };
  if (next.basket.length >= MAX_BASKET_TITLES) return { state: next, changed: false, reason: 'basket_full' };
  next.basket.push(snapshot);
  return { state: next, changed: true, added: true };
}

export function rentGuestTitles(state, keys, now = new Date()) {
  const next = normalizeGuestRentalState(state);
  if (next.activeRental) return { state: next, changed: false, reason: 'active_rental' };
  const wanted = new Set(Array.isArray(keys) ? keys.map(String) : []);
  const titles = next.basket.filter((title) => wanted.has(titleKey(title))).slice(0, MAX_RENTAL_TITLES);
  if (!titles.length) return { state: next, changed: false, reason: 'empty_selection' };
  const openedAt = now.toISOString();
  next.activeRental = {
    id: `local-${now.getTime()}`,
    openedAt,
    titles: titles.map((title) => ({ ...title, rentedAt: openedAt })),
  };
  const rented = new Set(titles.map(titleKey));
  next.basket = next.basket.filter((title) => !rented.has(titleKey(title)));
  return { state: next, changed: true };
}

export function returnGuestTitles(state, returns, now = new Date()) {
  const next = normalizeGuestRentalState(state);
  if (!next.activeRental) return { state: next, changed: false, reason: 'no_active_rental' };
  const choices = new Map((Array.isArray(returns) ? returns : []).map((item) => [String(item.key), item.watchedStatus]));
  if (!choices.size) return { state: next, changed: false, reason: 'empty_selection' };
  const remaining = [];
  const returnedAt = now.toISOString();
  for (const title of next.activeRental.titles) {
    const key = titleKey(title);
    if (!choices.has(key)) { remaining.push(title); continue; }
    const watchedStatus = choices.get(key);
    next.returned.push({
      ...title,
      watchedStatus: ['watched', 'not_watched'].includes(watchedStatus) ? watchedStatus : 'unknown',
      returnedAt,
    });
  }
  if (remaining.length === next.activeRental.titles.length) return { state: next, changed: false, reason: 'unknown_title' };
  next.activeRental = remaining.length ? { ...next.activeRental, titles: remaining } : null;
  next.returned = next.returned.slice(-100);
  return { state: next, changed: true };
}

export function guestTitleKey(title) { return titleKey(title); }
