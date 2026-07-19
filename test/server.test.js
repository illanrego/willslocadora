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

test('server exposes the installed Three.js browser module without exposing node_modules', async (t) => {
  const server = createServer({ catalogue: { listSources: () => [] } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/vendor/three.module.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/javascript/);
  assert.match(await response.text(), /class WebGLRenderer/);

  const core = await fetch(`http://127.0.0.1:${port}/vendor/three.core.js`);
  assert.equal(core.status, 200);
  assert.match(core.headers.get('content-type'), /text\/javascript/);

  const viewer = await fetch(`http://127.0.0.1:${port}/vhs-3d.mjs`);
  assert.equal(viewer.status, 200);
  assert.match(viewer.headers.get('content-type'), /text\/javascript/);
  assert.match(await viewer.text(), /createVhsViewer/);

  const privateModule = await fetch(`http://127.0.0.1:${port}/node_modules/three/package.json`);
  assert.equal(privateModule.status, 404);
});

test('server proxies validated poster bytes for WebGL textures', async (t) => {
  const server = createServer({
    catalogue: { listSources: () => [] },
    posterFetcher: async (url) => {
      assert.equal(url, 'https://images.example/poster.jpg');
      return { contentType: 'image/jpeg', body: Buffer.from([1, 2, 3]) };
    },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/poster?url=${encodeURIComponent('https://images.example/poster.jpg')}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
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
