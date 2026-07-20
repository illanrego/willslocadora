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


  function setYear(value) {
    state.year = clampStoreYear(value);
    localStorage.setItem('locadora.year', state.year);
    $('#store-year-input').value = state.year;
    loadShelf();
  }

  function stepYear(offset) {
    const input = $('#store-year-input');
    input.value = clampStoreYear(Number(input.value || state.year) + offset);
  }

  function selectGenre(index) {
    state.genreIndex = index;
    localStorage.setItem('locadora.genre', index);
    document.querySelectorAll('.genre-button').forEach((button, buttonIndex) => {
      button.classList.toggle('is-active', buttonIndex === index);
      button.setAttribute('aria-current', buttonIndex === index ? 'page' : 'false');
    });
    $('#aisle-number').textContent = String(index + 1).padStart(2, '0');
    $('#immersive-genre').textContent = genres[index].label;
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

  function refreshImmersive() {
    if (!immersiveShelf) return;
    const genre = genres[state.genreIndex];
    immersiveShelf.update(immersiveTitles(), genre.label, state.year, state.type);
    $('#immersive-status').textContent = state.titles.length ? `${Math.min(state.titles.length, 24)} tapes on this display` : 'This display is empty';
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
        onSelect: (title, posterUrl) => openTitle(title, true, posterUrl),
      });
      stage.querySelector('.immersive-canvas')?.focus();
      $('#immersive-status').textContent = state.titles.length ? `${Math.min(state.titles.length, 24)} tapes on this display` : 'This display is empty';
    } catch (error) {
      if (token !== immersiveToken) return;
      $('#immersive-status').textContent = `The immersive shelf could not be loaded: ${error.message}`;
    }
  }

  function setImmersiveHeader(open) {
    const expanded = state.mode === 'immersive' && Boolean(open);
    document.body.classList.toggle('immersive-header-open', expanded);
    const toggle = $('#immersive-header-toggle');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Hide header' : 'Header';
  }

  function setMode(mode) {
    state.mode = mode === 'immersive' ? 'immersive' : 'normal';
    const immersive = state.mode === 'immersive';
    $('#normal-mode').hidden = immersive;
    $('#immersive-room').hidden = !immersive;
    document.body.classList.toggle('is-immersive', immersive);
    setImmersiveHeader(false);
    $('#immersive-toggle').textContent = immersive ? 'Normal mode' : 'Immersive mode';
    $('#immersive-toggle').setAttribute('aria-pressed', String(immersive));
    if (immersive) mountImmersive();
    else {
      immersiveToken += 1;
      immersiveShelf?.dispose();
      immersiveShelf = null;
      $('#immersive-stage').replaceChildren();
      $('#immersive-toggle').focus();
    }
  }

  async function loadShelf(stand = 0, append = false) {
    if (state.request) state.request.abort();
    const controller = new AbortController();
    state.request = controller;
    const genre = genres[state.genreIndex];
    const aisle = String(state.genreIndex + 1).padStart(2, '0');
    $('#shelf-title').textContent = genre.label;
    $('#shelf-caption').textContent = `Aisle ${aisle} · Store year ${state.year} · ${state.type === 'movie' ? 'Movies' : 'Series'}`;
    $('#shelf-status').textContent = append ? 'Opening another stand…' : 'Opening the boxes…';
    $('#immersive-status').textContent = append ? 'Opening another display…' : 'Opening the boxes…';
    immersiveShelf?.setLoading(genre.label, state.year, state.type);
    shelf.hidden = false;
    shelf.setAttribute('aria-busy', 'true');
    emptyState.hidden = true;
    if (!append) {
      $('#load-more-shelf').hidden = true;
      renderSkeletons();
    }

    try {
      const params = new URLSearchParams({ genre: genre.genres.join(','), year: state.year, type: state.type, stand });
      const body = await api(`/api/shelf?${params}`, { signal: controller.signal });
      if (state.request !== controller) return;
      if (!append) state.renderedTitleKeys = new Set();
      const hasAnotherSourcePage = body.titles.length === 48;
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
      renderShelf(state.titles, stand, append);
      refreshImmersive();
      $('#shelf-status').textContent = append ? `${state.titles.length} more tapes loaded` : `${state.titles.length} tapes found`;
      $('#load-more-shelf').hidden = !hasAnotherSourcePage;
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (!append) state.titles = [];
      $('#shelf-status').textContent = error.message;
      $('#immersive-status').textContent = error.message;
      if (!append) showEmpty();
    } finally {
      if (state.request === controller) state.request = null;
      shelf.setAttribute('aria-busy', 'false');
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
    genres.forEach((genre, index) => {
      const button = document.createElement('button');
      button.className = `genre-button${index === state.genreIndex ? ' is-active' : ''}`;
      button.type = 'button';
      button.textContent = genre.label;
      button.setAttribute('aria-current', index === state.genreIndex ? 'page' : 'false');
      button.addEventListener('click', () => selectGenre(index));
      genreNav.append(button);
    });
    $('#year-back').addEventListener('click', () => stepYear(-1));
    $('#year-forward').addEventListener('click', () => stepYear(1));
    $('#year-form').addEventListener('submit', (event) => {
      event.preventDefault();
      setYear($('#store-year-input').value);
    });
    $('#immersive-toggle').addEventListener('click', () => setMode(state.mode === 'immersive' ? 'normal' : 'immersive'));
    $('#normal-mode-return').addEventListener('click', () => setMode('normal'));
    $('#immersive-header-toggle').addEventListener('click', () => {
      setImmersiveHeader(!document.body.classList.contains('immersive-header-open'));
    });
    $('#immersive-zoom-in').addEventListener('click', () => immersiveShelf?.zoomIn());
    $('#immersive-zoom-out').addEventListener('click', () => immersiveShelf?.zoomOut());
    $('#immersive-genre-back').addEventListener('click', () => selectGenre((state.genreIndex - 1 + genres.length) % genres.length));
    $('#immersive-genre-forward').addEventListener('click', () => selectGenre((state.genreIndex + 1) % genres.length));
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
    $('#load-more-shelf').addEventListener('click', () => loadShelf(state.stand + 1, true));
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
