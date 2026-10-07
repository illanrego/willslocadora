import './polyfills.js';
import { createImmersiveShelf } from '../../../public/immersive-shelf.mjs';
import { createVhsViewer } from '../../../public/vhs-3d.mjs';
import { createFlatVhsViewer } from '../../../public/vhs-flat.mjs';
import {
  emptyGuestRentalState,
  guestTitleKey,
  loadGuestRentalState,
  MAX_RENTAL_TITLES,
  saveGuestRentalState,
  toggleGuestBasket,
} from './guest-rental.mjs';
import { createSamsungRuntime } from './samsung-runtime.mjs';
import {
  accountRentalStorage,
  createTvAccountClient,
  forgetTvAccount,
  loadTvAccountState,
  saveTvAccountState,
  setTvAccount,
  TV_ACCOUNT_SLOTS,
} from './tv-account.mjs';

const API_BASE = 'https://locadora-api.willstartpage.workers.dev/v1';
const DATA_API_BASE = 'https://locadora-data.willstartpage.workers.dev';
const PLACEHOLDER = './images/wills-locadora-cover-placeholder.svg';
const PROVIDERS = Object.freeze([
  ['netflix', 'Netflix'],
  ['prime-video', 'Prime Video'],
  ['max', 'Max'],
  ['disney-plus', 'Disney+'],
  ['globoplay', 'Globoplay'],
  ['paramount-plus', 'Paramount+'],
  ['apple-tv-plus', 'Apple TV+'],
  ['mubi', 'MUBI'],
  ['crunchyroll', 'Crunchyroll'],
]);
const PROVIDER_IDS = Object.freeze({
  8: 'netflix', 1796: 'netflix', 119: 'prime-video', 1899: 'max', 337: 'disney-plus',
  307: 'globoplay', 531: 'paramount-plus', 350: 'apple-tv-plus', 11: 'mubi', 283: 'crunchyroll',
});
const GENRES = Object.freeze([
  { labelKey: 'genreAction', theme: 'Action & Adventure', genres: ['Action', 'Adventure'] },
  { labelKey: 'genreComedy', theme: 'Comedy', genres: ['Comedy'] },
  { labelKey: 'genreHorror', theme: 'Horror', genres: ['Horror'] },
  { labelKey: 'genreSciFi', theme: 'Sci-Fi & Fantasy', genres: ['Sci-Fi', 'Fantasy'] },
  { labelKey: 'genreDrama', theme: 'Drama', genres: ['Drama'] },
  { labelKey: 'genreCrime', theme: 'Crime & Thriller', genres: ['Crime', 'Thriller', 'Mystery'] },
  { labelKey: 'genreRomance', theme: 'Romance', genres: ['Romance'] },
  { labelKey: 'genreFamily', theme: 'Family & Animation', genres: ['Family', 'Animation'] },
  { labelKey: 'genreDocumentary', theme: 'Documentary', genres: ['Documentary'] },
]);

const UI = Object.freeze({
  'pt-BR': {
    previous: '‹ Estante', next: 'Estante ›', filters: 'Filtros', search: 'Pesquisar', basket: 'Cesta', counter: 'Balcão',
    mode2d: 'Modo 2D', mode3d: 'Modo 3D', soundOff: 'Som desligado', soundOn: 'Som ligado', opening: 'Abrindo as caixas…',
    found: 'fitas encontradas', menu: 'Menu da Locadora. Pressione para escolher uma ação.', added: 'Fita adicionada à Cesta.', removed: 'Fita retirada da Cesta.',
    basketFull: 'A Cesta comporta até 15 fitas.', activeRental: 'Devolva o pacote ativo antes de montar outro.', emptyBasket: 'Sua Cesta está vazia.',
    chooseThree: 'Escolha de uma a três fitas.', rented: 'Boa sessão! O pacote ficou guardado na sua conta.', returned: 'Devolução registrada na sua conta.',
    exact: 'Abrindo o título no serviço…', appHome: 'O título não foi aceito; abrindo a página inicial do serviço.', browser: 'Abrindo o link no navegador da TV.', unavailable: 'Este destino não pôde ser aberto nesta TV.',
    noLinks: 'Nenhum link direto de assinatura foi encontrado. O Stremio continua disponível quando houver IMDb ID.',
    loadError: 'Não foi possível abrir esta estante. Verifique a rede e tente novamente.', lowFidelity: 'A cena foi ajustada para manter a navegação fluida nesta TV.',
    titleRotate: 'Girar fita', front: 'Capa', back: 'Contracapa', toBasket: 'Botar na Cesta', fromBasket: 'Tirar da Cesta', streamings: 'Ver streamings',
    appExit: 'Pressione Voltar novamente no menu para sair.', searchPrompt: 'Digite pelo menos duas letras.', noResults: 'Nenhuma fita encontrada.', searching: 'Procurando no depósito…',
  },
  'en-US': {
    previous: '‹ Shelf', next: 'Shelf ›', filters: 'Filters', search: 'Search', basket: 'Basket', counter: 'Counter',
    mode2d: '2D mode', mode3d: '3D mode', soundOff: 'Sound off', soundOn: 'Sound on', opening: 'Opening the boxes…',
    found: 'tapes found', menu: 'Store menu. Press OK to choose an action.', added: 'Tape added to the Basket.', removed: 'Tape removed from the Basket.',
    basketFull: 'The Basket holds up to 15 tapes.', activeRental: 'Return the active package before building another.', emptyBasket: 'Your Basket is empty.',
    chooseThree: 'Choose one to three tapes.', rented: 'Enjoy the show! This package is saved to your account.', returned: 'Return saved to your account.',
    exact: 'Opening this title in the service…', appHome: 'The title handoff was rejected; opening the service home.', browser: 'Opening the link in the TV browser.', unavailable: 'This destination could not be opened on this TV.',
    noLinks: 'No direct subscription link was found. Stremio remains available when an IMDb ID exists.',
    loadError: 'This shelf could not be opened. Check the network and try again.', lowFidelity: 'The scene was adjusted to keep navigation smooth on this TV.',
    titleRotate: 'Rotate tape', front: 'Front', back: 'Back', toBasket: 'Add to Basket', fromBasket: 'Remove from Basket', streamings: 'View streamings',
    appExit: 'Press Back again from the menu to exit.', searchPrompt: 'Type at least two letters.', noResults: 'No tapes found.', searching: 'Searching the back room…',
  },
});

const runtime = createSamsungRuntime(window);
window.LocadoraRuntime = runtime;
const $ = (selector) => document.querySelector(selector);
const { clampStoreYear, createImdbUrl, createLetterboxdUrl, createStremioUri, hydrateTitleMetadata } = window.LocadoraCore;
const { createTranslator, getCopy, normalizeLocale } = window.LocadoraI18n;
const { getGenreTheme } = window.LocadoraGenreThemes;

const state = {
  locale: normalizeLocale(localStorage.getItem('locadora.tv.locale') || 'pt-BR'),
  year: clampStoreYear(localStorage.getItem('locadora.tv.year') || 1999),
  genreIndex: Math.max(0, Math.min(GENRES.length - 1, Number(localStorage.getItem('locadora.tv.genre')) || 0)),
  providers: loadArray('locadora.tv.providers').filter((id) => PROVIDERS.some(([candidate]) => candidate === id)),
  ignoreStoreYear: localStorage.getItem('locadora.tv.ignoreStoreYear') === 'true',
  stand: 0,
  hasNextStand: false,
  titles: [],
  mode: localStorage.getItem('locadora.tv.mode') === 'immersive' ? 'immersive' : 'flat',
  lowFidelity: localStorage.getItem('locadora.tv.lowFidelity') === 'true',
  page: 0,
  providerRegistry: [],
  accounts: loadTvAccountState(localStorage),
  account: null,
  accountData: null,
  rental: loadGuestRentalState(localStorage),
};

let t = createTranslator(window.LocadoraI18n.COPY, state.locale);
let immersiveShelf = null;
let activeViewer = null;
let activeTitle = null;
let shelfRequest = null;
let toastTimer = 0;
let performanceMeasured = state.lowFidelity;
let titleLoadToken = 0;
let lastRootBack = 0;
let sceneRenderToken = 0;
const metadata = new Map();
const tvTextureUrls = new Map();
const tvAccountClient = createTvAccountClient({ apiBase: DATA_API_BASE });
let pairingTimer = 0;
let pairingGeneration = 0;

window.locadoraApiUrl = (path) => `${API_BASE}${String(path).replace(/^\/api/, '').replace(/^\/meta/, '/title').replace(/^\/poster/, '/image')}`;
window.locadoraPosterUrl = imageUrl;

function loadArray(key) {
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}

function accountSlot(slotId) { return TV_ACCOUNT_SLOTS.find((slot) => slot.id === slotId) || null; }
function activeTvAccount() { return state.accounts.accounts[state.accounts.activeSlot] || null; }

function accountTitleSnapshot(item) {
  const tmdbId = Number(item?.tmdbId);
  const type = item?.type === 'movie' || item?.type === 'series' ? item.type : '';
  if (!Number.isSafeInteger(tmdbId) || tmdbId < 1 || !type) return null;
  return {
    id: `tmdb:${tmdbId}`,
    type,
    name: String(item.name || 'Sem título'),
    year: Number.isInteger(Number(item.year)) ? Number(item.year) : null,
    poster: '',
    ...(item.id ? { rentalItemId: String(item.id) } : {}),
    ...(item.rentedAt ? { rentedAt: String(item.rentedAt) } : {}),
    ...(item.returnedAt ? { returnedAt: String(item.returnedAt) } : {}),
  };
}

function applyAccountData(data) {
  const previous = state.rental;
  const activeItems = Array.isArray(data?.activeRental?.items) ? data.activeRental.items.map(accountTitleSnapshot).filter(Boolean) : [];
  const history = Array.isArray(data?.history) ? data.history.map((item) => ({
    ...accountTitleSnapshot(item),
    watchedStatus: ['watched', 'not_watched'].includes(item.watchedStatus) ? item.watchedStatus : 'unknown',
  })).filter(Boolean) : [];
  state.rental = {
    ...emptyGuestRentalState(),
    basket: previous.basket,
    lastView: previous.lastView,
    activeRental: activeItems.length ? {
      id: String(data.activeRental.id || 'remote-rental'),
      openedAt: String(data.activeRental.openedAt || new Date(0).toISOString()),
      titles: activeItems,
    } : null,
    returned: history,
  };
}

function saveTvAccounts() {
  state.accounts = saveTvAccountState(localStorage, state.accounts);
}

function syncAccountControls() {
  const account = activeTvAccount();
  const button = $('#account-open');
  if (button) button.textContent = account ? `Usuário · ${account.username}` : 'Escolher usuário';
  const rentalLabel = state.rental.activeRental ? `${ui('counter')} · ${state.rental.activeRental.titles.length}` : ui('counter');
  $('#counter-open').textContent = rentalLabel;
}

function renderTvAccountOptions() {
  const host = $('#tv-account-options');
  host.replaceChildren();
  for (const slot of TV_ACCOUNT_SLOTS) {
    const account = state.accounts.accounts[slot.id];
    const option = document.createElement('button');
    option.type = 'button'; option.className = `tv-account-option${account ? ' paired' : ''}`;
    const name = document.createElement('strong'); name.textContent = slot.label;
    const detail = document.createElement('small'); detail.textContent = account ? `Conectado como ${account.username}` : 'Conectar uma vez';
    option.append(name, detail);
    option.addEventListener('click', () => account ? selectTvAccount(slot.id) : pairTvAccount(slot.id));
    host.append(option);
  }
}

function openTvAccountDialog(message = '') {
  renderTvAccountOptions();
  $('#tv-account-status').textContent = message;
  const dialog = $('#account-dialog');
  if (!dialog.open) dialog.showModal();
  $('#tv-account-options button')?.focus({ preventScroll: true });
}

async function pairTvAccount(slotId) {
  const slot = accountSlot(slotId);
  if (!slot) return;
  const generation = ++pairingGeneration;
  clearInterval(pairingTimer);
  $('#tv-pair-heading').textContent = `Conectar ${slot.label}`;
  $('#tv-pair-status').textContent = 'Gerando código…';
  const pairDialog = $('#tv-pair-dialog');
  closeDialog($('#account-dialog'));
  pairDialog.showModal();
  try {
    const pairing = await tvAccountClient.startPairing();
    if (generation !== pairingGeneration) return;
    $('#tv-pair-code').textContent = String(pairing.code || '------');
    $('#tv-pair-status').textContent = 'Aguardando autorização na Carteirinha…';
    pairingTimer = window.setInterval(async () => {
      try {
        const result = await tvAccountClient.pollPairing(pairing.code);
        if (generation !== pairingGeneration || result.status !== 'paired') return;
        clearInterval(pairingTimer); pairingTimer = 0;
        state.accounts = setTvAccount(state.accounts, slotId, { token: result.token, username: result.username, pairedAt: new Date().toISOString() });
        saveTvAccounts();
        closeDialog(pairDialog);
        await selectTvAccount(slotId);
      } catch (error) {
        if (error.status === 409 || error.code === 'PAIRING_EXPIRED') {
          clearInterval(pairingTimer); pairingTimer = 0;
          $('#tv-pair-status').textContent = error.code === 'PAIRING_EXPIRED' ? 'Esse código expirou. Tente novamente.' : 'Esse código já foi usado. Tente novamente.';
        }
      }
    }, 2000);
  } catch (error) {
    $('#tv-pair-status').textContent = error.message || 'Não foi possível gerar o código.';
  }
}

async function selectTvAccount(slotId) {
  const account = state.accounts.accounts[slotId];
  if (!account) return pairTvAccount(slotId);
  if (state.accounts.activeSlot && state.accounts.activeSlot !== slotId) saveRental();
  state.accounts.activeSlot = slotId;
  state.account = account;
  state.accountData = null;
  state.rental = loadGuestRentalState(accountRentalStorage(localStorage, slotId));
  saveTvAccounts();
  syncAccountControls();
  $('#tv-account-status').textContent = 'Abrindo sua Carteirinha…';
  try {
    await refreshActiveAccount(account);
    saveRental();
    closeDialog($('#account-dialog'));
    showToast(`Locadora aberta para ${account.username}.`);
  } catch (error) {
    if (error.status === 401) {
      state.accounts = forgetTvAccount(state.accounts, slotId);
      saveTvAccounts();
      renderTvAccountOptions();
    }
    state.account = null;
    state.accountData = null;
    $('#tv-account-status').textContent = error.status === 401 ? 'Essa autorização expirou. Conecte este usuário novamente.' : 'Não foi possível carregar essa Carteirinha.';
    syncAccountControls();
  }
}

async function refreshActiveAccount(account = state.account) {
  if (!account) return null;
  const data = await tvAccountClient.state(account.token);
  if (state.account !== account) return null;
  state.accountData = data;
  applyAccountData(data);
  return data;
}

function continueAnonymously() {
  if (state.accounts.activeSlot) saveRental();
  state.accounts.activeSlot = '';
  state.account = null;
  state.accountData = null;
  state.rental = loadGuestRentalState(localStorage);
  saveTvAccounts();
  syncAccountControls();
  closeDialog($('#account-dialog'));
}

function ui(key) { return UI[state.locale]?.[key] || UI['pt-BR'][key] || key; }
function genreLabel(genre = GENRES[state.genreIndex]) { return t(genre.labelKey); }
function activeGenre() { return GENRES[state.genreIndex]; }
function pageSize() { return state.mode === 'flat' ? 30 : state.lowFidelity ? 10 : 40; }
function pageCount() { return Math.max(1, Math.ceil(state.titles.length / pageSize())); }
function visibleTitles() { return state.titles.slice(state.page * pageSize(), (state.page + 1) * pageSize()); }

function imageUrl(source) {
  const value = String(source || '');
  if (!value) return PLACEHOLDER;
  if (value.startsWith('./') || value.startsWith('data:') || value.startsWith(API_BASE)) return value;
  return `${API_BASE}/image?${new URLSearchParams({ url: value })}`;
}

function textureUrl(source) {
  const remote = imageUrl(source);
  return tvTextureUrls.get(remote) || remote;
}

async function cacheTvTexture(source) {
  const remote = imageUrl(source);
  if (!remote || remote === PLACEHOLDER || remote.startsWith('./') || remote.startsWith('data:') || remote.startsWith('blob:') || tvTextureUrls.has(remote)) return;
  try {
    const response = await fetch(remote, { cache: 'force-cache' });
    if (!response.ok) return;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return;
    if (tvTextureUrls.size >= 80) {
      const oldest = tvTextureUrls.keys().next().value;
      URL.revokeObjectURL(tvTextureUrls.get(oldest));
      tvTextureUrls.delete(oldest);
    }
    tvTextureUrls.set(remote, URL.createObjectURL(blob));
  } catch { /* The normal remote URL remains as a fallback. */ }
}

async function prepareTvTextures(titles, includeDetails = false) {
  const sources = titles.flatMap((title) => [
    title.posterUrl || title.poster,
    ...(includeDetails ? [title.backdropUrl || title.background, title.logoUrl || title.logo] : []),
  ]).filter(Boolean);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, sources.length) }, async () => {
    while (next < sources.length) await cacheTvTexture(sources[next++]);
  }));
}

function normalizeAssets(title) {
  const providerLogos = (title.availabilityBR?.providerLogos || []).map((provider) => ({ ...provider, logo: textureUrl(provider.logo) }));
  return {
    ...title,
    posterUrl: textureUrl(title.posterUrl || title.poster),
    posterFallbackUrl: textureUrl(title.posterUrl || title.poster),
    backdropUrl: textureUrl(title.backdropUrl || title.background),
    logoUrl: title.logoUrl || title.logo ? textureUrl(title.logoUrl || title.logo) : '',
    availabilityBR: title.availabilityBR ? { ...title.availabilityBR, providerLogos } : title.availabilityBR,
  };
}

async function api(path, options = {}) {
  let timeoutId = 0;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('request_timeout')), 12000);
  });
  const response = await Promise.race([fetch(`${API_BASE}${path}`, options), timeout]);
  clearTimeout(timeoutId);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function showToast(message, duration = 4200) {
  const toast = $('#toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, duration);
}

function currentDialog() {
  const dialogs = [...document.querySelectorAll('dialog[open]')];
  return dialogs[dialogs.length - 1] || null;
}

function focusables(container = document) {
  return [...container.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
    .filter((element) => !element.hidden && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
}

function spatialMove(direction) {
  const container = currentDialog() || $('#tv-app');
  const candidates = focusables(container);
  const current = document.activeElement;
  if (!candidates.length) return;
  if (!candidates.includes(current)) { candidates[0].focus(); return; }
  const rect = current.getBoundingClientRect();
  const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  let best = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    if (candidate === current) continue;
    const next = candidate.getBoundingClientRect();
    const point = { x: next.left + next.width / 2, y: next.top + next.height / 2 };
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    if ((direction === 'left' && dx >= -4) || (direction === 'right' && dx <= 4) || (direction === 'up' && dy >= -4) || (direction === 'down' && dy <= 4)) continue;
    const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
    const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = primary + secondary * 2.4;
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  if (!best) return;
  best.focus({ preventScroll: true });
  best.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

function arrowDirection(event) {
  const byKey = { ArrowLeft: 'left', Left: 'left', ArrowRight: 'right', Right: 'right', ArrowUp: 'up', Up: 'up', ArrowDown: 'down', Down: 'down' };
  if (byKey[event.key]) return byKey[event.key];
  return { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }[event.keyCode] || '';
}

function filterControls() {
  return [
    $('#genre-select'),
    $('#year-input'),
    ...document.querySelectorAll('#provider-options input'),
    $('#all-years'),
    $('#filters-form button[type="submit"]'),
  ].filter(Boolean);
}

function moveFilterField(direction) {
  const controls = filterControls();
  if (!controls.length) return;
  const current = controls.indexOf(document.activeElement);
  const delta = direction === 'right' ? 1 : -1;
  const next = current < 0 ? 0 : (current + delta + controls.length) % controls.length;
  controls[next].focus({ preventScroll: true });
  controls[next].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

function changeFilterValue(control, direction) {
  if (control instanceof HTMLSelectElement) {
    const delta = direction === 'down' ? 1 : -1;
    control.selectedIndex = Math.max(0, Math.min(control.options.length - 1, control.selectedIndex + delta));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (control instanceof HTMLInputElement && control.type === 'number') {
    if (direction === 'up') control.stepUp(); else control.stepDown();
    control.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
    control.checked = direction === 'up';
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

function closeDialog(dialog) {
  if (!dialog?.open) return;
  dialog.close();
}

function handleBack() {
  const dialog = currentDialog();
  if (dialog) { closeDialog(dialog); return; }
  const canvas = $('#immersive-stage canvas');
  if (document.activeElement === canvas || $('#flat-shelf').contains(document.activeElement)) {
    $('#filters-open').focus();
    showToast(ui('menu'), 2600);
    return;
  }
  const now = Date.now();
  if (now - lastRootBack < 1800) runtime.exit();
  else {
    lastRootBack = now;
    showToast(ui('appExit'), 1800);
    canvas?.focus();
  }
}

document.addEventListener('keydown', (event) => {
  const isBack = event.key === 'Escape' || event.key === 'Backspace' || event.keyCode === 10009;
  if (isBack) { event.preventDefault(); event.stopPropagation(); handleBack(); return; }
  const direction = arrowDirection(event);
  if (!direction) return;
  const target = event.target;
  if (currentDialog() === $('#filters-dialog')) {
    event.preventDefault();
    event.stopPropagation();
    if (direction === 'left' || direction === 'right') moveFilterField(direction);
    else changeFilterValue(target, direction);
    return;
  }
  if (target instanceof HTMLCanvasElement || target.classList?.contains('flat-vhs-viewer') || ['INPUT', 'SELECT'].includes(target.tagName)) return;
  event.preventDefault();
  spatialMove(direction);
}, true);

function providerVisuals() {
  return state.providers.map((id) => state.providerRegistry.find((provider) => provider.id === id)).filter(Boolean)
    .map((provider) => ({ ...provider, logo: imageUrl(provider.logo) }));
}

function shelfHeading() {
  const providers = state.providers.map((id) => PROVIDERS.find(([candidate]) => candidate === id)?.[1]).filter(Boolean).join(' + ');
  const year = state.ignoreStoreYear ? t('allYears') : state.year;
  $('#shelf-heading').textContent = `${genreLabel().toUpperCase()} · ${year}${providers ? ` · ${providers}` : ''}`;
  const segment = pageCount() > 1 ? ` · ${state.page + 1}/${pageCount()}` : '';
  $('#shelf-status').textContent = `${state.titles.length} ${ui('found')} · Stand ${state.stand + 1}${segment}`;
}

function saveBrowseState() {
  localStorage.setItem('locadora.tv.locale', state.locale);
  localStorage.setItem('locadora.tv.year', String(state.year));
  localStorage.setItem('locadora.tv.genre', String(state.genreIndex));
  localStorage.setItem('locadora.tv.providers', JSON.stringify(state.providers));
  localStorage.setItem('locadora.tv.ignoreStoreYear', String(state.ignoreStoreYear));
  localStorage.setItem('locadora.tv.mode', state.mode);
  localStorage.setItem('locadora.tv.lowFidelity', String(state.lowFidelity));
}

function saveRental() {
  const storage = state.accounts.activeSlot ? accountRentalStorage(localStorage, state.accounts.activeSlot) : localStorage;
  state.rental = saveGuestRentalState(storage, state.rental);
  syncRentalControls();
}

function syncRentalControls() {
  $('#basket-count').textContent = String(state.rental.basket.length);
  $('#counter-open').textContent = state.rental.activeRental ? `${ui('counter')} · ${state.rental.activeRental.titles.length}` : ui('counter');
  if (activeTitle) $('#title-basket').textContent = state.rental.basket.some((title) => guestTitleKey(title) === guestTitleKey(activeTitle)) ? ui('fromBasket') : ui('toBasket');
  syncAccountControls();
}

function sceneOptions() {
  const genre = activeGenre();
  return {
    container: $('#immersive-stage'),
    titles: visibleTitles().map(normalizeAssets),
    genre: genreLabel(genre),
    year: state.year,
    type: 'movie',
    stand: state.stand,
    theme: getGenreTheme(genre.theme),
    lighting: { brightness: 86, warmth: 3100, color: { r: 1, g: .78, b: .55 } },
    providers: providerVisuals(),
    performanceProfile: state.lowFidelity ? 'tv-low' : 'tv',
    plaqueOptions: {
      genres: GENRES.map(genreLabel), go: t('go'), allYears: t('allYears'), allProviders: state.locale === 'pt-BR' ? 'TODOS' : 'ALL',
      ignoreStoreYear: state.ignoreStoreYear, allowAllYears: state.providers.length > 0, genreLabel: t('genre'), yearLabel: t('year'),
    },
    onConfigure: (draft) => {
      state.year = clampStoreYear(draft.year);
      state.genreIndex = Math.max(0, GENRES.findIndex((genreItem) => genreLabel(genreItem) === draft.genre));
      state.ignoreStoreYear = Boolean(draft.ignoreStoreYear && state.providers.length);
      state.stand = 0; state.page = 0; saveBrowseState(); loadShelf();
    },
    onSelect: (title) => openTitle(title),
    onSwipe: (direction) => direction < 0 ? previousPageOrStand() : nextPageOrStand(),
    onBoundary: (direction) => {
      if (direction === 'left') previousPageOrStand();
      else if (direction === 'right') nextPageOrStand();
      else if (direction === 'up') $('#filters-open').focus();
      else if (direction === 'down') $('#basket-open').focus();
    },
  };
}

function disposeShelf() {
  immersiveShelf?.dispose();
  immersiveShelf = null;
  $('#immersive-stage').replaceChildren();
}

async function mountImmersive(renderToken) {
  disposeShelf();
  $('#flat-shelf').hidden = true;
  $('#immersive-stage').hidden = false;
  $('#loading-state').textContent = 'Preparando capas 3D…';
  $('#loading-state').hidden = false;
  try {
    // Samsung's older TV browser may permit only one live WebGL context. Do
    // not probe with a throwaway canvas before Three creates the real one.
    if (!state.lowFidelity) {
      state.lowFidelity = true;
      state.page = 0;
      saveBrowseState();
      shelfHeading();
    }
    await prepareTvTextures(visibleTitles());
    if (renderToken !== sceneRenderToken || state.mode !== 'immersive') return;
    $('#loading-state').hidden = true;
    immersiveShelf = createImmersiveShelf(sceneOptions());
    const canvas = $('#immersive-stage canvas');
    canvas?.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      if (state.mode !== 'immersive') return;
      state.mode = 'flat';
      saveBrowseState();
      renderScene();
      showToast('A TV encerrou o contexto 3D. A estante 2D continua disponível.');
    }, { once: true });
    canvas?.focus({ preventScroll: true });
    if (!performanceMeasured) measurePerformance();
  } catch (error) {
    if (renderToken !== sceneRenderToken) return;
    console.error('Immersive mode unavailable', error);
    state.mode = 'flat';
    saveBrowseState();
    renderScene();
    const reason = String(error?.message || error || 'WebGL indisponível').slice(0, 90);
    showToast(`O modo 3D não abriu (${reason}). A estante 2D continua funcionando.`, 7000);
  }
}

function renderFlatShelf() {
  disposeShelf();
  $('#immersive-stage').hidden = true;
  const shelf = $('#flat-shelf');
  shelf.hidden = false;
  const grid = document.createElement('div');
  grid.className = 'flat-shelf-grid';
  for (const title of visibleTitles()) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'flat-tape'; button.setAttribute('aria-label', `${title.name} · ${title.year || ''}`);
    const image = document.createElement('img'); image.alt = ''; image.src = imageUrl(title.poster); image.onerror = () => { image.src = PLACEHOLDER; };
    const label = document.createElement('span'); label.textContent = title.name;
    button.append(image, label);
    button.addEventListener('click', () => openTitle(title));
    grid.append(button);
  }
  const navigation = document.createElement('nav');
  navigation.className = 'flat-shelf-navigation';
  navigation.setAttribute('aria-label', 'Navegação das estantes');
  const previous = button(ui('previous'), previousPageOrStand, 'shelf-navigation-button');
  previous.dataset.shelfNavigation = 'previous';
  const next = button(ui('next'), nextPageOrStand, 'shelf-navigation-button');
  next.dataset.shelfNavigation = 'next';
  navigation.append(previous, next);
  shelf.replaceChildren(grid, navigation);
  if (!currentDialog()) grid.querySelector('button')?.focus({ preventScroll: true });
  syncStandButtons();
}

function renderScene() {
  const renderToken = ++sceneRenderToken;
  shelfHeading();
  $('#mode-toggle').textContent = state.mode === 'immersive' ? ui('mode2d') : ui('mode3d');
  if (state.mode === 'immersive') mountImmersive(renderToken); else renderFlatShelf();
  syncStandButtons();
}

function syncStandButtons() {
  $('#previous-stand').disabled = state.stand === 0 && state.page === 0;
  $('#next-stand').disabled = !state.hasNextStand && state.page >= pageCount() - 1;
  document.querySelector('[data-shelf-navigation="previous"]')?.toggleAttribute('disabled', state.stand === 0 && state.page === 0);
  document.querySelector('[data-shelf-navigation="next"]')?.toggleAttribute('disabled', !state.hasNextStand && state.page >= pageCount() - 1);
}

function measurePerformance() {
  performanceMeasured = true;
  let frames = 0;
  const started = performance.now();
  function sample(now) {
    if (!immersiveShelf || state.mode !== 'immersive') return;
    frames += 1;
    if (now - started < 6000) { requestAnimationFrame(sample); return; }
    const fps = frames * 1000 / (now - started);
    console.info(`Locadora TV shelf FPS: ${fps.toFixed(1)}`);
    if (fps < 24 && !state.lowFidelity) {
      state.lowFidelity = true; state.page = 0; saveBrowseState(); renderScene(); showToast(ui('lowFidelity'));
    }
  }
  requestAnimationFrame(sample);
}

async function loadShelf(nextStand = state.stand) {
  shelfRequest?.abort();
  const controller = new AbortController();
  shelfRequest = controller;
  $('#loading-state').hidden = false;
  $('#empty-state').hidden = true;
  $('#loading-state').textContent = ui('opening');
  immersiveShelf?.setLoading(genreLabel(), state.year, 'movie', nextStand);
  try {
    const params = new URLSearchParams({
      genre: activeGenre().genres.join(','), year: String(state.year), type: 'movie', stand: String(nextStand),
      providers: state.providers.join(','), ignoreStoreYear: String(state.ignoreStoreYear),
    });
    const body = await api(`/shelf?${params}`, { signal: controller.signal });
    if (shelfRequest !== controller) return;
    state.titles = Array.isArray(body.titles) ? body.titles : [];
    state.stand = nextStand;
    state.page = 0;
    state.hasNextStand = Boolean(body.hasNextStand);
    $('#loading-state').hidden = true;
    if (!state.titles.length) { $('#empty-state').hidden = false; disposeShelf(); return; }
    renderScene();
    restoreInspectionIfNeeded();
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error(error);
    $('#loading-state').hidden = true;
    $('#empty-state').hidden = false;
    $('#shelf-status').textContent = ui('loadError');
  } finally {
    if (shelfRequest === controller) shelfRequest = null;
  }
}

function nextPageOrStand() {
  if (state.page < pageCount() - 1) { state.page += 1; renderScene(); return; }
  if (state.hasNextStand) loadShelf(state.stand + 1);
}

function previousPageOrStand() {
  if (state.page > 0) { state.page -= 1; renderScene(); return; }
  if (state.stand > 0) loadShelf(state.stand - 1);
}

async function titleMetadata(title) {
  const key = `${state.locale}:${guestTitleKey(title)}`;
  if (metadata.has(key)) return metadata.get(key);
  const request = hydrateTitleMetadata(new Map(), key, title, () => api(`/title?${new URLSearchParams({ type: title.type, id: title.id, locale: state.locale })}`).then((body) => body.meta));
  metadata.set(key, request);
  try {
    const hydrated = await request;
    if (String(title.id).startsWith('tmdb:')) hydrated.id = title.id;
    hydrated.type = title.type;
    return normalizeAssets(hydrated);
  } catch (error) {
    metadata.delete(key);
    throw error;
  }
}

function viewerCopy() {
  return { ...getCopy(state.locale), catalogueOnly: t('catalogueDisclaimer') };
}

function createViewer(title) {
  activeViewer?.dispose();
  activeViewer = null;
  const stage = $('#title-stage'); stage.replaceChildren();
  const options = {
    container: stage,
    title,
    posterUrl: textureUrl(title.posterUrl || title.poster),
    backdropUrl: textureUrl(title.backdropUrl || title.background || title.poster),
    logoUrl: title.logoUrl || title.logo ? textureUrl(title.logoUrl || title.logo) : '',
    atCounter: state.rental.basket.some((item) => guestTitleKey(item) === guestTitleKey(title)),
    savedCollections: [], showSavedActions: false, showBlockAction: false,
    onCounter: toggleActiveBasket,
    onAvailability: () => openStreamings(activeTitle),
    onWatch: () => launchStremio(activeTitle),
    onLetterboxd: () => openWebDestination(createLetterboxdUrl(activeTitle)),
    onImdb: () => openWebDestination(createImdbUrl(activeTitle)),
    onClose: () => closeDialog($('#title-dialog')),
    copy: viewerCopy(),
    performanceProfile: 'tv',
  };
  try {
    activeViewer = state.mode === 'immersive' ? createVhsViewer(options) : createFlatVhsViewer(options);
  } catch (error) {
    console.error('3D inspector unavailable', error);
    activeViewer = createFlatVhsViewer(options);
  }
}

async function openTitle(title) {
  const token = ++titleLoadToken;
  activeTitle = normalizeAssets(title);
  $('#title-heading').textContent = activeTitle.name;
  $('#title-status').textContent = '';
  // Keep a single WebGL context alive on constrained Samsung hardware. The
  // shelf is rebuilt after the inspector closes.
  if (state.mode === 'immersive') {
    sceneRenderToken += 1;
    disposeShelf();
    $('#title-status').textContent = 'Preparando a fita 3D…';
    await prepareTvTextures([activeTitle], true);
    if (token !== titleLoadToken) return;
    activeTitle = normalizeAssets(activeTitle);
    $('#title-status').textContent = '';
  }
  createViewer(activeTitle);
  syncRentalControls();
  const dialog = $('#title-dialog');
  if (!dialog.open) dialog.showModal();
  $('#title-basket').focus({ preventScroll: true });
  state.rental.lastView = { stand: state.stand, titleKey: guestTitleKey(activeTitle), mode: state.mode, inspectionOpen: true };
  saveRental();
  try {
    const hydrated = await titleMetadata(activeTitle);
    if (token !== titleLoadToken || !dialog.open) return;
    if (state.mode === 'immersive') await prepareTvTextures([hydrated], true);
    if (token !== titleLoadToken || !dialog.open) return;
    activeTitle = hydrated;
    $('#title-heading').textContent = hydrated.displayTitle || hydrated.name;
    activeViewer?.update?.(hydrated, state.rental.basket.some((item) => guestTitleKey(item) === guestTitleKey(hydrated)), {
      posterUrl: textureUrl(hydrated.posterUrl || hydrated.poster), backdropUrl: textureUrl(hydrated.backdropUrl || hydrated.background), logoUrl: textureUrl(hydrated.logoUrl || hydrated.logo),
    }, { preserveView: true });
    syncRentalControls();
  } catch { $('#title-status').textContent = 'Os detalhes completos não puderam ser carregados.'; }
}

function closeTitle() {
  titleLoadToken += 1;
  activeViewer?.dispose(); activeViewer = null; activeTitle = null;
  $('#title-stage').replaceChildren();
  if (state.rental.lastView) state.rental.lastView.inspectionOpen = false;
  saveRental();
  if (state.mode === 'immersive') renderScene();
  const focus = state.mode === 'immersive' ? $('#immersive-stage canvas') : $('#flat-shelf button');
  focus?.focus({ preventScroll: true });
}

function toggleActiveBasket() {
  if (!activeTitle) return;
  const result = toggleGuestBasket(state.rental, activeTitle);
  state.rental = result.state;
  saveRental();
  if (!result.changed) {
    showToast(result.reason === 'basket_full' ? ui('basketFull') : result.reason === 'active_rental' ? ui('activeRental') : ui('unavailable'));
    return;
  }
  showToast(result.added ? ui('added') : ui('removed'));
  activeViewer?.update?.(activeTitle, Boolean(result.added), {}, { preserveView: true });
}

function tapeRow(title, controls = []) {
  const row = document.createElement('article'); row.className = 'tape-row';
  const image = document.createElement('img'); image.alt = ''; image.src = imageUrl(title.poster); image.onerror = () => { image.src = PLACEHOLDER; };
  const text = document.createElement('div');
  const name = document.createElement('strong'); name.textContent = title.name;
  const year = document.createElement('small'); year.textContent = title.year || '';
  text.append(name, year);
  const actions = document.createElement('div'); actions.className = 'tape-row-actions'; actions.append(...controls);
  row.append(image, text, actions);
  return row;
}

function button(text, action, className = '') {
  const element = document.createElement('button'); element.type = 'button'; element.textContent = text; element.className = className; element.addEventListener('click', action); return element;
}

function openBasket() {
  const list = $('#basket-list'); list.replaceChildren();
  for (const title of state.rental.basket) {
    list.append(tapeRow(title, [button(ui('titleRotate'), () => { closeDialog($('#basket-dialog')); openTitle(title); }), button('Tirar', () => {
      state.rental = toggleGuestBasket(state.rental, title).state; saveRental(); openBasket();
    })]));
  }
  if (!state.rental.basket.length) list.textContent = ui('emptyBasket');
  $('#basket-counter').disabled = !state.rental.basket.length || Boolean(state.rental.activeRental);
  $('#basket-status').textContent = state.rental.activeRental ? ui('activeRental') : '';
  const dialog = $('#basket-dialog'); if (!dialog.open) dialog.showModal();
  (list.querySelector('button') || $('#basket-counter') || dialog.querySelector('[data-close]'))?.focus();
}

function openCounter() {
  if (state.rental.activeRental) { openRental(); return; }
  closeDialog($('#basket-dialog'));
  const list = $('#counter-list'); list.replaceChildren();
  for (const [index, title] of state.rental.basket.entries()) {
    const check = document.createElement('input'); check.type = 'checkbox'; check.value = guestTitleKey(title); check.checked = index < MAX_RENTAL_TITLES; check.setAttribute('aria-label', `Selecionar ${title.name}`);
    check.addEventListener('change', () => {
      const checked = [...list.querySelectorAll('input:checked')];
      if (checked.length > MAX_RENTAL_TITLES) { check.checked = false; showToast(ui('chooseThree')); }
    });
    list.append(tapeRow(title, [check]));
  }
  $('#counter-status').textContent = state.rental.basket.length ? '' : ui('emptyBasket');
  $('#rent-selected').disabled = !state.rental.basket.length;
  const dialog = $('#counter-dialog'); if (!dialog.open) dialog.showModal();
  (list.querySelector('input') || dialog.querySelector('[data-close]'))?.focus();
}

function rentalRequestTitle(title) {
  const id = Number(String(title?.id || '').replace(/^tmdb:/, ''));
  if (!Number.isSafeInteger(id) || id < 1 || !['movie', 'series'].includes(title?.type)) return null;
  return { tmdbId: id, type: title.type, name: title.name, year: title.year || null };
}

async function rentSelected() {
  if (!state.account) { closeDialog($('#counter-dialog')); openTvAccountDialog('Escolha Will ou Diadorim para registrar o aluguel na sua conta.'); return; }
  const keys = [...$('#counter-list').querySelectorAll('input:checked')].map((input) => input.value);
  const titles = state.rental.basket.filter((title) => keys.includes(guestTitleKey(title))).slice(0, MAX_RENTAL_TITLES);
  const requestTitles = titles.map(rentalRequestTitle).filter(Boolean);
  if (!requestTitles.length || requestTitles.length !== titles.length) { $('#counter-status').textContent = ui('chooseThree'); return; }
  const button = $('#rent-selected');
  button.disabled = true;
  $('#counter-status').textContent = 'Registrando na sua Carteirinha…';
  try {
    await tvAccountClient.rent(state.account.token, requestTitles);
    const rentedKeys = new Set(titles.map(guestTitleKey));
    state.rental.basket = state.rental.basket.filter((title) => !rentedKeys.has(guestTitleKey(title)));
    await refreshActiveAccount();
    saveRental(); closeDialog($('#counter-dialog')); showToast(ui('rented')); openRental();
  } catch (error) {
    $('#counter-status').textContent = error.status === 401 ? 'Essa autorização expirou. Escolha o usuário novamente.' : (error.message || 'Não foi possível registrar o aluguel.');
  } finally { button.disabled = false; }
}

function openRental() {
  const rental = state.rental.activeRental;
  if (!rental) { openCounter(); return; }
  const list = $('#rental-list'); list.replaceChildren();
  for (const title of rental.titles) {
    const check = document.createElement('input'); check.type = 'checkbox'; check.value = guestTitleKey(title); check.checked = true; check.setAttribute('aria-label', `Devolver ${title.name}`);
    const select = document.createElement('select'); select.dataset.key = guestTitleKey(title); select.setAttribute('aria-label', `Estado de ${title.name}`);
    for (const [value, label] of [['unknown', 'Não sei'], ['watched', 'Assisti'], ['not_watched', 'Não assisti']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option);
    }
    const row = tapeRow(title, [check, select]);
    row.dataset.rentalItemId = title.rentalItemId || '';
    list.append(row);
  }
  const dialog = $('#rental-dialog'); if (!dialog.open) dialog.showModal();
  list.querySelector('input')?.focus();
}

async function returnSelected() {
  if (!state.account) { closeDialog($('#rental-dialog')); openTvAccountDialog('Escolha o usuário para registrar a devolução.'); return; }
  const returns = [...$('#rental-list').querySelectorAll('.tape-row')].map((row) => {
    const check = row.querySelector('input'); const select = row.querySelector('select');
    return check.checked ? { itemId: row.dataset.rentalItemId, watchedStatus: select.value } : null;
  }).filter(Boolean);
  if (!returns.length || returns.some((item) => !item.itemId)) { $('#rental-status').textContent = ui('chooseThree'); return; }
  const button = $('#return-selected');
  button.disabled = true;
  $('#rental-status').textContent = 'Registrando devolução…';
  try {
    for (const item of returns) await tvAccountClient.returnItem(state.account.token, item.itemId, item.watchedStatus);
    await refreshActiveAccount();
    saveRental(); showToast(ui('returned'));
    if (state.rental.activeRental) openRental(); else closeDialog($('#rental-dialog'));
  } catch (error) {
    $('#rental-status').textContent = error.status === 401 ? 'Essa autorização expirou. Escolha o usuário novamente.' : (error.message || 'Não foi possível registrar a devolução.');
  } finally { button.disabled = false; }
}

async function openStreamings(title) {
  if (!title) return;
  const dialog = $('#streaming-dialog');
  $('#streaming-heading').textContent = title.displayTitle || title.name;
  const actions = $('#streaming-actions'); actions.replaceChildren();
  $('#streaming-status').textContent = t('loadingStreamings');
  if (!dialog.open) dialog.showModal();
  try {
    const hydrated = title.imdbId ? title : await titleMetadata(title).catch(() => title);
    const id = String(hydrated.id || '').replace(/^tmdb:/, '');
    const body = /^\d+$/.test(id) ? await api(`/watch-links?${new URLSearchParams({ type: hydrated.type, id })}`) : { offers: [] };
    const offers = Array.isArray(body.offers) ? body.offers : [];
    for (const offer of offers) {
      const providerId = PROVIDER_IDS[Number(offer.providerId)] || '';
      actions.append(button(`${t('openService')} ${offer.providerName}`, () => launchProvider(providerId, offer.url, hydrated)));
    }
    if (hydrated.imdbId) actions.append(button('Stremio', () => launchStremio(hydrated)));
    $('#streaming-status').textContent = offers.length ? t('streamingNote') : ui('noLinks');
    actions.querySelector('button')?.focus();
  } catch (error) {
    console.error(error);
    $('#streaming-status').textContent = ui('noLinks');
    actions.append(button('Stremio', () => launchStremio(title)));
    actions.querySelector('button')?.focus();
  }
}

function rememberExternal(title) {
  state.rental.lastView = { stand: state.stand, titleKey: guestTitleKey(title), mode: state.mode, inspectionOpen: true };
  saveRental();
}

async function launchProvider(providerId, exactUrl, title) {
  rememberExternal(title);
  $('#streaming-status').textContent = 'Abrindo…';
  const result = await runtime.openProvider({ providerId, exactUrl });
  const message = result.status === 'exact' ? ui('exact') : result.status === 'app_home' ? ui('appHome') : result.status === 'browser' ? ui('browser') : ui('unavailable');
  $('#streaming-status').textContent = message; showToast(message);
}

async function launchStremio(title) {
  if (!title) return;
  const hydrated = title.imdbId ? title : await titleMetadata(title).catch(() => title);
  let stremioUri = '';
  try { stremioUri = createStremioUri(hydrated); } catch { /* Missing IMDb ID. */ }
  rememberExternal(hydrated);
  const result = await runtime.openProvider({ providerId: 'stremio', stremioUri });
  const message = result.status === 'exact' ? ui('exact') : result.status === 'app_home' ? ui('appHome') : ui('unavailable');
  $('#title-status').textContent = message; showToast(message);
}

async function openWebDestination(url) {
  if (!activeTitle) return;
  rememberExternal(activeTitle);
  const result = await runtime.openProvider({ providerId: '', exactUrl: url });
  showToast(result.status === 'browser' ? ui('browser') : ui('unavailable'));
}

function openFilters() {
  $('#genre-select').value = String(state.genreIndex);
  $('#year-input').value = String(state.year);
  $('#all-years').checked = state.ignoreStoreYear;
  document.querySelectorAll('#provider-options input').forEach((input) => { input.checked = state.providers.includes(input.value); });
  const dialog = $('#filters-dialog'); dialog.showModal(); $('#genre-select').focus();
}

function applyFilters(event) {
  event.preventDefault();
  state.genreIndex = Number($('#genre-select').value);
  state.year = clampStoreYear($('#year-input').value);
  state.providers = [...document.querySelectorAll('#provider-options input:checked')].map((input) => input.value).sort();
  state.ignoreStoreYear = state.providers.length > 0 && $('#all-years').checked;
  state.stand = 0; state.page = 0; saveBrowseState(); closeDialog($('#filters-dialog')); loadShelf(0);
}

async function search(event) {
  event.preventDefault();
  const query = $('#search-input').value.trim();
  if (query.length < 2) { $('#search-status').textContent = ui('searchPrompt'); return; }
  $('#search-status').textContent = ui('searching');
  const results = $('#search-results'); results.replaceChildren();
  try {
    const body = await api(`/search?${new URLSearchParams({ q: query, locale: state.locale })}`);
    const titles = Array.isArray(body.titles) ? body.titles : [];
    for (const title of titles.slice(0, 10)) {
      const card = button('', () => { closeDialog($('#search-dialog')); openTitle(title); }, 'result-card');
      const image = document.createElement('img'); image.alt = ''; image.src = imageUrl(title.poster); image.onerror = () => { image.src = PLACEHOLDER; };
      const label = document.createElement('span'); label.textContent = `${title.name} · ${title.year || ''}`;
      card.append(image, label); results.append(card);
    }
    $('#search-status').textContent = titles.length ? `${titles.length} ${ui('found')}` : ui('noResults');
    results.querySelector('button')?.focus();
  } catch { $('#search-status').textContent = ui('loadError'); }
}

const audio = (() => {
  const tracks = [
    Object.assign(new Audio('./audio/ambience/store-room-tone.mp3'), { loop: true, volume: .12 }),
    Object.assign(new Audio('./audio/music/1990s/night-drive.mp3'), { loop: true, volume: .1 }),
  ];
  let enabled = false;
  async function start() {
    try { await Promise.all(tracks.map((track) => track.play())); enabled = true; return true; }
    catch { tracks.forEach((track) => track.pause()); enabled = false; return false; }
  }
  function stop() { tracks.forEach((track) => track.pause()); enabled = false; }
  return { toggle: () => enabled ? (stop(), Promise.resolve(false)) : start(), pause: () => tracks.forEach((track) => track.pause()), resume: () => enabled && tracks.forEach((track) => track.play().catch(() => {})), active: () => enabled };
})();

async function toggleSound() {
  const active = await audio.toggle();
  $('#sound-toggle').setAttribute('aria-pressed', String(active));
  $('#sound-toggle').textContent = active ? ui('soundOn') : ui('soundOff');
}

function toggleMode() {
  state.mode = state.mode === 'immersive' ? 'flat' : 'immersive';
  if (state.mode === 'immersive') state.lowFidelity = true;
  state.page = 0; saveBrowseState(); renderScene();
}

function applyLocale() {
  t = createTranslator(window.LocadoraI18n.COPY, state.locale);
  document.documentElement.lang = state.locale === 'pt-BR' ? 'pt-BR' : 'en';
  $('#previous-stand').textContent = ui('previous'); $('#next-stand').textContent = ui('next');
  $('#filters-open').textContent = ui('filters'); $('#search-open').textContent = ui('search');
  $('#basket-open').firstChild.textContent = `${ui('basket')} `; $('#counter-open').textContent = ui('counter');
  $('#mode-toggle').textContent = state.mode === 'immersive' ? ui('mode2d') : ui('mode3d');
  $('#sound-toggle').textContent = audio.active() ? ui('soundOn') : ui('soundOff');
  $('#locale-toggle').textContent = state.locale === 'pt-BR' ? 'EN' : 'PT';
  $('#title-rotate').textContent = ui('titleRotate'); $('#title-front').textContent = ui('front'); $('#title-back').textContent = ui('back');
  $('#title-streamings').textContent = ui('streamings');
  const genreSelect = $('#genre-select'); genreSelect.replaceChildren();
  GENRES.forEach((genre, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = genreLabel(genre); genreSelect.append(option); });
  genreSelect.value = String(state.genreIndex);
  shelfHeading(); syncRentalControls();
}

function toggleLocale() {
  state.locale = state.locale === 'pt-BR' ? 'en-US' : 'pt-BR';
  metadata.clear(); saveBrowseState(); applyLocale(); renderScene();
}

function restoreInspectionIfNeeded() {
  const last = state.rental.lastView;
  if (!last?.inspectionOpen || Number(last.stand) !== state.stand) return;
  const title = state.titles.find((item) => guestTitleKey(item) === last.titleKey);
  if (title) setTimeout(() => openTitle(title), 0);
}

function wire() {
  $('#previous-stand').addEventListener('click', previousPageOrStand);
  $('#next-stand').addEventListener('click', nextPageOrStand);
  $('#filters-open').addEventListener('click', openFilters);
  $('#search-open').addEventListener('click', () => { const dialog = $('#search-dialog'); dialog.showModal(); $('#search-input').focus(); });
  $('#basket-open').addEventListener('click', openBasket);
  $('#counter-open').addEventListener('click', () => state.rental.activeRental ? openRental() : openCounter());
  $('#account-open').addEventListener('click', () => openTvAccountDialog());
  $('#tv-account-anonymous').addEventListener('click', continueAnonymously);
  $('#mode-toggle').addEventListener('click', toggleMode);
  $('#sound-toggle').addEventListener('click', toggleSound);
  $('#locale-toggle').addEventListener('click', toggleLocale);
  $('#retry-shelf').addEventListener('click', () => loadShelf(state.stand));
  $('#filters-form').addEventListener('submit', applyFilters);
  $('#search-form').addEventListener('submit', search);
  $('#title-rotate').addEventListener('click', () => $('#title-stage canvas, #title-stage .flat-vhs-viewer')?.focus());
  $('#title-front').addEventListener('click', () => activeViewer?.focusFront());
  $('#title-back').addEventListener('click', () => activeViewer?.focusBack());
  $('#title-basket').addEventListener('click', toggleActiveBasket);
  $('#title-streamings').addEventListener('click', () => openStreamings(activeTitle));
  $('#title-stremio').addEventListener('click', () => launchStremio(activeTitle));
  $('#basket-counter').addEventListener('click', openCounter);
  $('#rent-selected').addEventListener('click', rentSelected);
  $('#return-selected').addEventListener('click', returnSelected);
  document.querySelectorAll('[data-close]').forEach((control) => control.addEventListener('click', () => closeDialog(control.closest('dialog'))));
  $('#title-dialog').addEventListener('close', closeTitle);
  $('#tv-pair-dialog').addEventListener('close', () => { pairingGeneration += 1; clearInterval(pairingTimer); pairingTimer = 0; });
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(dialog); }));
  document.addEventListener('visibilitychange', () => document.hidden ? audio.pause() : audio.resume());
  window.addEventListener('pageshow', () => { runtime.resetApps(); syncRentalControls(); });
}

function createFilterControls() {
  const host = $('#provider-options');
  for (const [id, name] of PROVIDERS) {
    const label = document.createElement('label');
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = id;
    const text = document.createElement('span'); text.textContent = name;
    label.append(input, text); host.append(label);
  }
}

async function boot() {
  try {
    $('#boot-status').textContent = 'Preparando a locadora…';
    wire(); createFilterControls(); applyLocale(); syncRentalControls();
    $('#year-input').value = String(state.year);
    $('#boot-screen').hidden = true; $('#tv-app').hidden = false;
    openTvAccountDialog();
    api('/health').then((health) => console.info('Locadora API health', health)).catch(() => {});
    const registry = await api('/providers').catch(() => ({ providers: [] }));
    state.providerRegistry = Array.isArray(registry.providers) ? registry.providers : [];
    await loadShelf(state.rental.lastView?.stand || state.stand);
  } catch (error) {
    console.error(error);
    $('#boot-screen').hidden = false; $('#tv-app').hidden = true;
    $('#boot-status').textContent = ui('loadError');
    const retry = button('Tentar novamente', () => window.location.reload());
    $('.boot-sign').append(retry); retry.focus();
  }
}

boot();
