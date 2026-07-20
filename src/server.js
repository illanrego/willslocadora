'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { safeFetchImage } = require('./catalogue.js');
const { BRAZIL_PROVIDERS, normalizeProviderIds } = require('./providers.js');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const THREE_BUILD = path.dirname(require.resolve('three'));
const THREE_FILES = Object.freeze({
  '/vendor/three.module.js': path.join(THREE_BUILD, 'three.module.js'),
  '/vendor/three.core.js': path.join(THREE_BUILD, 'three.core.js'),
});
const MIME = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Request body is too large');
  }
  try { return JSON.parse(body || '{}'); } catch { throw new Error('Invalid JSON body'); }
}

function serveStatic(requestPath, response) {
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, relative);
  if (!file.startsWith(`${PUBLIC_DIR}${path.sep}`)) return sendJson(response, 404, { error: 'Not found' });
  fs.readFile(file, (error, content) => {
    if (error) return sendJson(response, error.code === 'ENOENT' ? 404 : 500, { error: 'Not found' });
    response.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'content-security-policy': "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    });
    response.end(content);
  });
}

function serveThree(requestPath, response) {
  fs.readFile(THREE_FILES[requestPath], (error, content) => {
    if (error) return sendJson(response, 500, { error: 'Three.js is unavailable' });
    response.writeHead(200, {
      'content-type': MIME['.js'],
      'cache-control': 'no-cache',
      'content-security-policy': "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'",
      'x-content-type-options': 'nosniff',
    });
    response.end(content);
  });
}

function createServer({ catalogue, posterFetcher = safeFetchImage }) {
  if (!catalogue) throw new Error('Catalogue service is required');
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    try {
      if (Object.hasOwn(THREE_FILES, url.pathname)) {
        if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
        return serveThree(url.pathname, response);
      }
      if (url.pathname === '/api/health') {
        if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
        return sendJson(response, 200, { ok: true, service: 'locadora' });
      }
      if (url.pathname === '/api/sources') {
        if (request.method === 'GET') return sendJson(response, 200, { sources: catalogue.listSources() });
        if (request.method === 'POST') {
          const body = await readJson(request);
          const source = await catalogue.addSource(body.manifestUrl);
          return sendJson(response, 201, { source });
        }
        return sendJson(response, 405, { error: 'Method not allowed' });
      }
      if (url.pathname === '/api/providers') {
        if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
        return sendJson(response, 200, { providers: BRAZIL_PROVIDERS });
      }
      if (url.pathname === '/api/featured') {
        if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
        const year = Number(url.searchParams.get('year'));
        if (!Number.isInteger(year) || year < 1920 || year > 2026) return sendJson(response, 400, { error: 'Invalid featured year' });
        return sendJson(response, 200, { titles: await catalogue.featured(year), year });
      }
      if (url.pathname === '/api/shelf') {
        if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
        const year = Number(url.searchParams.get('year'));
        const genre = url.searchParams.get('genre') || '';
        const genres = genre.split(',').map((item) => item.trim()).filter(Boolean);
        const type = url.searchParams.get('type') === 'series' ? 'series' : 'movie';
        const stand = Number(url.searchParams.get('stand') || 0);
        const requestedProviders = url.searchParams.get('providers') ?? url.searchParams.get('provider') ?? '';
        const providers = normalizeProviderIds(requestedProviders);
        const ignoreStoreYear = url.searchParams.get('ignoreStoreYear') === 'true';
        if (!Number.isInteger(year) || year < 1920 || year > 2026 || !genres.length || genres.length > 3 || genres.some((item) => item.length > 20) || !Number.isInteger(stand) || stand < 0 || stand > 20 || (requestedProviders && !providers.length) || (ignoreStoreYear && !providers.length)) return sendJson(response, 400, { error: 'Invalid shelf filters' });
        const titles = await catalogue.shelf({ year, genre: genres[0], genres, type, page: stand, providers, ignoreStoreYear, sourceId: url.searchParams.get('source') || '' });
        return sendJson(response, 200, { titles, year, genre, type, stand, providers, ignoreStoreYear });
      }
      if (url.pathname === '/api/meta') {
        if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
        const type = url.searchParams.get('type');
        const id = url.searchParams.get('id') || '';
        const locale = url.searchParams.get('locale') || 'pt-BR';
        if (!['movie', 'series'].includes(type) || !/^[a-zA-Z0-9:_-]+$/.test(id) || !['pt-BR', 'en-US'].includes(locale)) return sendJson(response, 400, { error: 'Invalid title metadata request' });
        const meta = await catalogue.titleMeta({ type, id, locale });
        return sendJson(response, 200, { meta });
      }
      if (url.pathname === '/api/poster') {
        if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
        const source = url.searchParams.get('url') || '';
        if (!source || source.length > 2_048) return sendJson(response, 400, { error: 'Invalid poster URL' });
        const { contentType, body } = await posterFetcher(source);
        response.writeHead(200, {
          'content-type': contentType,
          'cache-control': 'private, max-age=86400',
          'content-length': body.length,
          'x-content-type-options': 'nosniff',
        });
        return response.end(body);
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Method not allowed' });
      return serveStatic(url.pathname, response);
    } catch (error) {
      const message = error && error.message ? error.message : 'Unexpected error';
      return sendJson(response, /Invalid|must|allowed|too large|credentials|private/i.test(message) ? 400 : 502, { error: message });
    }
  });
}

module.exports = { createServer };
