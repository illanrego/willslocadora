(() => {
  'use strict';

  const { clampStoreYear, createStremioUri } = window.LocadoraCore;
  const genres = [
    { label: 'Action & Adventure', genres: ['Action', 'Adventure'] },
    { label: 'Comedy', genres: ['Comedy'] },
    { label: 'Horror', genres: ['Horror'] },
    { label: 'Sci-Fi & Fantasy', genres: ['Sci-Fi', 'Fantasy'] },
    { label: 'Drama', genres: ['Drama'] },
    { label: 'Crime & Thriller', genres: ['Crime', 'Thriller', 'Mystery'] },
    { label: 'Romance', genres: ['Romance'] },
    { label: 'Family & Animation', genres: ['Family', 'Animation'] },
    { label: 'Documentary', genres: ['Documentary'] },
  ];
  const state = {
    year: clampStoreYear(localStorage.getItem('locadora.year') || 1999),
    genreIndex: Number(localStorage.getItem('locadora.genre')) || 0,
    type: localStorage.getItem('locadora.type') === 'series' ? 'series' : 'movie',
    titles: [],
    counter: loadCounter(),
    request: null,
    stand: 0,
    metadata: new Map(),
    renderedTitleKeys: new Set(),
    mode: 'normal',
    hasNextStand: false,
    standCache: new Map(),
  };

  const $ = (selector) => document.querySelector(selector);
  const shelf = $('#shelf');
  const emptyState = $('#empty-state');
  const titleDialog = $('#title-dialog');
  const counterDialog = $('#counter-dialog');
  const sourcesDialog = $('#sources-dialog');
  let activeVhsViewer = null;
  let viewerToken = 0;
  let immersiveShelf = null;
  let immersiveToken = 0;
  const storeAudio = window.LocadoraAudio?.createStoreAudio(state.year);

  function loadCounter() {
    try {
      const value = JSON.parse(localStorage.getItem('locadora.counter') || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function saveCounter() {
    localStorage.setItem('locadora.counter', JSON.stringify(state.counter));
    $('#counter-count').textContent = state.counter.length;
  }

  async function api(path, options) {
    const response = await fetch(path, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }


  function setYear(value, reload = true) {
    state.year = clampStoreYear(value);
    localStorage.setItem('locadora.year', state.year);
    $('#store-year-input').value = state.year;
    $('#immersive-year-input').value = state.year;
    storeAudio?.setYear(state.year).catch((error) => {
      $('#music-toggle').setAttribute('aria-pressed', 'false');
      $('#music-toggle').textContent = 'Store music';
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
    document.querySelectorAll('.genre-button').forEach((button, buttonIndex) => {
      button.classList.toggle('is-active', buttonIndex === index);
      button.setAttribute('aria-current', buttonIndex === index ? 'page' : 'false');
    });
    $('#aisle-number').textContent = String(index + 1).padStart(2, '0');
    $('#immersive-genre-select').value = String(index);
    if (reload) loadShelf();
  }

  function applyImmersiveFilters() {
    const year = $('#immersive-year-input').value;
    const genreIndex = Number($('#immersive-genre-select').value);
    const yearChanged = clampStoreYear(year) !== state.year;
    const genreChanged = genreIndex !== state.genreIndex;
    if (!yearChanged && !genreChanged) return;
    if (yearChanged) setYear(year, false);
    if (genreChanged) selectGenre(genreIndex, false);
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

  async function loadTitleMetadata(title) {
    const key = `${title.type}:${title.id}`;
    if (!state.metadata.has(key)) {
      state.metadata.set(key, api(`/api/meta?${new URLSearchParams({ type: title.type, id: title.id })}`)
        .then(({ meta }) => Object.assign(title, meta))
        .catch((error) => { state.metadata.delete(key); throw error; }));
    }
    return state.metadata.get(key);
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
    return `/api/poster?${new URLSearchParams({ url: source })}`;
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
    if (direction) immersiveShelf.transition(immersiveTitles(), genre.label, state.year, state.type, state.stand, direction);
    else immersiveShelf.update(immersiveTitles(), genre.label, state.year, state.type, state.stand);
    $('#immersive-status').textContent = state.titles.length ? `Stand ${state.stand + 1} · ${Math.min(state.titles.length, 40)} tapes` : 'This display is empty';
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
        genre: genre.label,
        year: state.year,
        type: state.type,
        stand: state.stand,
        onSelect: (title, posterUrl) => openTitle(title, true, posterUrl),
      });
      stage.querySelector('.immersive-canvas')?.focus();
      $('#immersive-status').textContent = state.titles.length ? `Stand ${state.stand + 1} · ${Math.min(state.titles.length, 40)} tapes` : 'This display is empty';
      syncImmersiveStandControls();
    } catch (error) {
      if (token !== immersiveToken) return;
      $('#immersive-status').textContent = `The immersive shelf could not be loaded: ${error.message}`;
    }
  }

  function setImmersiveSettings(open) {
    const expanded = state.mode === 'immersive' && Boolean(open);
    $('#immersive-settings').hidden = !expanded;
    const toggle = $('#immersive-settings-toggle');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Close sound' : 'Sound';
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
      $('#music-toggle').textContent = 'Store music';
      $('#immersive-status').textContent = error.message;
    }
  }

  function setStoreAudioVolume(channel, inputId, valueId) {
    const percent = Number($(inputId).value);
    storeAudio?.setVolume(channel, percent / 100);
    $(valueId).textContent = `${percent}%`;
  }

  function setMode(mode) {
    state.mode = mode === 'immersive' ? 'immersive' : 'normal';
    const immersive = state.mode === 'immersive';
    $('#normal-mode').hidden = immersive;
    $('#immersive-room').hidden = !immersive;
    document.body.classList.toggle('is-immersive', immersive);
    setImmersiveSettings(false);
    $('#immersive-toggle').textContent = immersive ? 'Normal mode' : 'Immersive mode';
    $('#immersive-toggle').setAttribute('aria-pressed', String(immersive));
    if (immersive) mountImmersive();
    else {
      immersiveToken += 1;
      immersiveShelf?.dispose();
      immersiveShelf = null;
      storeAudio?.stopAll();
      $('#ambience-toggle').setAttribute('aria-pressed', 'false');
      $('#ambience-toggle').textContent = 'Store ambience';
      $('#music-toggle').setAttribute('aria-pressed', 'false');
      $('#music-toggle').textContent = 'Store music';
      $('#immersive-stage').replaceChildren();
      $('#immersive-toggle').focus();
    }
  }

  async function loadShelf(stand = 0, append = false, transitionDirection = 0) {
    if (state.request) state.request.abort();
    const controller = new AbortController();
    state.request = controller;
    const genre = genres[state.genreIndex];
    const aisle = String(state.genreIndex + 1).padStart(2, '0');
    $('#shelf-title').textContent = genre.label;
    $('#shelf-caption').textContent = `Aisle ${aisle} · Store year ${state.year} · ${state.type === 'movie' ? 'Movies' : 'Series'}`;
    $('#shelf-status').textContent = append ? 'Opening another stand…' : 'Opening the boxes…';
    $('#immersive-status').textContent = append ? 'Opening another display…' : 'Opening the boxes…';
    $('#immersive-previous-stand').disabled = true;
    $('#immersive-next-stand').disabled = true;
    immersiveShelf?.setLoading(genre.label, state.year, state.type, stand);
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
      const params = new URLSearchParams({ genre: genre.genres.join(','), year: state.year, type: state.type, stand });
      const body = await api(`/api/shelf?${params}`, { signal: controller.signal });
      if (state.request !== controller) return;
      if (!append) state.renderedTitleKeys = new Set();
      const hasAnotherSourcePage = body.titles.length === 40;
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
      $('#shelf-status').textContent = append ? `${state.titles.length} more tapes loaded` : `${state.titles.length} tapes found`;
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

  function toggleCounter(title) {
    if (isAtCounter(title)) state.counter = state.counter.filter((item) => item.id !== title.id || item.type !== title.type);
    else state.counter.push(title);
    saveCounter();
    renderCounter();
  }

  async function openTitle(title, hydrate = true, posterUrl = posterTextureUrl(title.poster || posterFallback(title))) {
    const detail = $('#title-detail');
    const token = ++viewerToken;
    activeVhsViewer?.dispose();
    activeVhsViewer = null;
    detail.className = 'title-detail';
    detail.dataset.titleKey = `${title.type}:${title.id}`;
    detail.replaceChildren();
    const stage = document.createElement('div');
    stage.className = 'vhs-stage';
    detail.append(stage);
    if (!titleDialog.open) titleDialog.showModal();

    try {
      const { createVhsViewer } = await import('./vhs-3d.mjs');
      if (token !== viewerToken || !titleDialog.open) return;
      activeVhsViewer = createVhsViewer({
        container: stage,
        title,
        posterUrl,
        atCounter: isAtCounter(title),
        onCounter: () => {
          toggleCounter(title);
          activeVhsViewer?.update(title, isAtCounter(title));
        },
        onWatch: () => { window.location.href = createStremioUri(title); },
        onClose: () => titleDialog.close(),
      });
    } catch (error) {
      if (token !== viewerToken) return;
      stage.classList.add('vhs-stage-error');
      stage.textContent = `The 3D tape could not be loaded: ${error.message}`;
      return;
    }

    if (hydrate) {
      loadTitleMetadata(title).then(() => {
        if (titleDialog.open && detail.dataset.titleKey === `${title.type}:${title.id}`) activeVhsViewer?.update(title, isAtCounter(title));
      }).catch(() => {});
    }
  }

  function renderCounter() {
    const list = $('#counter-list');
    list.replaceChildren();
    if (!state.counter.length) {
      const empty = document.createElement('p');
      empty.className = 'panel-copy';
      empty.textContent = 'The counter is empty. Pick a tape from any aisle.';
      list.append(empty);
      return;
    }
    state.counter.forEach((title) => {
      const item = document.createElement('article');
      item.className = 'counter-item';
      const image = document.createElement('img');
      image.src = title.poster || posterFallback(title);
      image.alt = '';
      const text = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = title.name;
      const meta = document.createElement('span');
      meta.textContent = `${title.year || 'Year unknown'} · ${title.type}`;
      text.append(name, meta);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Return';
      remove.setAttribute('aria-label', `Return ${title.name} to shelf`);
      remove.addEventListener('click', () => toggleCounter(title));
      item.append(image, text, remove);
      item.addEventListener('dblclick', () => openTitle(title));
      list.append(item);
    });
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
    const genreNav = $('#genre-nav');
    const immersiveGenreSelect = $('#immersive-genre-select');
    genres.forEach((genre, index) => {
      const button = document.createElement('button');
      button.className = `genre-button${index === state.genreIndex ? ' is-active' : ''}`;
      button.type = 'button';
      button.textContent = genre.label;
      button.setAttribute('aria-current', index === state.genreIndex ? 'page' : 'false');
      button.addEventListener('click', () => selectGenre(index));
      genreNav.append(button);
      const option = document.createElement('option');
      option.value = index;
      option.textContent = genre.label;
      immersiveGenreSelect.append(option);
    });
    immersiveGenreSelect.value = String(state.genreIndex);
    $('#immersive-year-input').value = state.year;
    $('#year-back').addEventListener('click', () => stepYear(-1));
    $('#year-forward').addEventListener('click', () => stepYear(1));
    $('#year-form').addEventListener('submit', (event) => {
      event.preventDefault();
      setYear($('#store-year-input').value);
    });
    $('#immersive-filter-go').addEventListener('click', applyImmersiveFilters);
    $('#immersive-toggle').addEventListener('click', () => setMode(state.mode === 'immersive' ? 'normal' : 'immersive'));
    $('#normal-mode-return').addEventListener('click', () => setMode('normal'));
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
    $('#immersive-previous-stand').addEventListener('click', goToPreviousStand);
    $('#immersive-next-stand').addEventListener('click', goToNextStand);

    document.querySelectorAll('[data-type]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.type === state.type);
      button.addEventListener('click', () => selectType(button.dataset.type));
    });
    titleDialog.addEventListener('close', () => {
      viewerToken += 1;
      activeVhsViewer?.dispose();
      activeVhsViewer = null;
      $('#title-detail').replaceChildren();
    });
    $('#counter-open').addEventListener('click', () => { renderCounter(); counterDialog.showModal(); });
    $('#sources-open').addEventListener('click', () => { renderSources(); sourcesDialog.showModal(); });
    $('#retry-shelf').addEventListener('click', loadShelf);
    $('#load-more-shelf').addEventListener('click', goToNextStand);
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
    for (const dialog of document.querySelectorAll('dialog')) {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    }
  }

  wireEvents();
  saveCounter();
  setYear(state.year);
})();
