import test from 'node:test';
import assert from 'node:assert/strict';
import { extractWatchLinks, fetchWatchLinks, watchIdentity, createWatchLinkService } from '../workers/locadora-api/src/watch-links.mjs';
import { createLocadoraWorker } from '../workers/locadora-api/src/index.mjs';

function anchor({ id = 8, name = 'Netflix', monetization = 'flatrate', target = 'https://www.netflix.com/title/80057281', country = 'br' } = {}) {
  const cx = Buffer.from(JSON.stringify({ data: [{ schema: 'iglu:com.justwatch/clickout_context/jsonschema/1-3-2', data: { providerId: id, provider: name, monetizationType: monetization } }] })).toString('base64');
  return `<a href="https://click.justwatch.com/a?${new URLSearchParams({ cx, r: target, uct_country: country }).toString().replaceAll('&', '&amp;')}">Service</a>`;
}
const htmlResponse = (html) => new Response(html, { headers: { 'content-type': 'text/html' } });

test('subscription extraction deduplicates qualities and keeps extra channels distinct from base subscriptions', () => {
  const html = anchor() + anchor() + anchor({ id: 1825, name: 'HBO Max Amazon Channel', target: 'https://app.primevideo.com/detail?gti=example' }) + anchor({ monetization: 'rent', id: 10 }) + anchor({ monetization: 'buy', id: 2 });
  assert.deepEqual(extractWatchLinks(html), [
    { providerId: 8, providerName: 'Netflix', url: 'https://www.netflix.com/title/80057281' },
    { providerId: 1825, providerName: 'HBO Max Amazon Channel', url: 'https://app.primevideo.com/detail?gti=example' },
  ]);
});

test('malformed contexts, non-Brazil offers and unsafe destinations are ignored', () => {
  const targets = ['javascript:alert(1)', 'http://www.netflix.com/title/1', 'https://www.netflix.com.evil.test/title/1', 'https://u:p@www.netflix.com/title/1', 'https://www.netflix.com:8443/title/1', 'https://127.0.0.1/title/1', 'https://www.netflix.com/'];
  const html = targets.map((target) => anchor({ target })).join('') + anchor({ country: 'us' }) + '<a href="https://click.justwatch.com/a?cx=invalid&r=x">bad</a>';
  assert.deepEqual(extractWatchLinks(html), []);
});

test('movie and series identities construct only fixed BR watch-page URLs', () => {
  assert.equal(watchIdentity('movie', 'tmdb:603').fallbackUrl, 'https://www.themoviedb.org/movie/603/watch?locale=BR');
  assert.equal(watchIdentity('series', '66732').fallbackUrl, 'https://www.themoviedb.org/tv/66732/watch?locale=BR');
  for (const [type, id] of [['tv', '3'], ['movie', '../1'], ['movie', '0'], ['movie', '99999999999'], ['movie', 'tt123']]) assert.throws(() => watchIdentity(type, id), /Invalid/);
});

test('watch fetch allows a canonical slug redirect and never follows an external redirect', async () => {
  const calls = [];
  const result = await fetchWatchLinks(watchIdentity('movie', '603'), async (url, options) => {
    calls.push(url); assert.equal(options.redirect, 'manual');
    return calls.length === 1 ? new Response(null, { status: 301, headers: { location: '/movie/603-the-matrix/watch' } }) : htmlResponse(anchor());
  });
  assert.equal(result.status, 'ok'); assert.equal(calls[1], 'https://www.themoviedb.org/movie/603-the-matrix/watch?locale=BR');
  let blockedCalls = 0;
  const blocked = await fetchWatchLinks(watchIdentity('series', '66732'), async () => { blockedCalls++; return new Response(null, { status: 302, headers: { location: 'https://example.com/private' } }); });
  assert.equal(blockedCalls, 1); assert.equal(blocked.status, 'unavailable'); assert.match(blocked.fallbackUrl, /\/tv\/66732\/watch/);
});

test('network, markup, status and size failures return a usable fallback', async () => {
  for (const fetcher of [async () => { throw new Error('timeout'); }, async () => new Response('', { status: 403 }), async () => htmlResponse('<html>changed</html>'), async () => htmlResponse('x'.repeat(1_000_001))]) {
    const result = await fetchWatchLinks(watchIdentity('movie', '603'), fetcher);
    assert.deepEqual(result.offers, []); assert.equal(result.status, 'unavailable'); assert.match(result.fallbackUrl, /603\/watch/);
  }
});

test('successful and failed lookups are cached without mixing movie and series identities', async () => {
  let calls = 0;
  const lookup = createWatchLinkService(async () => { calls++; return htmlResponse(anchor()); });
  await lookup(watchIdentity('movie', '1')); await lookup(watchIdentity('movie', '1')); await lookup(watchIdentity('series', '1'));
  assert.equal(calls, 2);
  let failures = 0;
  const unavailable = createWatchLinkService(async () => { failures++; throw new Error('offline'); });
  await unavailable(watchIdentity('movie', '1')); await unavailable(watchIdentity('movie', '1'));
  assert.equal(failures, 1);
});

test('Worker endpoint validates inputs, keeps exact CORS, and sets success/failure TTLs without a TMDB secret', async () => {
  const env = { ALLOWED_ORIGINS: 'https://locadora.example' };
  for (const [body, ttl] of [[anchor(), '21600'], ['', '60']]) {
    const worker = createLocadoraWorker({ fetchImpl: async () => htmlResponse(body) });
    const request = (query, origin = env.ALLOWED_ORIGINS) => new Request(`https://worker.example/v1/watch-links?${query}`, { headers: { origin } });
    const response = await worker.fetch(request('type=series&id=66732'), env);
    assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), env.ALLOWED_ORIGINS);
    assert.equal(response.headers.get('cache-control'), `public, max-age=${ttl}`);
    assert.equal((await worker.fetch(request('type=series&id=bad'), env)).status, 400);
    assert.equal((await worker.fetch(request('type=series&id=66732', 'https://evil.example'), env)).status, 403);
  }
});

test('edge cache hits reapply CORS for the current allowed origin without retaining another origin', async (t) => {
  const entries = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
    match: async (request) => entries.get(request.url)?.clone(),
    put: async (request, response) => { entries.set(request.url, response); },
  } } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'caches', original); else delete globalThis.caches; });
  let calls = 0;
  const worker = createLocadoraWorker({ fetchImpl: async () => { calls++; return htmlResponse(anchor()); } });
  const env = { ALLOWED_ORIGINS: 'https://first.example,https://second.example' };
  const pending = [];
  const request = (origin) => new Request('https://worker.example/v1/watch-links?type=movie&id=603', { headers: { origin } });
  await worker.fetch(request('https://first.example'), env, { waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);
  assert.equal([...entries.values()][0].headers.has('access-control-allow-origin'), false);
  const hit = await worker.fetch(request('https://second.example'), env);
  assert.equal(hit.headers.get('access-control-allow-origin'), 'https://second.example');
  assert.equal(hit.headers.get('vary'), 'origin');
  assert.equal((await worker.fetch(request('https://evil.example'), env)).status, 403);
  assert.equal(calls, 1);
});
