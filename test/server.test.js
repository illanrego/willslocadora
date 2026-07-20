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
  assert.match(page, /id="store-year-input"[^>]+type="number"/);
  assert.match(page, /id="year-go"[^>]*>Go<\/button>/);
  assert.match(page, /id="immersive-header-toggle"[^>]+aria-expanded="false"/);
  assert.match(page, /id="immersive-zoom-out"[^>]+aria-label="Zoom out"/);
  assert.match(page, /id="immersive-zoom-in"[^>]+aria-label="Zoom in"/);
  assert.match(page, /id="immersive-previous-stand"[^>]+hidden[^>]*>← Previous stand/);
  assert.match(page, /id="immersive-next-stand"[^>]+hidden[^>]*>Next stand/);
});

test('shelf accepts catalogue years through 2026 and rejects later years', async (t) => {
  const requested = [];
  const server = createServer({
    catalogue: {
      listSources: () => [],
      shelf: async (options) => { requested.push(options); return []; },
    },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();

  assert.equal((await fetch(`http://127.0.0.1:${port}/api/shelf?year=2026&genre=Action&type=movie`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/shelf?year=2027&genre=Action&type=movie`)).status, 400);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/shelf?year=1999&genre=Crime,Thriller,Mystery&type=movie`)).status, 200);
  assert.deepEqual(requested.map(({ year }) => year), [2026, 1999]);
  assert.deepEqual(requested[1].genres, ['Crime', 'Thriller', 'Mystery']);
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

  const immersive = await fetch(`http://127.0.0.1:${port}/immersive-shelf.mjs`);
  assert.equal(immersive.status, 200);
  assert.match(immersive.headers.get('content-type'), /text\/javascript/);
  const immersiveSource = await immersive.text();
  assert.match(immersiveSource, /const COLUMNS = 10;/);
  assert.match(immersiveSource, /const ROWS = 4;/);
  assert.match(immersiveSource, /transition\(nextTitles, nextGenre, nextYear, nextType, direction\)/);

  const app = await fetch(`http://127.0.0.1:${port}/app.js`);
  const appSource = await app.text();
  assert.match(appSource, /function goToPreviousStand\(\)/);
  assert.match(appSource, /goToCachedStand\(state\.stand - 1, -1\)/);
  assert.match(appSource, /loadShelf\(state\.stand \+ 1, true, 1\)/);

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
