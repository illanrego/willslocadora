import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyGuestRentalState,
  guestTitleKey,
  loadGuestRentalState,
  MAX_BASKET_TITLES,
  rentGuestTitles,
  returnGuestTitles,
  saveGuestRentalState,
  toggleGuestBasket,
} from '../tv/samsung/src/guest-rental.mjs';

const title = (id) => ({ id: `tmdb:${id}`, type: 'movie', name: `Filme ${id}`, year: 1999, poster: `https://image.test/${id}.jpg` });

test('TV guest basket stores distinct title snapshots up to fifteen', () => {
  let state = emptyGuestRentalState();
  for (let id = 1; id <= MAX_BASKET_TITLES; id += 1) state = toggleGuestBasket(state, title(id)).state;
  assert.equal(state.basket.length, 15);
  const full = toggleGuestBasket(state, title(16));
  assert.equal(full.changed, false);
  assert.equal(full.reason, 'basket_full');
  const removed = toggleGuestBasket(state, title(1));
  assert.equal(removed.changed, true);
  assert.equal(removed.added, false);
  assert.equal(removed.state.basket.length, 14);
});

test('TV rental accepts one to three basket titles and blocks a second package', () => {
  let state = emptyGuestRentalState();
  for (let id = 1; id <= 5; id += 1) state = toggleGuestBasket(state, title(id)).state;
  const rented = rentGuestTitles(state, [guestTitleKey(title(1)), guestTitleKey(title(2)), guestTitleKey(title(3)), guestTitleKey(title(4))], new Date('2026-09-19T12:00:00Z'));
  assert.equal(rented.changed, true);
  assert.equal(rented.state.activeRental.titles.length, 3);
  assert.equal(rented.state.basket.length, 2);
  assert.equal(toggleGuestBasket(rented.state, title(6)).reason, 'active_rental');
  assert.equal(rentGuestTitles(rented.state, [guestTitleKey(title(4))]).reason, 'active_rental');
});

test('TV returns preserve watched status and close the package after its last tape', () => {
  let state = emptyGuestRentalState();
  state = toggleGuestBasket(state, title(1)).state;
  state = toggleGuestBasket(state, title(2)).state;
  state = rentGuestTitles(state, [guestTitleKey(title(1)), guestTitleKey(title(2))], new Date('2026-09-19T12:00:00Z')).state;
  state = returnGuestTitles(state, [{ key: guestTitleKey(title(1)), watchedStatus: 'watched' }], new Date('2026-09-20T12:00:00Z')).state;
  assert.equal(state.activeRental.titles.length, 1);
  assert.equal(state.returned[0].watchedStatus, 'watched');
  state = returnGuestTitles(state, [{ key: guestTitleKey(title(2)), watchedStatus: 'not_watched' }], new Date('2026-09-21T12:00:00Z')).state;
  assert.equal(state.activeRental, null);
  assert.deepEqual(state.returned.map((item) => item.watchedStatus), ['watched', 'not_watched']);
});

test('TV state persistence is versioned, sanitized, and restores inspector state', () => {
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
  const original = {
    ...emptyGuestRentalState(),
    basket: [title(1), title(1), { nope: true }],
    lastView: { stand: 2, titleKey: guestTitleKey(title(1)), mode: 'immersive', inspectionOpen: true },
  };
  saveGuestRentalState(storage, original);
  const loaded = loadGuestRentalState(storage);
  assert.equal(loaded.version, 1);
  assert.equal(loaded.basket.length, 1);
  assert.deepEqual(loaded.lastView, { stand: 2, titleKey: guestTitleKey(title(1)), mode: 'immersive', inspectionOpen: true });
});
