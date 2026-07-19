const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { createServer } = require('../src/server.js');

test('server binds to loopback and serves health plus static app', async (t) => {
  const server = createServer({
    catalogue: { listSources: () => [{ id: 'cinemeta', name: 'Cinemeta', catalogs: [] }] },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const address = server.address();
  assert.equal(address.address, '127.0.0.1');

  const health = await fetch(`http://127.0.0.1:${address.port}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);

  const page = await fetch(`http://127.0.0.1:${address.port}/`).then((response) => response.text());
  assert.match(page, /Will's Locadora/);
});

test('server exposes validated rich title metadata', async (t) => {
  const server = createServer({
    catalogue: {
      listSources: () => [],
      titleMeta: async ({ type, id }) => ({ id, type, imdbRating: '8.7' }),
    },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/meta?type=movie&id=tt0133093`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { meta: { id: 'tt0133093', type: 'movie', imdbRating: '8.7' } });

  const invalid = await fetch(`http://127.0.0.1:${port}/api/meta?type=movie&id=bad%2Fid`);
  assert.equal(invalid.status, 400);
});

test('server rejects non-GET API methods by default', async (t) => {
  const server = createServer({ catalogue: { listSources: () => [] } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/health`, { method: 'DELETE' });
  assert.equal(response.status, 405);
});
