const PLACEHOLDER = '/images/wills-locadora-cover-placeholder.svg';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function image(src, className, alt = '') {
  const node = element('img', className);
  node.alt = alt;
  node.src = src || PLACEHOLDER;
  node.addEventListener('error', () => { node.src = PLACEHOLDER; }, { once: true });
  return node;
}

function list(value, fallback) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return values.map((item) => item.trim()).filter(Boolean).join(', ') || fallback;
}

export function createFlatVhsViewer({
  container, title, posterUrl, backdropUrl, atCounter, savedCollections = [], showSavedActions = false,
  showBlockAction = false, onCounter, onAvailability, onWatch, onLetterboxd, onImdb, onWatchLater,
  onFavorite, onBlock, copy = {},
}) {
  const root = element('section', 'flat-vhs-viewer');
  root.tabIndex = 0;
  let side = 'front';
  let currentTitle = title;
  let currentAssets = { posterUrl, backdropUrl };
  let currentAtCounter = atCounter;
  let currentSavedCollections = new Set(savedCollections);
  let currentShowBlockAction = showBlockAction;

  function button(label, className, action) {
    const node = element('button', className, label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  function show(nextSide, focus = false) {
    side = nextSide === 'back' ? 'back' : 'front';
    root.dataset.side = side;
    root.setAttribute('aria-label', `${currentTitle.name} · ${side === 'front' ? copy.viewFrontCover : copy.viewBackCover}`);
    root.querySelectorAll('.flat-vhs-page').forEach((page) => { page.hidden = page.dataset.side !== side; });
    if (focus) root.querySelector('.flat-vhs-flip')?.focus();
  }

  function renderFront() {
    const page = element('article', 'flat-vhs-page flat-vhs-front');
    page.dataset.side = 'front';
    const cover = image(currentAssets.posterUrl, 'flat-vhs-cover', `Capa de ${currentTitle.name}`);
    const caption = element('div', 'flat-vhs-front-caption');
    caption.append(
      element('strong', '', currentTitle.displayTitle || currentTitle.name),
      element('span', '', `${currentTitle.year || copy.yearUnknown || 'Ano desconhecido'} · ${String(currentTitle.type || copy.video || 'vídeo').toUpperCase()}`),
    );
    page.append(cover, caption, button(copy.viewBackCover || 'Ver contracapa', 'flat-vhs-flip', () => show('back', true)));
    return page;
  }

  function action(label, callback, className = '') {
    return button(label, `flat-vhs-action ${className}`.trim(), callback);
  }

  function renderBack() {
    const page = element('article', 'flat-vhs-page flat-vhs-back');
    page.dataset.side = 'back';
    const header = element('header', 'flat-vhs-back-header');
    const heading = element('div');
    heading.append(
      element('span', 'flat-vhs-kicker', "WILL'S LOCADORA · VIDEO ARCHIVE"),
      element('h2', '', currentTitle.displayTitle || currentTitle.name),
    );
    const barcode = element('span', 'flat-vhs-barcode', String(currentTitle.id || 'WILLS-LOCADORA').toUpperCase());
    header.append(heading, barcode);

    const media = element('div', 'flat-vhs-back-media');
    media.append(
      image(currentAssets.posterUrl, '', ''),
      image(currentAssets.backdropUrl || currentAssets.posterUrl, '', ''),
    );
    const runtime = Number(currentTitle.runtime);
    const metadata = [...(currentTitle.genres || []).slice(0, 3), currentTitle.imdbRating && `IMDb ★ ${currentTitle.imdbRating}`, Number.isSafeInteger(runtime) && runtime > 0 && `${runtime} min`, currentTitle.certificationBR && `BR ${currentTitle.certificationBR}`].filter(Boolean);
    const synopsis = element('section', 'flat-vhs-copy');
    synopsis.append(element('h3', '', copy.theStory || 'SINOPSE'), element('p', '', currentTitle.displayDescription || currentTitle.description || copy.noSynopsis || 'Sinopse não disponível.'));

    const providers = currentTitle.availabilityBR?.providers || [];
    const details = element('dl', 'flat-vhs-details');
    for (const [label, value] of [
      [copy.whereToWatchBrazil || 'STREAMINGS · BRASIL', providers.join(' · ') || copy.noProviderListing],
      [copy.directedBy || 'DIREÇÃO', list(currentTitle.director, copy.notListed)],
      [copy.writtenBy || 'ROTEIRO', list(currentTitle.writer, copy.notListed)],
      [copy.starring || 'ELENCO', list(currentTitle.cast, copy.notListed)],
    ]) details.append(element('dt', '', label), element('dd', '', value));

    const actions = element('div', 'flat-vhs-actions');
    actions.append(
      action(currentAtCounter ? copy.returnTape : copy.toBasket, onCounter, 'is-basket'),
      action(copy.watchOptions || 'VER STREAMINGS', onAvailability, 'is-streaming'),
      action(copy.stremio || 'STREMIO', onWatch),
      action('Letterboxd', onLetterboxd),
      action('IMDb', onImdb),
    );
    if (showSavedActions) {
      actions.append(
        action(currentSavedCollections.has('favorite') ? '★ Favorito' : '☆ Favoritos', onFavorite),
        action(currentSavedCollections.has('watch_later') ? '✓ Assistir depois' : '＋ Assistir depois', onWatchLater),
      );
    }
    if (currentShowBlockAction) actions.append(action(`× ${copy.removeFromShelf || 'RETIRAR DA PRATELEIRA'}`, onBlock, 'is-remove'));
    page.append(
      header,
      metadata.length ? element('p', 'flat-vhs-meta', metadata.join(' · ')) : document.createDocumentFragment(),
      media,
      synopsis,
      details,
      element('p', 'flat-vhs-disclaimer', copy.catalogueOnly || ''),
      actions,
      button(copy.viewFrontCover || 'Ver capa', 'flat-vhs-flip', () => show('front', true)),
    );
    return page;
  }

  function render() {
    root.replaceChildren(renderFront(), renderBack());
    show(side);
  }

  function keyDown(event) {
    if (event.target !== root || !['Enter', ' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    show(side === 'front' ? 'back' : 'front', true);
  }

  root.addEventListener('keydown', keyDown);
  container.append(root);
  render();
  root.focus({ preventScroll: true });

  return {
    focusWhole() { show(side === 'front' ? 'back' : 'front', true); },
    focusFront() { show('front', true); },
    focusBack() { show('back', true); },
    zoomIn() {},
    zoomOut() {},
    setSavedCollections(nextCollections) { currentSavedCollections = new Set(nextCollections); render(); },
    setBlockActionVisible(visible) { currentShowBlockAction = Boolean(visible); render(); },
    update(nextTitle, nextAtCounter, assets = {}, { preserveView = false } = {}) {
      currentTitle = nextTitle;
      currentAtCounter = nextAtCounter;
      currentAssets = { ...currentAssets, ...assets };
      if (!preserveView) side = 'front';
      render();
    },
    dispose() { root.removeEventListener('keydown', keyDown); root.remove(); },
  };
}
