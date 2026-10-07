export const TV_ACCOUNT_STORAGE_KEY = 'locadora.tv.accounts.v1';
export const TV_ACCOUNT_SLOTS = Object.freeze([
  Object.freeze({ id: 'will', label: 'Will' }),
  Object.freeze({ id: 'diadorim', label: 'Diadorim' }),
]);

function normalizeSlot(value) {
  return TV_ACCOUNT_SLOTS.some((slot) => slot.id === value) ? value : '';
}

function normalizeAccount(value, slotId) {
  const slot = normalizeSlot(slotId);
  const token = String(value?.token || '').trim();
  const username = String(value?.username || '').trim().toLowerCase();
  if (!slot || token.length < 20 || !/^[a-z0-9_-]{3,24}$/.test(username)) return null;
  return { slot, username, token, pairedAt: String(value?.pairedAt || '') };
}

export function emptyTvAccountState() {
  return { version: 1, activeSlot: '', accounts: { will: null, diadorim: null } };
}

export function normalizeTvAccountState(value) {
  const state = emptyTvAccountState();
  if (!value || typeof value !== 'object') return state;
  for (const slot of TV_ACCOUNT_SLOTS) state.accounts[slot.id] = normalizeAccount(value.accounts?.[slot.id], slot.id);
  state.activeSlot = normalizeSlot(value.activeSlot);
  if (state.activeSlot && !state.accounts[state.activeSlot]) state.activeSlot = '';
  return state;
}

export function loadTvAccountState(storage) {
  try { return normalizeTvAccountState(JSON.parse(storage.getItem(TV_ACCOUNT_STORAGE_KEY) || 'null')); }
  catch { return emptyTvAccountState(); }
}

export function saveTvAccountState(storage, value) {
  const state = normalizeTvAccountState(value);
  storage.setItem(TV_ACCOUNT_STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function setTvAccount(state, slotId, account) {
  const next = normalizeTvAccountState(state);
  const slot = normalizeSlot(slotId);
  if (!slot) return next;
  next.accounts[slot] = normalizeAccount({ ...account, slot }, slot);
  if (next.accounts[slot]) next.activeSlot = slot;
  return next;
}

export function forgetTvAccount(state, slotId) {
  const next = normalizeTvAccountState(state);
  const slot = normalizeSlot(slotId);
  if (!slot) return next;
  next.accounts[slot] = null;
  if (next.activeSlot === slot) next.activeSlot = '';
  return next;
}

export function accountRentalStorage(storage, slotId) {
  const slot = normalizeSlot(slotId) || 'anonymous';
  const key = `locadora.tv.guestRental.${slot}.v1`;
  return {
    getItem() { return storage.getItem(key); },
    setItem(_name, value) { storage.setItem(key, value); },
  };
}

function errorFromResponse(response, body) {
  const error = new Error(body?.error || body?.message || `Request failed (${response.status})`);
  error.status = response.status;
  error.code = body?.code || '';
  return error;
}

export function createTvAccountClient({ apiBase, fetchImpl = globalThis.fetch } = {}) {
  const base = String(apiBase || '').replace(/\/+$/, '');
  if (!base || typeof fetchImpl !== 'function') throw new Error('TV account client is not configured');

  async function request(path, { token = '', ...options } = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);
    const response = await fetchImpl(`${base}${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw errorFromResponse(response, body);
    return body;
  }

  return Object.freeze({
    request,
    startPairing: () => request('/v1/tv/pairing/start', { method: 'POST', body: '{}' }),
    pollPairing: (code) => request(`/v1/tv/pairing/status?code=${encodeURIComponent(code)}`),
    state: (token) => request('/v1/tv/state', { token }),
    rent: (token, titles) => request('/v1/tv/rentals', { token, method: 'POST', body: JSON.stringify({ titles }) }),
    returnItem: (token, itemId, watchedStatus) => request(`/v1/tv/rental-items/${encodeURIComponent(itemId)}/return`, {
      token, method: 'POST', body: JSON.stringify({ watchedStatus }),
    }),
    revoke: (token) => request('/v1/tv/device', { token, method: 'DELETE', body: '{}' }),
  });
}

