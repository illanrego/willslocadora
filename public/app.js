(() => {
  'use strict';

  const { createStremioUri, createVhsLabel } = window.LocadoraCore;
  const genres = [
    { label: 'Action & Adventure', api: 'Action' },
    { label: 'Comedy', api: 'Comedy' },
    { label: 'Horror', api: 'Horror' },
    { label: 'Sci-Fi & Fantasy', api: 'Sci-Fi' },
    { label: 'Drama & Romance', api: 'Drama' },
    { label: 'Thriller / Mystery', api: 'Thriller' },
  ];
  const state = {
    year: Number(localStorage.getItem('locadora.year')) || 1999,
    genreIndex: Number(localStorage.getItem('locadora.genre')) || 0,
    type: localStorage.getItem('locadora.type') === 'series' ? 'series' : 'movie',
    titles: [],
    counter: loadCounter(),
    request: null,
    stand: 0,
    metadata: new Map(),
    renderedTitleKeys: new Set(),
  };

  const $ = (selector) => document.querySelector(selector);
  const shelf = $('#shelf');
  const emptyState = $('#empty-state');
  const titleDialog = $('#title-dialog');
  const counterDialog = $('#counter-dialog');
  const sourcesDialog = $('#sources-dialog');

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

  function people(value, limit) {
    const list = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);
    return list.map((item) => item.trim()).filter(Boolean).slice(0, limit).join(', ');
  }

  function setYear(value) {
    state.year = Math.max(1987, Math.min(1999, Number(value)));
    localStorage.setItem('locadora.year', state.year);
    $('#store-year').textContent = state.year;
    $('#year-range').value = state.year;
    loadShelf();
  }

  function selectGenre(index) {
    state.genreIndex = index;
    localStorage.setItem('locadora.genre', index);
    document.querySelectorAll('.genre-button').forEach((button, buttonIndex) => {
      button.classList.toggle('is-active', buttonIndex === index);
      button.setAttribute('aria-current', buttonIndex === index ? 'page' : 'false');
    });
    $('#aisle-number').textContent = String(index + 1).padStart(2, '0');
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
      button.addEventListener('click', () => openTitle(title));
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

  async function loadShelf(stand = 0, append = false) {
    if (state.request) state.request.abort();
    const controller = new AbortController();
    state.request = controller;
    const genre = genres[state.genreIndex];
    const aisle = String(state.genreIndex + 1).padStart(2, '0');
    $('#shelf-title').textContent = genre.label;
    $('#shelf-caption').textContent = `Aisle ${aisle} · Store year ${state.year} · ${state.type === 'movie' ? 'Movies' : 'Series'}`;
    $('#shelf-status').textContent = append ? 'Opening another stand…' : 'Opening the boxes…';
    shelf.hidden = false;
    shelf.setAttribute('aria-busy', 'true');
    emptyState.hidden = true;
    if (!append) {
      $('#load-more-shelf').hidden = true;
      renderSkeletons();
    }

    try {
      const params = new URLSearchParams({ genre: genre.api, year: state.year, type: state.type, stand });
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
        if (!append) showEmpty();
        else $('#load-more-shelf').hidden = !hasAnotherSourcePage;
        return;
      }
      state.stand = stand;
      renderShelf(state.titles, stand, append);
      $('#shelf-status').textContent = append ? `${state.titles.length} more tapes loaded` : `${state.titles.length} tapes found`;
      $('#load-more-shelf').hidden = !hasAnotherSourcePage;
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (!append) state.titles = [];
      $('#shelf-status').textContent = error.message;
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
    if (titleDialog.open) openTitle(title);
    renderCounter();
  }

  function openTitle(title, hydrate = true, playVhs = true) {
    const atCounter = isAtCounter(title);
    const detail = $('#title-detail');
    detail.className = 'title-detail';
    detail.dataset.titleKey = `${title.type}:${title.id}`;
    detail.innerHTML = '';

    const stage = document.createElement('div');
    stage.className = 'vhs-stage';
    const tape = document.createElement('div');
    tape.className = 'vhs-case-3d';
    const label = createVhsLabel(title);
    const front = document.createElement('div');
    front.className = 'vhs-case-face vhs-case-front';
    const cover = document.createElement('img');
    cover.src = title.poster || posterFallback(title);
    cover.alt = '';
    cover.addEventListener('error', () => { cover.src = posterFallback(title); }, { once: true });
    const labelText = document.createElement('span');
    labelText.className = 'vhs-front-label';
    const labelTitle = document.createElement('strong');
    labelTitle.textContent = label.title;
    const labelSubtitle = document.createElement('small');
    labelSubtitle.textContent = label.subtitle;
    labelText.append(labelTitle, labelSubtitle);
    front.append(cover, labelText);
    const back = document.createElement('div');
    back.className = 'vhs-case-face vhs-case-back';
    const backInner = document.createElement('div');
    backInner.className = 'vhs-back-label';
    const kicker = document.createElement('p');
    kicker.className = 'eyebrow';
    kicker.textContent = `${title.type === 'movie' ? 'Feature presentation' : 'Television series'} · ${title.source}`;
    const heading = document.createElement('h2');
    heading.textContent = title.name;
    const meta = document.createElement('p');
    meta.className = 'detail-meta';
    meta.textContent = [title.year, ...title.genres.slice(0, 3), title.imdbRating && `IMDb ★ ${title.imdbRating}`].filter(Boolean).join(' · ');
    const credits = document.createElement('dl');
    credits.className = 'detail-credits';
    credits.innerHTML = `<div><dt>Director</dt><dd></dd></div><div><dt>Writers</dt><dd></dd></div><div><dt>Starring</dt><dd></dd></div>`;
    const values = [people(title.director, 4), people(title.writer, 4), people(title.cast, 6)];
    credits.querySelectorAll('dd').forEach((item, index) => { item.textContent = values[index] || 'Not listed'; });
    const description = document.createElement('p');
    description.className = 'detail-description';
    description.textContent = title.description || 'No synopsis was included by this catalogue source.';
    const actions = document.createElement('div');
    actions.className = 'detail-actions';
    const counterButton = document.createElement('button');
    counterButton.type = 'button';
    counterButton.textContent = atCounter ? 'Return to shelf' : 'Take to counter';
    counterButton.addEventListener('click', () => toggleCounter(title));
    const watch = document.createElement('a');
    watch.className = 'watch-button';
    watch.href = createStremioUri(title);
    watch.textContent = 'Watch in Stremio →';
    watch.addEventListener('click', () => { watch.textContent = 'Opening Stremio…'; });
    actions.append(counterButton, watch);
    const rewind = document.createElement('small');
    rewind.className = 'rewind-sticker';
    rewind.textContent = 'Be kind · Rewind';
    backInner.append(kicker, heading, meta, credits, description, actions, rewind);
    back.append(backInner);
    tape.append(front, back);

    const flip = document.createElement('button');
    flip.className = 'flip-tape';
    flip.type = 'button';
    const setFlipped = (flipped) => {
      tape.classList.toggle('is-flipped', flipped);
      flip.textContent = flipped ? 'See front ↶' : 'See back ↷';
      flip.setAttribute('aria-label', `${flipped ? 'Show the front of' : 'Show information on the back of'} ${title.name}`);
    };
    flip.addEventListener('click', () => setFlipped(!tape.classList.contains('is-flipped')));
    front.addEventListener('click', () => setFlipped(true));
    stage.append(tape, flip);
    detail.append(stage);
    if (!titleDialog.open) titleDialog.showModal();
    if (playVhs) requestAnimationFrame(() => requestAnimationFrame(() => setFlipped(true)));
    else setFlipped(true);
    if (hydrate) {
      loadTitleMetadata(title).then(() => {
        if (titleDialog.open && detail.dataset.titleKey === `${title.type}:${title.id}`) openTitle(title, false, false);
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
    $('#year-back').addEventListener('click', () => setYear(state.year - 1));
    $('#year-forward').addEventListener('click', () => setYear(state.year + 1));
    $('#year-range').addEventListener('change', (event) => setYear(event.target.value));
    document.querySelectorAll('[data-type]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.type === state.type);
      button.addEventListener('click', () => selectType(button.dataset.type));
    });
    $('[data-close="title-dialog"]').addEventListener('click', () => titleDialog.close());
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
