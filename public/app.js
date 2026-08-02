(() => {
  'use strict';

  const { clampStoreYear, createImdbUrl, createLetterboxdUrl, createStremioUri, hydrateTitleMetadata, normalizeRentalState, prepareCounterSelection, removeCounterSelection, serializeRentalTitle, submitRentalReturns, updateRentalBasket, validateRentalResponse } = window.LocadoraCore;
  const MAX_CESTA_TITLES = 15;
  const MAX_RENTAL_TITLES = 3;
  const COVER_PLACEHOLDER_URL = '/images/wills-locadora-cover-placeholder.svg';
  const { createTranslator, getCopy, normalizeLocale } = window.LocadoraI18n;
  const { getGenreTheme } = window.LocadoraGenreThemes;
  const { DEFAULT_LIGHTING, kelvinToRgb, normalizeLighting } = window.LocadoraImmersivePreferences;
  const { createBoundedStandCache } = window.LocadoraStandCache;
  const genres = [
    { labelKey: 'genreAction', theme: 'Action & Adventure', genres: ['Action', 'Adventure'] },
    { labelKey: 'genreComedy', theme: 'Comedy', genres: ['Comedy'] },
    { labelKey: 'genreHorror', theme: 'Horror', genres: ['Horror'] },
    { labelKey: 'genreSciFi', theme: 'Sci-Fi & Fantasy', genres: ['Sci-Fi', 'Fantasy'] },
    { labelKey: 'genreDrama', theme: 'Drama', genres: ['Drama'] },
    { labelKey: 'genreCrime', theme: 'Crime & Thriller', genres: ['Crime', 'Thriller', 'Mystery'] },
    { labelKey: 'genreRomance', theme: 'Romance', genres: ['Romance'] },
    { labelKey: 'genreFamily', theme: 'Family & Animation', genres: ['Family', 'Animation'] },
    { labelKey: 'genreDocumentary', theme: 'Documentary', genres: ['Documentary'] },
  ];
  const initialRental = loadRentalState();
  const state = {
    locale: normalizeLocale(localStorage.getItem('locadora.locale') || 'pt-BR'),
    year: clampStoreYear(localStorage.getItem('locadora.year') || 1999),
    genreIndex: Number(localStorage.getItem('locadora.genre')) || 0,
    type: localStorage.getItem('locadora.type') === 'series' ? 'series' : 'movie',
    providers: (() => { try { const saved = JSON.parse(localStorage.getItem('locadora.providers') || '[]'); return Array.isArray(saved) ? saved.filter((id) => ['netflix', 'prime-video', 'max', 'disney-plus', 'globoplay', 'paramount-plus', 'apple-tv-plus', 'mubi', 'crunchyroll'].includes(id)).sort() : []; } catch { const legacy = localStorage.getItem('locadora.provider'); return ['netflix', 'prime-video'].includes(legacy) ? [legacy] : []; } })(),
    ignoreStoreYear: localStorage.getItem('locadora.ignoreStoreYear') === 'true',
    lighting: loadLighting(),
    providerRegistry: [],
    titles: [],
    counter: initialRental.counter,
    // Anonymous browsing can stage titles at the counter, but rentals/history are server-owned after sign-in.
    rental: { rented: null, returned: [] },
    member: { configured: false, signedIn: false, profile: null, watchlist: [], history: [], historyHasMore: false },
    request: null,
    stand: 0,
    metadata: new Map(),
    renderedTitleKeys: new Set(),
    mode: 'normal',
    hasNextStand: false,
    standCache: createBoundedStandCache(3),
  };

  const $ = (selector) => document.querySelector(selector);
  const shelf = $('#shelf');
  const emptyState = $('#empty-state');
  const titleDialog = $('#title-dialog');

  const balconySearchDialog = $('#balcony-search-dialog');
  const sourcesDialog = $('#sources-dialog');
  let activeVhsViewer = null;
  let activeViewerTitle = null;
  let viewerToken = 0;
  let immersiveShelf = null;
  let immersiveToken = 0;
  let balcony = null;
  let returnToBalconySearch = false;
  let usernameAvailabilityTimer = 0;
  let usernameAvailabilityToken = 0;
  let pendingRental = false;
  let rentalRequestInFlight = false;
  let balconySelection = null;
  let pendingReturns = new Map();
  let returnRequestInFlight = false;
  let memberSessionVersion = 0;
  let memberRefreshVersion = 0;
  let t = createTranslator(window.LocadoraI18n.COPY, state.locale);
  const storeAudio = window.LocadoraAudio?.createStoreAudio(state.year);

  function disposeVhsViewer() {
    viewerToken += 1;
    activeVhsViewer?.dispose();
    activeVhsViewer = null;
    activeViewerTitle = null;
    $('#title-detail').replaceChildren();
  }

  function genreLabel(genre) { return t(genre.labelKey); }

  function applyLocale(refreshTitle = true) {
    t = createTranslator(window.LocadoraI18n.COPY, state.locale);
    document.documentElement.lang = state.locale === 'pt-BR' ? 'pt-BR' : 'en';
    document.querySelectorAll('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => { element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel)); });
    $('#locale-select').value = state.locale;
    $('#genre-select').value = String(state.genreIndex);
    for (const select of [$('#genre-select'), $('#immersive-genre-select')]) {
      select.querySelectorAll('option').forEach((option, index) => { option.textContent = genreLabel(genres[index]); });
    }
    $('#shelf-title').textContent = genreLabel(genres[state.genreIndex]);
    state.metadata.clear();
    if (refreshTitle && titleDialog.open) {
      const key = $('#title-detail').dataset.titleKey;
      const title = [...state.titles, ...state.counter].find((item) => `${item.type}:${item.id}` === key);
      if (title) openTitle(title, true);
    }
  }

  function loadRentalState() {
    const saved = localStorage.getItem('locadora.rental');
    if (saved) return normalizeRentalState(saved);
    try { return normalizeRentalState({ counter: JSON.parse(localStorage.getItem('locadora.counter') || '[]') }); }
    catch { return normalizeRentalState({}); }
  }

  function rentalState() {
    return { counter: state.counter, rented: state.rental.rented, returned: state.rental.returned };
  }

  function counterDecisionTitles() {
    return balconySelection || state.counter;
  }

  function activeRentalCount() {
    return state.rental.rented?.titles.length || 0;
  }

  function availableRentalSlots() {
    return Math.max(0, MAX_RENTAL_TITLES - activeRentalCount());
  }

  function beginCounterDecision() {
    balconySelection = prepareCounterSelection(state.counter);
    return balconySelection;
  }

  function removeFromCounterDecision(title) {
    balconySelection = removeCounterSelection(counterDecisionTitles(), title);
    renderBalconyPanel();
    refreshBalcony();
  }

  function balconyRentalState() {
    return { ...rentalState(), counter: counterDecisionTitles() };
  }

  function applyRental(next) {
    state.counter = next.counter;
    state.rental = { rented: next.rented, returned: next.returned };
  }

  function saveCounter() {
    localStorage.setItem('locadora.counter', JSON.stringify(state.counter));
    localStorage.setItem('locadora.rental', JSON.stringify(rentalState()));
    $('#counter-count').textContent = state.counter.length;
    $('#immersive-basket-count').textContent = state.counter.length;
  }

  function localRentalTitle(item) {
    return {
      id: `tmdb:${item.tmdbId ?? item.tmdb_id}`, type: item.type || item.title_type, name: item.name || item.title_snapshot, year: item.year ?? item.release_year_snapshot,
      rentalItemId: item.id, rentedAt: item.rentedAt || item.rented_at, returnedAt: item.returnedAt || item.returned_at,
      watchedStatus: item.watchedStatus || item.watched_status, poster: item.poster || '',
    };
  }

  function applyMemberData(data) {
    state.member = { ...state.member, profile: data.profile, watchlist: data.watchlist || [], history: data.history || [], historyHasMore: Boolean(data.historyHasMore) };
    const activeTitles = (data.activeRental?.items || []).map(localRentalTitle);
    state.rental.rented = data.activeRental && activeTitles.length ? { id: data.activeRental.id, titles: activeTitles } : null;
    state.rental.returned = (data.history || []).map(localRentalTitle);
    saveCounter();
    renderAccount();
  }

  async function refreshMemberData() {
    if (!state.member.signedIn) return;
    const sessionVersion = memberSessionVersion;
    const refreshVersion = ++memberRefreshVersion;
    const data = await window.LocadoraAccount.request('/v1/state');
    if (!state.member.signedIn || sessionVersion !== memberSessionVersion || refreshVersion !== memberRefreshVersion) return;
    applyMemberData(data);
    renderWatchlist();
    renderBalconyPanel();
    refreshBalcony();
  }

  function requireMember() {
    if (!state.member.configured) throw new Error('Personal accounts are not configured yet');
    if (!state.member.signedIn) throw new Error('Sign in to use your personal Locadora');
    if (!state.member.profile) throw new Error('Choose a public username first');
  }

  function renderAccount() {
    const { configured, signedIn, profile } = state.member;
    $('#account-open').textContent = profile?.username || 'Minha conta';
    $('#account-sign-in').hidden = !configured || signedIn;
    $('#account-sign-out').hidden = !signedIn;
    $('#username-form').hidden = !signedIn;
    $('#username-input').value = profile?.username || '';
    $('#account-status').textContent = !configured
      ? 'Personal accounts will open here once the Locadora account service is configured.'
      : !signedIn ? 'Entre para guardar sua lista e alugar fitas.'
        : profile ? `Você está na Locadora como ${profile.username}.`
          : 'Escolha um nome público para usar sua lista e alugar fitas.';
    renderAccountOverview();
  }

  function accountDate(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat(state.locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
  }

  function memberTitleForViewer(title) {
    const rentalTitle = String(title?.id || '').startsWith('tmdb:') ? title : localRentalTitle(title);
    return { ...rentalTitle };
  }

  function refreshAccountTitleCard(title, meta, { image, name, detail }) {
    name.textContent = title.name;
    detail.textContent = `${title.year || '—'} · ${meta}`;
    image.src = title.poster ? posterTextureUrl(title.poster) : COVER_PLACEHOLDER_URL;
  }

  function accountTitleItem(title, meta) {
    const memberTitle = memberTitleForViewer(title);
    const item = document.createElement('article'); item.className = 'counter-item account-title-item';
    const text = document.createElement('div');
    const name = document.createElement('strong');
    const detail = document.createElement('span');
    text.append(name, detail);
    const image = document.createElement('img'); image.alt = '';
    image.addEventListener('error', () => { image.src = COVER_PLACEHOLDER_URL; }, { once: true });
    refreshAccountTitleCard(memberTitle, meta, { image, name, detail });
    const inspect = document.createElement('button');
    inspect.className = 'account-title-inspect'; inspect.type = 'button'; inspect.textContent = 'Inspecionar';
    inspect.addEventListener('click', async () => {
      inspect.disabled = true;
      try { await loadTitleMetadata(memberTitle); }
      catch { /* The branded fallback remains usable when metadata is unavailable. */ }
      finally {
        inspect.disabled = false;
        openTitle(memberTitle, false);
      }
    });
    item.append(image, text, inspect);
    const cardLocale = state.locale;
    const cardSessionVersion = memberSessionVersion;
    loadTitleMetadata(memberTitle).then(() => {
      if (!item.isConnected || cardLocale !== state.locale || cardSessionVersion !== memberSessionVersion) return;
      refreshAccountTitleCard(memberTitle, meta, { image, name, detail });
    }).catch(() => {});
    return item;
  }

  function renderAccountOverview() {
    const overview = $('#account-overview');
    const { profile, history = [], historyHasMore, signedIn } = state.member;
    overview.hidden = !signedIn || !profile;
    if (overview.hidden) return;
    $('#account-basic-data').textContent = profile.username;
    $('#account-member-since').textContent = accountDate(profile.createdAt);
    const rental = state.rental.rented;
    $('#account-active-count').textContent = `${rental?.titles.length || 0}/3`;
    $('#account-history-count').textContent = String(history.length);
    $('#account-watchlist-count').textContent = String(state.member.watchlist.length);
    const active = $('#account-active-rentals'); active.replaceChildren();
    if (!rental?.titles.length) active.textContent = 'Nenhuma fita alugada agora.';
    else active.append(...rental.titles.map((title) => accountTitleItem(title, `alugada em ${accountDate(title.rentedAt)}`)));
    $('#account-return-counter').hidden = !rental?.titles.length;
    const historyList = $('#account-history'); historyList.replaceChildren();
    if (!history.length) historyList.textContent = 'Ainda não há devoluções no seu histórico.';
    else historyList.append(...history.map((title) => accountTitleItem(title, `${title.watchedStatus === 'watched' ? 'assistida' : title.watchedStatus === 'not_watched' ? 'não assistida' : 'sem confirmação'} · devolvida em ${accountDate(title.returnedAt)}`)));
    $('#account-history-more').hidden = !historyHasMore;
  }

  async function loadMoreAccountHistory() {
    const button = $('#account-history-more');
    button.disabled = true;
    try {
      const data = await window.LocadoraAccount.request(`/v1/history?offset=${state.member.history.length}`);
      const existing = new Set(state.member.history.map((title) => title.id));
      state.member.history.push(...(data.history || []).filter((title) => !existing.has(title.id)));
      state.member.historyHasMore = Boolean(data.hasMore);
      renderAccountOverview();
    } catch (error) { $('#account-status').textContent = error.message; }
    finally { button.disabled = false; }
  }

  function usernameCandidate(value) {
    const username = String(value || '').trim().toLowerCase();
    return /^[a-z0-9_-]{3,24}$/.test(username) ? username : '';
  }

  async function checkUsernameAvailability(value) {
    const status = $('#username-availability');
    const username = usernameCandidate(value);
    const token = ++usernameAvailabilityToken;
    if (!username) { status.textContent = value ? 'Use 3–24 lowercase letters, numbers, _ or -.' : ''; return; }
    if (username === state.member.profile?.username) { status.textContent = 'Esse é o seu nome público atual.'; return; }
    status.textContent = 'Checando disponibilidade…';
    try {
      const result = await window.LocadoraAccount.request(`/v1/usernames/${encodeURIComponent(username)}`);
      if (token !== usernameAvailabilityToken) return;
      status.textContent = result.available ? 'Nome disponível.' : 'Esse nome já está em uso.';
    } catch (error) {
      if (token === usernameAvailabilityToken) status.textContent = error.message;
    }
  }

  function renderWatchlist() {
    const list = $('#watchlist-list');
    list.replaceChildren();
    if (!state.member.signedIn) {
      $('#watchlist-status').textContent = state.member.configured ? 'Entre para abrir sua prateleira pessoal.' : 'A prateleira pessoal será ativada quando as contas forem configuradas.';
      return;
    }
    $('#watchlist-status').textContent = state.member.profile ? `${state.member.watchlist.length} título(s) guardado(s).` : 'Escolha um nome público antes de guardar títulos.';
    if (!state.member.watchlist.length) { list.textContent = 'Sua prateleira está vazia.'; return; }
    state.member.watchlist.forEach((title) => {
      const item = document.createElement('article'); item.className = 'counter-item watchlist-item';
      const text = document.createElement('div'); const name = document.createElement('strong'); name.textContent = title.name;
      const meta = document.createElement('time'); meta.dateTime = title.addedAt; meta.textContent = `${title.year || '—'} · ${title.type}`;
      text.append(name, meta);
      const inspect = document.createElement('button'); inspect.type = 'button'; inspect.textContent = 'Inspecionar'; inspect.addEventListener('click', () => openTitle(localRentalTitle(title)));
      item.append(text, inspect); list.append(item);
    });
  }

  function openAccount(message = '') { renderAccount(); if (message) $('#account-status').textContent = message; if (!$('#account-dialog').open) $('#account-dialog').showModal(); }
  function openWatchlist() { renderWatchlist(); if (!$('#watchlist-dialog').open) $('#watchlist-dialog').showModal(); }

  async function saveWatchlist(title) {
    try {
      requireMember();
      const remote = serializeRentalTitle(title);
      if (!remote) throw new Error('This title does not have a canonical TMDB record yet');
      await window.LocadoraAccount.request('/v1/watchlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: remote, source: 'locadora' }) });
      await refreshMemberData();
      openWatchlist();
    } catch (error) { openAccount(error.message); }
  }

  async function initMemberAccount() {
    try {
      const accountState = await window.LocadoraAccount.init();
      state.member = { ...state.member, ...accountState };
      renderAccount();
      if (accountState.signedIn) {
        await refreshMemberData();
        await resumePendingRental();
      }
      window.LocadoraAccount.onChange(async (next) => {
        memberSessionVersion += 1;
        pendingReturns.clear();
        const signedOut = state.member.signedIn && !next.signedIn;
        state.member = { ...state.member, ...next, ...(signedOut ? { profile: null, watchlist: [], history: [], historyHasMore: false } : {}) };
        if (signedOut) {
          state.rental = { rented: null, returned: [] };
          pendingRental = false;
          balconySelection = null;
          saveCounter();
          renderBalconyPanel();
          refreshBalcony();
        }
        renderAccount();
        if (next.signedIn) {
          await refreshMemberData();
          await resumePendingRental();
        }
      });
    } catch (error) {
      $('#account-status').textContent = error.message;
      renderAccount();
    }
  }

  function loadLighting() {
    try { return normalizeLighting(JSON.parse(localStorage.getItem('locadora.immersiveLighting') || '{}')); }
    catch { return { ...DEFAULT_LIGHTING }; }
  }

  function immersiveVisuals() {
    const genre = genres[state.genreIndex];
    const providers = state.providers.map((id) => state.providerRegistry.find((provider) => provider.id === id)).filter(Boolean);
    return { theme: getGenreTheme(genre.theme), lighting: { ...state.lighting, color: kelvinToRgb(state.lighting.warmth) }, providers };
  }

  async function loadProviderRegistry() {
    try {
      const { providers } = await api('/api/providers');
      state.providerRegistry = providers;
      immersiveShelf?.setVisuals(immersiveVisuals());
    } catch { /* Provider controls retain their local fallback state. */ }
  }

  function syncLightingControls() {
    $('#lamp-brightness').value = state.lighting.brightness;
    $('#lamp-warmth').value = state.lighting.warmth;
    $('#lamp-brightness-value').textContent = `${state.lighting.brightness}%`;
    $('#lamp-warmth-value').textContent = `${state.lighting.warmth}K`;
  }

  function setLighting(nextLighting) {
    state.lighting = normalizeLighting(nextLighting);
    localStorage.setItem('locadora.immersiveLighting', JSON.stringify(state.lighting));
    syncLightingControls();
    immersiveShelf?.setVisuals(immersiveVisuals());
  }

  async function api(path, options) {
    const response = await fetch(window.locadoraApiUrl(path), options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }

  function openBalconySearch(preserve = false) {
    if (!preserve) {
      $('#balcony-search-results').replaceChildren();
      $('#balcony-search-status').textContent = state.locale === 'pt-BR' ? 'Digite ao menos duas letras.' : 'Type at least two letters.';
    }
    if (!balconySearchDialog.open) balconySearchDialog.showModal();
    $('#balcony-search-input').focus();
  }

  async function searchBalconyCatalogue() {
    const input = $('#balcony-search-input');
    const query = input.value.trim();
    const status = $('#balcony-search-status');
    const results = $('#balcony-search-results');
    results.replaceChildren();
    if (query.length < 2) { status.textContent = state.locale === 'pt-BR' ? 'Digite ao menos duas letras.' : 'Type at least two letters.'; return; }
    status.textContent = state.locale === 'pt-BR' ? 'Consultando o catálogo…' : 'Searching the catalogue…';
    try {
      const { titles = [] } = await api(`/api/search?${new URLSearchParams({ q: query, locale: state.locale })}`);
      status.textContent = titles.length ? (state.locale === 'pt-BR' ? `${titles.length} fita(s) encontrada(s).` : `${titles.length} tape(s) found.`) : (state.locale === 'pt-BR' ? 'Nenhuma fita encontrada.' : 'No tapes found.');
      titles.forEach((title) => {
        const item = document.createElement('article'); item.className = 'counter-item';
        const image = document.createElement('img'); image.alt = ''; image.src = title.poster ? posterTextureUrl(title.poster) : COVER_PLACEHOLDER_URL; image.addEventListener('error', () => { image.src = COVER_PLACEHOLDER_URL; }, { once: true });
        const text = document.createElement('div'); const name = document.createElement('strong'); name.textContent = title.name; const meta = document.createElement('span'); meta.textContent = `${title.type === 'series' ? t('series') : t('movies')} · ${title.year || '—'}`; text.append(name, meta);
        const actions = document.createElement('div'); actions.className = 'return-choices';
        const inspect = document.createElement('button'); inspect.type = 'button'; inspect.textContent = state.locale === 'pt-BR' ? 'Ver fita' : 'View tape'; inspect.addEventListener('click', () => { returnToBalconySearch = true; balconySearchDialog.close(); openTitle(title, true, posterTextureUrl(title.poster || posterFallback(title))); });
        const add = document.createElement('button'); add.type = 'button'; add.className = 'primary-inline-action'; add.dataset.titleKey = `${title.type}:${title.id}`; add.textContent = isAtCounter(title) ? 'Tirar da cesta' : 'Botar na cesta'; add.disabled = !isAtCounter(title) && state.counter.length >= MAX_CESTA_TITLES; add.addEventListener('click', () => {
          const result = toggleCounter(title);
          const selectedKeys = new Set(state.counter.map((item) => `${item.type}:${item.id}`));
          results.querySelectorAll('.primary-inline-action').forEach((button) => {
            const selected = selectedKeys.has(button.dataset.titleKey);
            button.textContent = selected ? 'Tirar da cesta' : 'Botar na cesta';
            button.disabled = !selected && state.counter.length >= MAX_CESTA_TITLES;
          });
          status.textContent = basketMessage(result.reason);
        });
        actions.append(inspect, add); item.append(image, text, actions); results.append(item);
      });
    } catch { status.textContent = state.locale === 'pt-BR' ? 'O catálogo está indisponível agora.' : 'The catalogue is unavailable right now.'; }
  }

  function setYear(value, reload = true) {
    state.year = clampStoreYear(value);
    localStorage.setItem('locadora.year', state.year);
    $('#store-year-input').value = state.year;
    $('#immersive-year-input').value = state.year;
    storeAudio?.setYear(state.year).catch((error) => {
      $('#music-toggle').setAttribute('aria-pressed', 'false');
      $('#music-toggle').textContent = t('storeMusic');
      $('#immersive-status').textContent = error.message;
    });
    if (reload) loadShelf();
  }

  function stepYear(offset) {
    const input = $('#store-year-input');
    input.value = clampStoreYear(Number(input.value || state.year) + offset);
  }

  function selectGenre(index, reload = true) {
    state.genreIndex = index;
    localStorage.setItem('locadora.genre', index);
    $('#genre-select').value = String(index);
    $('#immersive-genre-select').value = String(index);
    if (reload) loadShelf();
  }

  function selectedProviderIds(container) {
    return [...container.querySelectorAll('[data-provider-id]:checked')].map((input) => input.dataset.providerId).sort();
  }

  function syncProviderControls() {
    document.querySelectorAll('[data-provider-id]').forEach((input) => { input.checked = state.providers.includes(input.dataset.providerId); });
    const enabled = state.providers.length > 0;
    state.ignoreStoreYear = enabled && state.ignoreStoreYear;
    for (const selector of ['#ignore-store-year', '#immersive-ignore-store-year']) {
      $(selector).checked = state.ignoreStoreYear;
      $(selector).disabled = !enabled;
    }
  }

  function setProviders(values, reload = true) {
    state.providers = [...new Set(values)].filter((id) => ['netflix', 'prime-video', 'max', 'disney-plus', 'globoplay', 'paramount-plus', 'apple-tv-plus', 'mubi', 'crunchyroll'].includes(id)).sort();
    localStorage.setItem('locadora.providers', JSON.stringify(state.providers));
    syncProviderControls();
    if (reload) loadShelf();
  }

  function setIgnoreStoreYear(value, reload = true) {
    state.ignoreStoreYear = state.providers.length > 0 && Boolean(value);
    localStorage.setItem('locadora.ignoreStoreYear', String(state.ignoreStoreYear));
    syncProviderControls();
    if (reload) loadShelf();
  }

  function applyImmersiveFilters() {
    const year = $('#immersive-year-input').value;
    const genreIndex = Number($('#immersive-genre-select').value);
    const providers = selectedProviderIds($('#immersive-provider-checkboxes'));
    const ignoreStoreYear = $('#immersive-ignore-store-year').checked;
    const yearChanged = clampStoreYear(year) !== state.year;
    const genreChanged = genreIndex !== state.genreIndex;
    const providerChanged = providers.join(',') !== state.providers.join(',');
    const ignoreChanged = ignoreStoreYear !== state.ignoreStoreYear;
    if (!yearChanged && !genreChanged && !providerChanged && !ignoreChanged) return;
    if (yearChanged) setYear(year, false);
    if (genreChanged) selectGenre(genreIndex, false);
    if (providerChanged) setProviders(providers, false);
    if (ignoreChanged) setIgnoreStoreYear(ignoreStoreYear, false);
    loadShelf();
  }

  function selectType(type) {
    state.type = type;
    localStorage.setItem('locadora.type', type);
    document.querySelectorAll('[data-type]').forEach((button) => button.classList.toggle('is-active', button.dataset.type === type));
    loadShelf();
  }

  function renderSkeletons() {
    const grid = document.createElement('div');
    grid.className = 'shelf';
    grid.append(...Array.from({ length: 12 }, () => {
      const item = document.createElement('article');
      item.className = 'vhs-item';
      const box = document.createElement('span');
      box.className = 'vhs-case skeleton';
      item.append(box);
      return item;
    }));
    shelf.replaceChildren(grid);
  }

  function loadTitleMetadata(title) {
    const key = `${state.locale}:${title.type}:${title.id}`;
    return hydrateTitleMetadata(state.metadata, key, title, () => (
      api(`/api/meta?${new URLSearchParams({ type: title.type, id: title.id, locale: state.locale })}`).then(({ meta }) => meta)
    ));
  }

  function renderShelf(titles, stand, append) {
    if (!append) shelf.replaceChildren();
    const section = document.createElement('section');
    section.className = 'shelf-stand';
    section.setAttribute('aria-label', `Stand ${stand + 1}`);
    const standNumber = document.createElement('span');
    standNumber.className = 'stand-number';
    standNumber.textContent = `Stand ${String(stand + 1).padStart(2, '0')}`;
    const grid = document.createElement('div');
    grid.className = 'shelf';
    const template = $('#case-template');
    titles.forEach((title) => {
      const node = template.content.cloneNode(true);
      const article = node.querySelector('.vhs-item');
      const button = node.querySelector('button');
      const image = node.querySelector('img');
      image.src = title.poster || posterFallback(title);
      image.alt = `${title.name} cover`;
      image.addEventListener('error', () => { image.src = posterFallback(title); }, { once: true });
      node.querySelector('.case-year').textContent = title.year || '—';
      node.querySelector('.case-label strong').textContent = title.name;
      node.querySelector('.case-label small').textContent = `${title.year || 'Year unknown'} · ${title.type}`;
      const letterboxd = node.querySelector('.letterboxd-sticker');
      letterboxd.href = createLetterboxdUrl(title);
      letterboxd.setAttribute('aria-label', `Open ${title.name} on Letterboxd`);
      button.setAttribute('aria-label', `Inspect ${title.name}, ${title.year || 'year unknown'}`);
      button.addEventListener('click', () => openTitle(title, true, posterTextureUrl(image.currentSrc || image.src)));
      article.dataset.titleId = title.id;
      grid.append(node);
    });
    section.append(standNumber, grid);
    shelf.append(section);
  }

  function posterFallback(title) {
    const label = encodeURIComponent(title.name.slice(0, 28));
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450'%3E%3Crect width='100%25' height='100%25' fill='%23291e18'/%3E%3Crect x='20' y='20' width='260' height='410' fill='none' stroke='%23f2c744' stroke-width='5'/%3E%3Ctext x='150' y='205' text-anchor='middle' fill='%23f5e8c8' font-family='sans-serif' font-weight='bold' font-size='22'%3E${label}%3C/text%3E%3Ctext x='150' y='245' text-anchor='middle' fill='%23d7432f' font-family='monospace' font-size='16'%3ELOCADORA%3C/text%3E%3C/svg%3E`;
  }

  function posterTextureUrl(source) {
    if (!source || source.startsWith('data:') || source.startsWith(location.origin)) return source;
    return window.locadoraPosterUrl(source);
  }

  function vhsAssets(title, posterUrl = posterTextureUrl(title.poster || posterFallback(title))) {
    return {
      posterUrl,
      backdropUrl: posterTextureUrl(title.background),
      logoUrl: posterTextureUrl(title.logo),
    };
  }

  function immersiveTitles() {
    return state.titles.map((title) => ({
      ...title,
      posterUrl: posterTextureUrl(title.poster || posterFallback(title)),
    }));
  }

  function refreshImmersive(direction = 0) {
    if (!immersiveShelf) return;
    const genre = genres[state.genreIndex];
    if (direction) immersiveShelf.transition(immersiveTitles(), genreLabel(genre), state.year, state.type, state.stand, direction, immersiveVisuals());
    else immersiveShelf.update(immersiveTitles(), genreLabel(genre), state.year, state.type, state.stand, immersiveVisuals());
    $('#immersive-status').textContent = state.titles.length ? `Stand ${state.stand + 1} · ${Math.min(state.titles.length, 40)} ${t('tapesFound')}` : t('emptyTitle');
  }

  function syncImmersiveStandControls() {
    $('#immersive-previous-stand').hidden = state.stand === 0;
    $('#immersive-next-stand').hidden = !state.hasNextStand;
  }

  function goToCachedStand(stand, direction) {
    const cached = state.standCache.get(stand);
    if (!cached) return false;
    state.stand = stand;
    state.titles = cached.titles;
    state.hasNextStand = cached.hasNextStand;
    refreshImmersive(direction);
    syncImmersiveStandControls();
    return true;
  }

  function goToPreviousStand() {
    goToCachedStand(state.stand - 1, -1);
  }

  function goToNextStand() {
    if (!goToCachedStand(state.stand + 1, 1)) loadShelf(state.stand + 1, true, 1);
  }

  async function mountImmersiveFallback(stage) {
    const { createTapeFallback } = await import('./tape-fallback.mjs');
    immersiveShelf = createTapeFallback({
      container: stage,
      titles: immersiveTitles(),
      heading: `${genreLabel(genres[state.genreIndex])} · ${state.year}`,
      onSelect: (title, posterUrl) => openTitle(title, true, posterUrl),
    });
    $('#immersive-status').textContent = '3D is unavailable. Showing tape fronts instead.';
    syncImmersiveStandControls();
  }

  async function mountImmersive() {
    const token = ++immersiveToken;
    const stage = $('#immersive-stage');
    stage.textContent = '';
    $('#immersive-status').textContent = 'Building the display…';
    try {
      const { createImmersiveShelf } = await import('./immersive-shelf.mjs');
      if (state.mode !== 'immersive' || token !== immersiveToken) return;
      const genre = genres[state.genreIndex];
      immersiveShelf = createImmersiveShelf({
        container: stage,
        titles: immersiveTitles(),
        genre: genreLabel(genre),
        year: state.year,
        type: state.type,
        stand: state.stand,
        ...immersiveVisuals(),
        onSelect: (title, posterUrl) => openTitle(title, true, posterUrl),
      });
      stage.querySelector('.immersive-canvas')?.focus();
      $('#immersive-status').textContent = state.titles.length ? `Stand ${state.stand + 1} · ${Math.min(state.titles.length, 40)} ${t('tapesFound')}` : t('emptyTitle');
      syncImmersiveStandControls();
    } catch (error) {
      if (token !== immersiveToken) return;
      try { await mountImmersiveFallback(stage); }
      catch { $('#immersive-status').textContent = `The immersive shelf could not be loaded: ${error.message}`; }
    }
  }

  function setImmersiveHudCollapsed(collapsed) {
    const hud = $('#immersive-hud');
    hud.classList.toggle('is-collapsed', Boolean(collapsed));
    $('#immersive-hud-toggle').setAttribute('aria-expanded', String(!collapsed));
    $('#immersive-hud-toggle').setAttribute('aria-label', collapsed ? 'Show immersive controls' : 'Hide immersive controls');
    $('#immersive-hud-toggle').textContent = collapsed ? 'Menu da estante' : 'Ocultar';
    if (collapsed) {
      setImmersiveFilters(false);
      setImmersiveSettings(false);
    }
  }

  function setImmersiveFilters(open) {
    const expanded = state.mode === 'immersive' && Boolean(open);
    $('#immersive-filters').hidden = !expanded;
    $('#immersive-filters-toggle').setAttribute('aria-expanded', String(expanded));
    if (expanded) setImmersiveSettings(false);
  }

  function setImmersiveSettings(open) {
    const expanded = state.mode === 'immersive' && Boolean(open);
    $('#immersive-settings').hidden = !expanded;
    $('#immersive-settings-toggle').setAttribute('aria-expanded', String(expanded));
    if (expanded) {
      $('#immersive-filters').hidden = true;
      $('#immersive-filters-toggle').setAttribute('aria-expanded', 'false');
    }
  }

  function setNormalFilters(open) {
    const expanded = Boolean(open);
    $('#normal-provider-filters').hidden = !expanded;
    $('#normal-filters-toggle').setAttribute('aria-expanded', String(expanded));
  }

  async function toggleStoreAudio(channel, buttonId, enabledLabel, disabledLabel) {
    const button = $(buttonId);
    try {
      if (!storeAudio) throw new Error('This browser cannot play store audio.');
      const active = await storeAudio.toggle(channel);
      button.setAttribute('aria-pressed', String(Boolean(active)));
      button.textContent = active ? enabledLabel : disabledLabel;
    } catch (error) {
      button.textContent = 'Audio unavailable';
      $('#immersive-status').textContent = error.message;
    }
  }

  async function selectMusicTrack() {
    try {
      const active = await storeAudio?.setMusicTrack($('#music-track').value);
      if (!active) return;
      $('#music-toggle').setAttribute('aria-pressed', 'true');
      $('#music-toggle').textContent = 'Music on';
    } catch (error) {
      $('#music-toggle').setAttribute('aria-pressed', 'false');
      $('#music-toggle').textContent = t('storeMusic');
      $('#immersive-status').textContent = error.message;
    }
  }

  function setStoreAudioVolume(channel, inputId, valueId) {
    const percent = Number($(inputId).value);
    storeAudio?.setVolume(channel, percent / 100);
    $(valueId).textContent = `${percent}%`;
  }

  function setMode(mode) {
    state.mode = ['immersive', 'balcony'].includes(mode) ? mode : 'normal';
    const immersive = state.mode === 'immersive';
    const isBalcony = state.mode === 'balcony';
    if (isBalcony && balconySelection === null) beginCounterDecision();
    $('#normal-mode').hidden = immersive || isBalcony;
    $('#immersive-room').hidden = !immersive;
    $('#balcony-room').hidden = !isBalcony;
    document.body.classList.toggle('is-immersive', immersive || isBalcony);
    setImmersiveSettings(false);
    $('#immersive-toggle').textContent = immersive ? t('return') : t('immersiveMode');
    $('#immersive-toggle').setAttribute('aria-pressed', String(immersive));
    if (immersive) {
      balcony?.dispose();
      balcony = null;
      $('#balcony-stage').replaceChildren();
      setImmersiveHudCollapsed(false);
      mountImmersive();
    }
    else if (isBalcony) {
      immersiveToken += 1;
      immersiveShelf?.dispose();
      immersiveShelf = null;
      $('#immersive-stage').replaceChildren();
      mountBalcony();
    }
    else {
      immersiveToken += 1;
      immersiveShelf?.dispose();
      immersiveShelf = null;
      storeAudio?.stopAll();
      $('#ambience-toggle').setAttribute('aria-pressed', 'false');
      $('#ambience-toggle').textContent = t('storeAmbience');
      $('#music-toggle').setAttribute('aria-pressed', 'false');
      $('#music-toggle').textContent = t('storeMusic');
      $('#immersive-stage').replaceChildren();
      balcony?.dispose();
      balcony = null;
      $('#balcony-stage').replaceChildren();
      $('#immersive-toggle').focus();
    }
  }

  async function loadShelf(stand = 0, append = false, transitionDirection = 0) {
    if (state.request) state.request.abort();
    const controller = new AbortController();
    state.request = controller;
    const genre = genres[state.genreIndex];
    const aisle = String(state.genreIndex + 1).padStart(2, '0');
    const providerNames = { netflix: 'Netflix', 'prime-video': 'Prime Video', max: 'Max', 'disney-plus': 'Disney+', globoplay: 'Globoplay', 'paramount-plus': 'Paramount+', 'apple-tv-plus': 'Apple TV+', mubi: 'MUBI', crunchyroll: 'Crunchyroll' };
    const providerLabel = state.providers.map((id) => providerNames[id]).filter(Boolean).join(' + ');
    const yearLabel = state.ignoreStoreYear ? 'all release years' : `${state.year - 19}–${state.year}`;
    $('#shelf-title').textContent = genreLabel(genre);
    $('#shelf-caption').textContent = `${t('aisle')} ${aisle} · ${providerLabel ? `${yearLabel} · ${providerLabel} in Brazil` : `${t('storeYearCaption')} ${state.year}`} · ${state.type === 'movie' ? t('movies') : t('series')}`;
    $('#shelf-status').textContent = append ? t('openingStand') : t('openingBoxes');
    $('#immersive-status').textContent = append ? t('openingStand') : t('openingBoxes');
    $('#immersive-previous-stand').disabled = true;
    $('#immersive-next-stand').disabled = true;
    immersiveShelf?.setLoading(genreLabel(genre), state.year, state.type, stand);
    shelf.hidden = false;
    shelf.setAttribute('aria-busy', 'true');
    emptyState.hidden = true;
    if (!append) {
      state.stand = 0;
      state.hasNextStand = false;
      state.standCache.clear();
      $('#load-more-shelf').hidden = true;
      renderSkeletons();
    }

    try {
      const params = new URLSearchParams({ genre: genre.genres.join(','), year: state.year, type: state.type, stand, providers: state.providers.join(','), ignoreStoreYear: String(state.ignoreStoreYear) });
      const body = await api(`/api/shelf?${params}`, { signal: controller.signal });
      if (state.request !== controller) return;
      if (!append) state.renderedTitleKeys = new Set();
      const hasAnotherSourcePage = Boolean(body.hasNextStand);
      state.titles = body.titles.filter((title) => {
        const key = `${title.type}:${title.id}`;
        if (state.renderedTitleKeys.has(key)) return false;
        state.renderedTitleKeys.add(key);
        return true;
      });
      if (!state.titles.length) {
        if (!append) {
          showEmpty();
          refreshImmersive();
        }
        else $('#load-more-shelf').hidden = !hasAnotherSourcePage;
        return;
      }
      state.stand = stand;
      state.hasNextStand = hasAnotherSourcePage;
      state.standCache.set(stand, { titles: state.titles, hasNextStand: hasAnotherSourcePage });
      renderShelf(state.titles, stand, append);
      refreshImmersive(transitionDirection);
      $('#shelf-status').textContent = append ? `${state.titles.length} ${t('moreTapes')}` : `${state.titles.length} ${t('tapesFound')}`;
      $('#load-more-shelf').hidden = !hasAnotherSourcePage;
      syncImmersiveStandControls();
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (!append) state.titles = [];
      $('#shelf-status').textContent = error.message;
      $('#immersive-status').textContent = error.message;
      if (!append) showEmpty();
    } finally {
      if (state.request === controller) state.request = null;
      shelf.setAttribute('aria-busy', 'false');
      $('#immersive-previous-stand').disabled = false;
      $('#immersive-next-stand').disabled = false;
    }
  }

  function showEmpty() {
    shelf.hidden = true;
    $('#load-more-shelf').hidden = true;
    emptyState.hidden = false;
  }

  function isAtCounter(title) {
    return state.counter.some((item) => item.id === title.id && item.type === title.type);
  }

  function syncTitleBasketAction() {
    const basket = $('#title-detail .title-basket-action');
    if (!basket) return;
    basket.disabled = !isAtCounter(activeViewerTitle) && state.counter.length >= MAX_CESTA_TITLES;
    basket.textContent = isAtCounter(activeViewerTitle) ? 'Tirar da cesta' : state.counter.length >= MAX_CESTA_TITLES ? `Cesta cheia · ${MAX_CESTA_TITLES}/${MAX_CESTA_TITLES}` : 'Botar na cesta';
  }

  function basketMessage(reason) {
    if (reason === 'full') return `A cesta comporta no máximo ${MAX_CESTA_TITLES} fitas. Remova uma para escolher outra.`;
    if (reason === 'active_rental') return 'Você já tem um pacote ativo. Devolva as fitas antes de montar outro.';
    if (reason === 'added') return `Fita adicionada à cesta · ${state.counter.length} de ${MAX_CESTA_TITLES}.`;
    if (reason === 'removed') return `Fita retirada da cesta · ${state.counter.length} de ${MAX_CESTA_TITLES}.`;
    return 'Essa fita não pode ser adicionada agora.';
  }

  function toggleCounter(title) {
    const result = updateRentalBasket(state.counter, title, state.rental.rented);
    state.counter = result.titles;
    if (balconySelection && result.changed) {
      balconySelection = result.reason === 'added'
        ? prepareCounterSelection([...balconySelection, title])
        : removeCounterSelection(balconySelection, title);
    }
    saveCounter();
    syncTitleBasketAction();
    const status = $('#balcony-panel-status');
    if (status) status.textContent = basketMessage(result.reason);
    const basketStatus = $('#basket-status');
    if (basketStatus) basketStatus.textContent = basketMessage(result.reason);
    const confirmation = $('#basket-confirmation');
    if (confirmation) confirmation.textContent = ['added', 'removed'].includes(result.reason) ? basketMessage(result.reason) : '';
    if ($('#basket-dialog').open) renderBasket();
    if ($('#balcony-dialog').open) renderBalconyPanel();
    if (state.mode === 'balcony') refreshBalcony();
    return result;
  }

  function requestRentalIdentity() {
    pendingRental = true;
    if ($('#balcony-dialog').open) $('#balcony-dialog').close();
    const message = !state.member.configured
      ? 'As contas de membro ainda não estão configuradas.'
      : !state.member.signedIn
        ? 'Entre para confirmar as fitas que já estão na sua cesta.'
        : 'Escolha seu nome público para confirmar este pacote.';
    openAccount(message);
  }

  async function rentCounter() {
    const decision = counterDecisionTitles();
    if (rentalRequestInFlight || !decision.length) { openRentalDesk(); return; }
    const available = availableRentalSlots();
    if (decision.length > available) {
      $('#balcony-panel-status').textContent = available
        ? `Você ainda pode alugar ${available} ${available === 1 ? 'fita' : 'fitas'}. Tire as outras da decisão antes de confirmar.`
        : 'Você já está com 3 fitas alugadas. Devolva uma fita antes de alugar outra.';
      openRentalDesk();
      return;
    }
    if (!state.member.configured || !state.member.signedIn || !state.member.profile) { requestRentalIdentity(); return; }
    const sessionVersion = memberSessionVersion;
    const button = $('#rent-counter');
    rentalRequestInFlight = true;
    button.disabled = true;
    button.textContent = 'Registrando pacote…';
    try {
      const titles = counterDecisionTitles().map(serializeRentalTitle);
      if (titles.some((title) => !title)) throw new Error('Todas as fitas precisam de um registro válido do catálogo. Tire e adicione novamente qualquer fita antiga.');
      const response = await window.LocadoraAccount.request('/v1/rentals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ titles }) });
      if (!state.member.signedIn || sessionVersion !== memberSessionVersion) return;
      const rental = validateRentalResponse(response, titles);
      pendingRental = false;
      state.counter = [];
      balconySelection = null;
      state.rental.rented = rental?.rental ? { id: rental.rental.id, titles: (rental.rental.items || []).map(localRentalTitle) } : state.rental.rented;
      saveCounter();
      renderBalconyPanel();
      refreshBalcony();
      showRentalConfirmation(rental);
      try { await refreshMemberData(); }
      catch {
        $('#rental-confirmation-status').textContent += ' O pacote foi registrado; Minha conta será sincronizada quando a conexão voltar.';
      }
    } catch (error) {
      pendingRental = false;
      $('#balcony-panel-status').textContent = error.message;
      openRentalDesk();
    } finally {
      rentalRequestInFlight = false;
      renderBalconyPanel();
    }
  }

  async function resumePendingRental() {
    if (!pendingRental || !state.member.signedIn || !counterDecisionTitles().length || rentalRequestInFlight) return;
    if (!state.member.profile) {
      openAccount('Falta só escolher seu nome público para confirmar este pacote.');
      return;
    }
    if ($('#account-dialog').open) $('#account-dialog').close();
    await rentCounter();
  }

  async function returnSelectedRentals() {
    if (!pendingReturns.size || returnRequestInFlight) return;
    const button = $('#return-selected-rentals');
    returnRequestInFlight = true;
    button.disabled = true;
    button.textContent = 'Devolvendo pacote…';
    try {
      requireMember();
      const sessionVersion = memberSessionVersion;
      const entries = [...pendingReturns.entries()].map(([itemId, entry]) => ({ itemId, watchedStatus: entry.watchedStatus }));
      const result = await submitRentalReturns(entries, (itemId, watchedStatus) => {
        if (!state.member.signedIn || sessionVersion !== memberSessionVersion) throw new Error('rental_session_changed');
        return window.LocadoraAccount.request(`/v1/rental-items/${itemId}/return`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ watchedStatus }),
        });
      });
      if (!state.member.signedIn || sessionVersion !== memberSessionVersion) return;
      for (const itemId of result.succeeded) pendingReturns.delete(itemId);
      const succeeded = new Set(result.succeeded);
      const rented = state.rental.rented;
      if (rented && succeeded.size) {
        rented.titles = rented.titles.filter((title) => !succeeded.has(title.rentalItemId));
        if (!rented.titles.length) state.rental.rented = null;
        saveCounter();
        renderAccountOverview();
        renderBalconyPanel();
        refreshBalcony();
      }
      let syncFailed = false;
      try { await refreshMemberData(); }
      catch { syncFailed = true; }
      $('#balcony-panel-status').textContent = (result.failed.length
        ? `${result.succeeded.length} fitas devolvidas; ${result.failed.length} não puderam ser devolvidas. As pendentes continuam marcadas para tentar de novo.`
        : 'Devolução registrada. As fitas voltaram para o acervo.')
        + (syncFailed ? ' Minha conta será sincronizada quando a conexão voltar.' : '');
    } catch (error) {
      $('#balcony-panel-status').textContent = error.message;
    } finally {
      returnRequestInFlight = false;
      button.disabled = false;
      renderReturnButton();
    }
  }

  function togglePendingReturn(title, checked) {
    if (!title.rentalItemId) return;
    const itemId = title.rentalItemId;
    if (checked) pendingReturns.set(itemId, { title, watchedStatus: pendingReturns.get(itemId)?.watchedStatus || 'unknown' });
    else pendingReturns.delete(itemId);
    renderReturnButton();
  }

  function updatePendingReturnStatus(title, watchedStatus) {
    if (!title.rentalItemId || !pendingReturns.has(title.rentalItemId)) return;
    pendingReturns.set(title.rentalItemId, { title, watchedStatus });
  }

  function renderReturnButton() {
    const button = $('#return-selected-rentals');
    if (!button) return;
    button.hidden = !state.rental.rented?.titles.length;
    button.disabled = !pendingReturns.size || returnRequestInFlight;
    button.textContent = returnRequestInFlight ? 'Devolvendo pacote…' : pendingReturns.size ? `Devolver ${pendingReturns.size} ${pendingReturns.size === 1 ? 'fita selecionada' : 'fitas selecionadas'}` : 'Devolver fitas selecionadas';
  }

  function openReturnDesk() {
    if ($('#account-dialog').open) $('#account-dialog').close();
    if (state.mode === 'immersive') {
      setMode('balcony');
      window.requestAnimationFrame(openRentalDesk);
      return;
    }
    openRentalDesk();
  }

  function showRentalConfirmation(rental) {
    const dialog = $('#rental-confirmation-dialog');
    const list = $('#rental-confirmation-list');
    const titles = state.rental.rented?.titles || (rental?.rental?.items || []).map(localRentalTitle);
    $('#rental-confirmation-status').textContent = `${titles.length} ${titles.length === 1 ? 'fita está' : 'fitas estão'} no seu pacote ativo. Boa sessão — você pode devolver tudo no Balcão depois.`;
    list.replaceChildren(...titles.map((title) => accountTitleItem(title, 'na sacola')));
    if ($('#balcony-dialog').open) $('#balcony-dialog').close();
    if (!dialog.open) dialog.showModal();
  }

  async function mountBalconyFallback(stage) {
    const { createTapeFallback } = await import('./tape-fallback.mjs');
    const rental = balconyRentalState();
    const titles = rental.counter;
    balcony = createTapeFallback({
      container: stage,
      titles,
      heading: 'Balcão · tape fronts',
      onSelect: (title, posterUrl) => openTitle(title, true, posterUrl),
      onAction: openRentalDesk,
      onSearch: openBalconySearch,
      actionLabel: state.locale === 'pt-BR' ? 'Abrir controles do balcão' : 'Open counter controls',
    });
  }

  async function mountBalcony() {
    const stage = $('#balcony-stage');
    balcony?.dispose();
    stage.textContent = '';
    try {
      const { createBalcony } = await import('./balcony.mjs');
      if (state.mode !== 'balcony') return;
      balcony = createBalcony({
        container: stage,
        rental: balconyRentalState(),
        year: state.year,
        copy: { collectiveAwards: t('collectiveAwards'), collectiveAwardLines: [t('collectiveAwardOne'), t('collectiveAwardTwo'), t('collectiveAwardThree')] },
        onCounterSelect: openRentalDesk,
        onSearch: openBalconySearch,
        onTitleSelect: (title) => { if (title) openTitle(title, true, posterTextureUrl(title.poster || posterFallback(title))); },
        onBagSelect: openRentalDesk,
        onTip: () => { openRentalDesk(); $('#balcony-panel-status').textContent = state.locale === 'pt-BR' ? 'Obrigado por manter as luzes acesas. Apoio é sempre opcional.' : 'Thank you for keeping the lights on. Support is always optional.'; },
        onCollectiveAwards: () => { openRentalDesk(); $('#balcony-panel-status').textContent = t('collectiveAwardsNotice'); },
      });
    } catch (error) {
      try { await mountBalconyFallback(stage); }
      catch { stage.textContent = `The Balcony could not be loaded: ${error.message}`; }
    }
  }

  function refreshBalcony() { if (state.mode === 'balcony') mountBalcony(); }

  function openRentalDesk() {
    if (balconySelection === null) beginCounterDecision();
    renderBalconyPanel();
    if (!$('#balcony-dialog').open) $('#balcony-dialog').showModal();
  }

  function renderBalconyPanel() {
    const counterList = $('#balcony-counter-list');
    const rentedList = $('#balcony-rented-list');
    counterList.replaceChildren(); rentedList.replaceChildren();
    const rented = state.rental.rented;
    $('#balcony-context').textContent = state.mode === 'balcony' ? 'BALCÃO · SALA 3D' : 'BALCÃO · ATENDIMENTO 2D';
    $('#tip-jar').hidden = state.mode !== 'balcony';
    $('#balcony-rental-controls').hidden = false;
    $('#balcony-return-controls').hidden = !rented;
    if (!rented) pendingReturns.clear();
    else {
      const activeIds = new Set(rented.titles.map((title) => title.rentalItemId).filter(Boolean));
      for (const itemId of pendingReturns.keys()) if (!activeIds.has(itemId)) pendingReturns.delete(itemId);
    }
    const decisionTitles = counterDecisionTitles();
    const capacity = decisionTitles.length;
    const available = availableRentalSlots();
    const rentButton = $('#rent-counter');
    rentButton.disabled = !capacity || capacity > available || rentalRequestInFlight;
    rentButton.textContent = rentalRequestInFlight ? 'Registrando pacote…' : !available ? 'Devolva uma fita para alugar outra' : capacity > available ? `Escolha até ${available} ${available === 1 ? 'fita' : 'fitas'} agora` : `Alugar pacote · ${capacity} ${capacity === 1 ? 'fita' : 'fitas'}`;
    $('#rental-capacity').textContent = `${capacity} na decisão · ${available} ${available === 1 ? 'vaga' : 'vagas'} de aluguel`;
    const flowSteps = [...document.querySelectorAll('.rental-flow li')];
    flowSteps.forEach((step, index) => step.classList.toggle('is-current', capacity ? index === 1 : rented ? index === 2 : index === 0));
    $('#balcony-panel-status').textContent = capacity
      ? !available
        ? 'Você já está com 3 fitas alugadas. Devolva uma fita antes de registrar outra.'
        : capacity > available
          ? `${capacity} fitas continuam na sua decisão. Para alugar agora, deixe no máximo ${available}.`
          : `${capacity} ${capacity === 1 ? 'fita chegou' : 'fitas chegaram'} ao balcão. Você ainda ficará com no máximo 3 fitas ativas.`
      : rented
        ? `${rented.titles.length} de 3 fitas estão no seu pacote ativo. Você pode montar outra decisão enquanto houver vagas.`
        : 'Pesquise um título no Balcão ou escolha fitas nas estantes. Depois use a Cesta para decidir o que levar.';
    if (!capacity) counterList.textContent = 'Nenhuma fita nesta decisão. Pesquisar título no Balcão.';
    decisionTitles.forEach((title) => {
      const item = document.createElement('article'); item.className = 'counter-item basket-item';
      const image = document.createElement('img'); image.alt = ''; image.src = title.poster ? posterTextureUrl(title.poster) : COVER_PLACEHOLDER_URL; image.addEventListener('error', () => { image.src = COVER_PLACEHOLDER_URL; }, { once: true });
      const text = document.createElement('div'); const name = document.createElement('strong'); name.textContent = title.name; const meta = document.createElement('span'); meta.textContent = `${title.year || '—'} · ${title.type === 'series' ? 'Série' : 'Filme'}`; text.append(name, meta);
      const actions = document.createElement('div'); actions.className = 'return-choices';
      const inspect = document.createElement('button'); inspect.type = 'button'; inspect.textContent = 'Ver fita'; inspect.addEventListener('click', () => openTitle(title));
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Não levar'; remove.addEventListener('click', () => removeFromCounterDecision(title));
      actions.append(inspect, remove); item.append(image, text, actions); counterList.append(item);
    });
    if (!rented) { rentedList.textContent = 'Nenhum pacote alugado agora.'; renderReturnButton(); return; }
    rented.titles.forEach((title) => {
      const item = document.createElement('article'); item.className = 'counter-item balcony-return-item';
      const selected = Boolean(title.rentalItemId && pendingReturns.has(title.rentalItemId));
      const checkId = `return-${title.rentalItemId || title.id}`.replace(/[^a-zA-Z0-9_-]/g, '-');
      const text = document.createElement('div');
      const label = document.createElement('label'); label.setAttribute('for', checkId);
      const checkbox = document.createElement('input'); checkbox.id = checkId; checkbox.type = 'checkbox'; checkbox.checked = selected; checkbox.disabled = !title.rentalItemId || returnRequestInFlight;
      const name = document.createElement('strong'); name.textContent = title.name;
      const meta = document.createElement('span'); meta.textContent = `${title.year || '—'} · na sacola`;
      label.append(checkbox, name); text.append(label, meta);
      const choices = document.createElement('div'); choices.className = 'return-choices';
      const statusSelect = document.createElement('select'); statusSelect.disabled = !selected || returnRequestInFlight;
      statusSelect.setAttribute('aria-label', `Estado de exibição de ${title.name}`);
      [['watched', 'Assistida'], ['not_watched', 'Não assistida'], ['unknown', 'Não sei']].forEach(([value, labelText]) => { const option = document.createElement('option'); option.value = value; option.textContent = labelText; statusSelect.append(option); });
      statusSelect.value = pendingReturns.get(title.rentalItemId)?.watchedStatus || 'unknown';
      checkbox.addEventListener('change', () => {
        statusSelect.disabled = !checkbox.checked;
        togglePendingReturn(title, checkbox.checked);
      });
      statusSelect.addEventListener('change', (event) => updatePendingReturnStatus(title, event.currentTarget.value));
      choices.append(statusSelect);
      item.append(text, choices); rentedList.append(item);
    });
    renderReturnButton();
  }

  async function openTitle(title, hydrate = true, posterUrl = posterTextureUrl(title.poster || posterFallback(title))) {
    const detail = $('#title-detail');
    const token = ++viewerToken;
    activeViewerTitle = title;
    detail.dataset.titleKey = `${title.type}:${title.id}`;
    if (activeVhsViewer) {
      if (!titleDialog.open) titleDialog.showModal();
      activeVhsViewer.update(title, isAtCounter(title), vhsAssets(title, posterUrl));
      syncTitleBasketAction();
      if (hydrate) loadTitleMetadata(title).then(() => {
        if (token === viewerToken && titleDialog.open && detail.dataset.titleKey === `${title.type}:${title.id}`) activeVhsViewer?.update(title, isAtCounter(title), vhsAssets(title, posterUrl));
      }).catch(() => {});
      return;
    }
    detail.className = 'title-detail';
    detail.replaceChildren();
    const stage = document.createElement('div');
    stage.className = 'vhs-stage';
    const controls = document.createElement('div');
    controls.className = 'vhs-focus-controls';
    for (const [method, label] of [['zoomOut', '−'], ['focusFront', 'Front'], ['focusWhole', 'Whole case'], ['focusBack', 'Back'], ['zoomIn', '+']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-label', label === '−' ? 'Zoom out' : label === '+' ? 'Zoom in' : label);
      button.addEventListener('click', () => activeVhsViewer?.[method]());
      controls.append(button);
    }
    stage.append(controls);
    const memberActions = document.createElement('div');
    memberActions.className = 'title-member-actions';
    const basket = document.createElement('button');
    basket.type = 'button'; basket.className = 'title-basket-action'; basket.textContent = 'Botar na cesta';
    basket.addEventListener('click', () => {
      const current = activeViewerTitle;
      if (!current) return;
      toggleCounter(current);
      activeVhsViewer?.update(current, isAtCounter(current), vhsAssets(current, posterTextureUrl(current.poster || posterFallback(current))));
    });
    const save = document.createElement('button');
    save.type = 'button'; save.textContent = 'Guardar na lista'; save.addEventListener('click', () => saveWatchlist(activeViewerTitle));
    memberActions.append(basket, save); stage.append(memberActions);
    detail.append(stage);
    syncTitleBasketAction();
    if (!titleDialog.open) titleDialog.showModal();

    try {
      const { createVhsViewer } = await import('./vhs-3d.mjs');
      if (token !== viewerToken || !titleDialog.open) return;
      activeVhsViewer = createVhsViewer({
        container: stage,
        title,
        ...vhsAssets(title, posterUrl),
        copy: getCopy(state.locale),
        atCounter: isAtCounter(title),
        onCounter: () => {
          const current = activeViewerTitle;
          if (!current) return;
          toggleCounter(current);
          activeVhsViewer?.update(current, isAtCounter(current), vhsAssets(current, posterTextureUrl(current.poster || posterFallback(current))));
        },
        onAvailability: () => {
          const url = activeViewerTitle?.availabilityBR?.link;
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
        },
        onWatch: () => { if (activeViewerTitle) window.location.href = createStremioUri(activeViewerTitle); },
        onLetterboxd: () => { if (activeViewerTitle) window.open(createLetterboxdUrl(activeViewerTitle), '_blank', 'noopener,noreferrer'); },
        onImdb: () => { if (activeViewerTitle) window.open(createImdbUrl(activeViewerTitle), '_blank', 'noopener,noreferrer'); },
        onClose: () => titleDialog.close(),
      });
    } catch (error) {
      if (token !== viewerToken) return;
      stage.classList.add('vhs-stage-error');
      const notice = document.createElement('p'); notice.textContent = `The 3D tape could not be loaded: ${error.message}`;
      stage.replaceChildren(notice, memberActions);
      return;
    }

    if (hydrate) {
      loadTitleMetadata(title).then(() => {
        if (titleDialog.open && detail.dataset.titleKey === `${title.type}:${title.id}`) activeVhsViewer?.update(title, isAtCounter(title), vhsAssets(title, posterUrl));
      }).catch(() => {});
    }
  }

  function renderBasket() {
    const list = $('#basket-list');
    list.replaceChildren();
    const available = availableRentalSlots();
    $('#basket-status').textContent = !available
      ? 'Você já está com 3 fitas alugadas. Devolva uma fita antes de levar outra ao Balcão.'
      : state.counter.length
        ? `${state.counter.length} de ${MAX_CESTA_TITLES} fitas escolhidas. Você ainda pode alugar ${available} ${available === 1 ? 'fita' : 'fitas'} agora.`
        : `Sua cesta está vazia. Escolha até ${MAX_CESTA_TITLES} fitas nas estantes.`;
    $('#take-basket-counter').disabled = !state.counter.length || !available;
    if (!state.counter.length) return;
    state.counter.forEach((title) => {
      const item = document.createElement('article');
      item.className = 'counter-item';
      const image = document.createElement('img');
      image.src = title.poster ? posterTextureUrl(title.poster) : COVER_PLACEHOLDER_URL;
      image.addEventListener('error', () => { image.src = COVER_PLACEHOLDER_URL; }, { once: true });
      image.alt = '';
      const text = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = title.name;
      const meta = document.createElement('span');
      meta.textContent = `${title.year || 'Ano desconhecido'} · ${title.type === 'series' ? 'série' : 'filme'}`;
      text.append(name, meta);
      const actions = document.createElement('div');
      actions.className = 'counter-item-actions';
      const inspect = document.createElement('button');
      inspect.type = 'button';
      inspect.textContent = 'Ver fita';
      inspect.addEventListener('click', () => openTitle(title));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Tirar';
      remove.setAttribute('aria-label', `Tirar ${title.name} da cesta`);
      remove.addEventListener('click', () => toggleCounter(title));
      actions.append(inspect, remove);
      item.append(image, text, actions);
      list.append(item);
    });
  }

  function openBasket() {
    balconySelection = null;
    renderBasket();
    if (!$('#basket-dialog').open) $('#basket-dialog').showModal();
  }

  function takeBasketToCounter() {
    if (!state.counter.length || !availableRentalSlots()) return;
    beginCounterDecision();
    const fromImmersive = state.mode === 'immersive';
    $('#basket-dialog').close();
    if (fromImmersive) setMode('balcony');
    else openRentalDesk();
  }

  async function renderSources() {
    const list = $('#source-list');
    list.textContent = 'Checking sources…';
    try {
      const { sources } = await api('/api/sources');
      list.replaceChildren(...sources.map((source) => {
        const item = document.createElement('article');
        item.className = 'source-item';
        const text = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = source.name;
        const detail = document.createElement('span');
        detail.textContent = `${source.catalogs.length} usable catalogues · ${source.id}`;
        text.append(name, detail);
        const status = document.createElement('span');
        status.textContent = 'Connected';
        item.append(text, status);
        return item;
      }));
    } catch (error) { list.textContent = error.message; }
  }

  function wireEvents() {
    const genreSelect = $('#genre-select');
    const immersiveGenreSelect = $('#immersive-genre-select');
    genres.forEach((genre, index) => {
      for (const select of [genreSelect, immersiveGenreSelect]) {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = genreLabel(genre);
        select.append(option);
      }
    });
    genreSelect.value = String(state.genreIndex);
    immersiveGenreSelect.value = String(state.genreIndex);
    $('#locale-select').addEventListener('change', (event) => {
      state.locale = normalizeLocale(event.currentTarget.value);
      localStorage.setItem('locadora.locale', state.locale);
      applyLocale();
      loadShelf();
    });
    applyLocale(false);
    $('#immersive-year-input').value = state.year;
    syncProviderControls();
    syncLightingControls();
    $('#year-back').addEventListener('click', () => stepYear(-1));
    $('#year-forward').addEventListener('click', () => stepYear(1));
    $('#year-form').addEventListener('submit', (event) => {
      event.preventDefault();
      setYear($('#store-year-input').value);
    });
    genreSelect.addEventListener('change', (event) => selectGenre(Number(event.currentTarget.value)));
    $('#normal-filters-toggle').addEventListener('click', () => setNormalFilters($('#normal-provider-filters').hidden));
    $('#immersive-go').addEventListener('click', applyImmersiveFilters);
    $('#provider-checkboxes').addEventListener('change', () => setProviders(selectedProviderIds($('#provider-checkboxes'))));
    $('#ignore-store-year').addEventListener('change', (event) => setIgnoreStoreYear(event.currentTarget.checked));
    $('#immersive-ignore-store-year').addEventListener('change', (event) => {
      $('#immersive-ignore-store-year').checked = event.currentTarget.checked;
    });
    $('#immersive-toggle').addEventListener('click', () => setMode(state.mode === 'immersive' ? 'normal' : 'immersive'));
    $('#normal-mode-return').addEventListener('click', () => setMode('normal'));
    $('#balcony-toggle').addEventListener('click', () => setMode('balcony'));
    $('#balcony-return-shelf').addEventListener('click', () => setMode('immersive'));
    $('#balcony-panel-open').addEventListener('click', openRentalDesk);
    $('#balcony-search-form').addEventListener('submit', (event) => { event.preventDefault(); searchBalconyCatalogue(); });
    $('#balcony-zoom-in').addEventListener('click', () => balcony?.zoomIn());
    $('#balcony-zoom-out').addEventListener('click', () => balcony?.zoomOut());
    $('#rent-counter').addEventListener('click', rentCounter);
    $('#return-selected-rentals').addEventListener('click', returnSelectedRentals);
    $('#rental-confirmation-dialog').addEventListener('close', () => setMode('normal'));
    $('#rental-confirmation-dialog').addEventListener('cancel', (event) => event.preventDefault());
    $('#tip-jar').addEventListener('click', () => { $('#balcony-panel-status').textContent = state.locale === 'pt-BR' ? 'Obrigado por manter as luzes acesas. Apoio é sempre opcional.' : 'Thank you for keeping the lights on. Support is always optional.'; });
    $('#immersive-hud-toggle').addEventListener('click', () => setImmersiveHudCollapsed(!$('#immersive-hud').classList.contains('is-collapsed')));
    $('#immersive-filters-toggle').addEventListener('click', () => {
      setImmersiveFilters($('#immersive-filters').hidden);
    });
    $('#immersive-settings-toggle').addEventListener('click', () => {
      setImmersiveSettings($('#immersive-settings').hidden);
    });
    $('#immersive-zoom-in').addEventListener('click', () => immersiveShelf?.zoomIn());
    $('#immersive-zoom-out').addEventListener('click', () => immersiveShelf?.zoomOut());
    $('#ambience-toggle').addEventListener('click', () => toggleStoreAudio('ambience', '#ambience-toggle', 'Ambience on', 'Store ambience'));
    $('#music-toggle').addEventListener('click', () => toggleStoreAudio('music', '#music-toggle', 'Music on', 'Store music'));
    $('#music-track').addEventListener('change', selectMusicTrack);
    $('#ambience-volume').addEventListener('input', () => setStoreAudioVolume('ambience', '#ambience-volume', '#ambience-volume-value'));
    $('#music-volume').addEventListener('input', () => setStoreAudioVolume('music', '#music-volume', '#music-volume-value'));
    $('#lamp-brightness').addEventListener('input', (event) => setLighting({ ...state.lighting, brightness: event.currentTarget.value }));
    $('#lamp-warmth').addEventListener('input', (event) => setLighting({ ...state.lighting, warmth: event.currentTarget.value }));
    $('#lamp-reset').addEventListener('click', () => setLighting(DEFAULT_LIGHTING));
    $('#immersive-previous-stand').addEventListener('click', goToPreviousStand);
    $('#immersive-next-stand').addEventListener('click', goToNextStand);

    document.querySelectorAll('[data-type]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.type === state.type);
      button.addEventListener('click', () => selectType(button.dataset.type));
    });
    titleDialog.addEventListener('close', () => {
      viewerToken += 1;
      if (!returnToBalconySearch) return;
      returnToBalconySearch = false;
      window.requestAnimationFrame(() => openBalconySearch(true));
    });
    $('#counter-open').addEventListener('click', openBasket);
    $('#counter-search').addEventListener('click', openBalconySearch);
    $('#immersive-basket-open').addEventListener('click', openBasket);
    $('#take-basket-counter').addEventListener('click', takeBasketToCounter);
    $('#account-return-counter').addEventListener('click', openReturnDesk);
    $('#watchlist-open').addEventListener('click', openWatchlist);
    $('#balcony-watchlist-open').addEventListener('click', openWatchlist);
    $('#immersive-account-open').addEventListener('click', () => openAccount());
    $('#balcony-account-open').addEventListener('click', () => openAccount());
    $('#account-open').addEventListener('click', () => openAccount());
    $('#account-sign-in').addEventListener('click', async () => {
      $('#account-dialog').close();
      try { await window.LocadoraAccount.signIn(); }
      catch (error) { openAccount(error.message); }
    });
    $('#account-sign-out').addEventListener('click', async () => {
      try { await window.LocadoraAccount.signOut(); $('#account-dialog').close(); }
      catch (error) { $('#account-status').textContent = error.message; }
    });
    $('#username-input').addEventListener('input', (event) => {
      window.clearTimeout(usernameAvailabilityTimer);
      const username = event.currentTarget.value;
      usernameAvailabilityTimer = window.setTimeout(() => checkUsernameAvailability(username), 250);
    });
    $('#username-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = $('#username-input');
      try {
        const { profile } = await window.LocadoraAccount.request('/v1/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: input.value }) });
        state.member.profile = profile;
        $('#username-availability').textContent = 'Nome público salvo.';
        renderAccount();
        await refreshMemberData();
        await resumePendingRental();
      } catch (error) { $('#account-status').textContent = error.message; }
    });
    $('#account-history-more').addEventListener('click', loadMoreAccountHistory);
    if (window.locadoraIsPublic) {
      $('#sources-open').hidden = true;
    } else {
      $('#sources-open').addEventListener('click', () => { renderSources(); sourcesDialog.showModal(); });
      $('#source-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const message = $('#source-message');
        const button = form.querySelector('button');
        message.textContent = 'Checking manifest…';
        button.disabled = true;
        try {
          const data = Object.fromEntries(new FormData(form));
          const { source } = await api('/api/sources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
          form.reset();
          message.textContent = `${source.name} connected.`;
          await renderSources();
          loadShelf();
        } catch (error) { message.textContent = error.message; }
        finally { button.disabled = false; }
      });
    }
    $('#retry-shelf').addEventListener('click', loadShelf);
    $('#load-more-shelf').addEventListener('click', goToNextStand);
    for (const dialog of document.querySelectorAll('dialog')) {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog && dialog.id !== 'rental-confirmation-dialog') dialog.close();
      });
    }
  }

  wireEvents();
  initMemberAccount();
  window.addEventListener('pagehide', disposeVhsViewer, { once: true });
  loadProviderRegistry();
  saveCounter();
  setYear(state.year);
})();
