function posterUrl(title) {
  const source = title.posterUrl || title.poster || title.background || '';
  return source ? window.locadoraPosterUrl(source) : '';
}

export function createTapeFallback({ container, titles = [], heading = 'Tape presentation', onSelect, onAction, actionLabel = 'Open controls' }) {
  const section = document.createElement('section');
  section.className = 'tape-fallback';
  const label = document.createElement('p');
  label.className = 'tape-fallback-note';
  label.textContent = '3D display unavailable — showing the tape fronts.';
  const title = document.createElement('h2');
  title.className = 'tape-fallback-heading';
  title.textContent = heading;
  const grid = document.createElement('div');
  grid.className = 'tape-fallback-grid';
  section.append(label, title);
  if (onAction) {
    const action = document.createElement('button');
    action.type = 'button'; action.className = 'tape-fallback-action'; action.textContent = actionLabel;
    action.addEventListener('click', onAction); section.append(action);
  }
  section.append(grid); container.replaceChildren(section);

  const render = (next = titles) => {
    titles = next || [];
    grid.replaceChildren(...titles.map((tape) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'tape-fallback-card';
      button.setAttribute('aria-label', `Inspect ${tape.name}`);
      const cover = document.createElement('img'); cover.alt = ''; cover.loading = 'lazy'; cover.src = posterUrl(tape);
      const front = document.createElement('span'); front.className = 'tape-fallback-front';
      const name = document.createElement('strong'); name.textContent = tape.name || 'Untitled';
      const year = document.createElement('small'); year.textContent = tape.year || '—';
      front.append(name, year); button.append(cover, front);
      button.addEventListener('click', () => onSelect?.(tape, posterUrl(tape)));
      return button;
    }));
  };
  render(titles);
  return { update: render, transition: render, setLoading: () => {}, setVisuals: () => {}, zoomIn: () => {}, zoomOut: () => {}, dispose: () => section.remove() };
}
