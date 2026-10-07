import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountRentalStorage,
  emptyTvAccountState,
  loadTvAccountState,
  normalizeTvAccountState,
  saveTvAccountState,
  setTvAccount,
  createTvAccountClient,
} from '../tv/samsung/src/tv-account.mjs';

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), values };
}

test('TV account state keeps only the two supported paired slots', () => {
  const state = normalizeTvAccountState({
    activeSlot: 'will',
    accounts: {
      will: { token: 'tv_12345678901234567890', username: 'Will_1' },
      diadorim: { token: 'bad', username: 'diadorim' },
      stranger: { token: 'tv_12345678901234567890', username: 'stranger' },
    },
  });
  assert.equal(state.activeSlot, 'will');
  assert.equal(state.accounts.will.username, 'will_1');
  assert.equal(state.accounts.diadorim, null);
  assert.equal(Object.keys(state.accounts).sort().join(','), 'diadorim,will');
});

test('TV account state persists paired tokens and active selection', () => {
  const memory = storage();
  let state = emptyTvAccountState();
  state = setTvAccount(state, 'will', { token: 'tv_12345678901234567890', username: 'will' });
  saveTvAccountState(memory, state);
  const loaded = loadTvAccountState(memory);
  assert.equal(loaded.activeSlot, 'will');
  assert.equal(loaded.accounts.will.token, 'tv_12345678901234567890');
});

test('account rental storage namespaces each TV user', () => {
  const memory = storage();
  accountRentalStorage(memory, 'will').setItem('ignored', '{"owner":"will"}');
  accountRentalStorage(memory, 'diadorim').setItem('ignored', '{"owner":"diadorim"}');
  assert.equal(accountRentalStorage(memory, 'will').getItem('anything'), '{"owner":"will"}');
  assert.equal(accountRentalStorage(memory, 'diadorim').getItem('anything'), '{"owner":"diadorim"}');
});

test('TV account client sends bearer token to private state and rental routes', async () => {
  const calls = [];
  const client = createTvAccountClient({
    apiBase: 'https://data.example',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  await client.state('tv_secret_token_1234567890');
  await client.rent('tv_secret_token_1234567890', [{ tmdbId: 603, type: 'movie', name: 'The Matrix', year: 1999 }]);
  assert.equal(calls[0].options.headers.get('authorization'), 'Bearer tv_secret_token_1234567890');
  assert.match(calls[1].url, /\/v1\/tv\/rentals$/);
});
