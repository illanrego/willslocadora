'use strict';

const dns = require('node:dns').promises;
const fs = require('node:fs');
const path = require('node:path');
const { isIP } = require('node:net');
const { deduplicateTitles, filterByStore, normalizeTitle } = require('../public/app-core.js');

const DEFAULT_SOURCES = Object.freeze([
  {
    id: 'com.linvo.cinemeta',
    name: 'Cinemeta',
    manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
  },
  {
    id: 'tmdb-addon',
    name: 'The Movie Database Addon',
    manifestUrl: 'https://94c8cb9f702d-tmdb-addon.baby-beamup.club/manifest.json',
  },
  {
    id: 'org.imdbcatalogs',
    name: 'IMDB Catalogs',
    manifestUrl: 'https://1fe84bc728af-imdb-catalogs.baby-beamup.club/manifest.json',
  },
]);
const BRAZIL_PROVIDER_FILTERS = Object.freeze({ netflix: 'Netflix', 'prime-video': 'Amazon Prime Video' });

function isPrivateAddress(address) {
  const value = String(address).toLowerCase();
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:') ||
    /^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value) || /^169\.254\./.test(value) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(value) || value === '0.0.0.0';
}

function assertSafeManifestUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Invalid manifest URL'); }
  if (url.protocol !== 'https:') throw new Error('Add-on manifests must use HTTPS');
  if (url.username || url.password) throw new Error('Manifest URLs cannot contain credentials');
  if (!url.pathname.endsWith('/manifest.json') && url.pathname !== '/manifest.json') throw new Error('URL must point to manifest.json');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || (isIP(host) && isPrivateAddress(host))) {
    throw new Error('private network manifests are not allowed');
  }
  url.hash = '';
  return url;
}

async function assertPublicHost(url, lookupImpl = dns.lookup) {
  const records = await lookupImpl(url.hostname, { all: true });
  if (!records.length || records.some(({ address }) => isPrivateAddress(address))) throw new Error('Remote host resolves to a private address');
}

function assertSafeRemoteUrl(input) {
  const url = input instanceof URL ? new URL(input.href) : new URL(input);
  if (url.protocol !== 'https:') throw new Error('Remote add-on requests must use HTTPS');
  if (url.username || url.password) throw new Error('Remote add-on requests cannot contain credentials');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || (isIP(host) && isPrivateAddress(host))) {
    throw new Error('Remote add-on request points to a private address');
  }
  return url;
}

async function safeFetchRemote(input, fetchImpl, lookupImpl, accept) {
  let target = assertSafeRemoteUrl(input);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    await assertPublicHost(target, lookupImpl);
    const response = await fetchImpl(target, {
      headers: { accept, 'user-agent': 'Locadora/0.1' },
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers && response.headers.get ? response.headers.get('location') : null;
      if (!location || redirects === 3) throw new Error('Remote source returned too many redirects');
      target = assertSafeRemoteUrl(new URL(location, target));
      continue;
    }
    if (!response.ok) throw new Error(`Remote request failed (${response.status})`);
    return response;
  }
  throw new Error('Remote source returned too many redirects');
}

async function safeFetchJson(input, fetchImpl = fetch, lookupImpl = dns.lookup) {
  const response = await safeFetchRemote(input, fetchImpl, lookupImpl, 'application/json');
  const contentType = response.headers && response.headers.get ? response.headers.get('content-type') : null;
  if (contentType && !contentType.includes('json')) throw new Error('Add-on did not return JSON');
  return response.json();
}

async function safeFetchImage(input, fetchImpl = fetch, lookupImpl = dns.lookup) {
  const response = await safeFetchRemote(input, fetchImpl, lookupImpl, 'image/*');
  const contentType = response.headers && response.headers.get ? response.headers.get('content-type') : '';
  const contentLength = Number(response.headers && response.headers.get ? response.headers.get('content-length') : 0);
  if (!contentType || !contentType.toLowerCase().startsWith('image/')) throw new Error('Remote source did not return an image');
  if (contentLength > 8_000_000) throw new Error('Remote image is too large');
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 8_000_000) throw new Error('Remote image is too large');
  return { contentType: contentType.split(';')[0], body };
}

function discoverCatalogs(manifest) {
  return (Array.isArray(manifest.catalogs) ? manifest.catalogs : [])
    .filter((catalog) => ['movie', 'series'].includes(catalog.type) && typeof catalog.id === 'string')
    .map((catalog) => {
      const extra = Array.isArray(catalog.extra) ? catalog.extra.filter((item) => item && item.name) : [];
      return {
        type: catalog.type,
        id: catalog.id,
        name: typeof catalog.name === 'string' ? catalog.name : '',
        pageSize: Number.isInteger(catalog.pageSize) && catalog.pageSize > 0 ? catalog.pageSize : 50,
        extras: extra.map(({ name }) => name),
        requiredExtras: extra.filter(({ isRequired }) => isRequired).map(({ name }) => name),
        options: Object.fromEntries(extra.map(({ name, options }) => [name, Array.isArray(options) ? options.map(String) : []])),
      };
    });
}

function discoverMetaResources(manifest) {
  return (Array.isArray(manifest.resources) ? manifest.resources : [])
    .filter((resource) => resource === 'meta' || (resource && resource.name === 'meta'))
    .map((resource) => ({
      types: resource === 'meta' || !Array.isArray(resource.types) ? ['movie', 'series'] : resource.types.filter((type) => ['movie', 'series'].includes(type)),
      idPrefixes: resource === 'meta' || !Array.isArray(resource.idPrefixes) ? [] : resource.idPrefixes.map(String),
    }))
    .filter(({ types }) => types.length);
}

function buildResourceUrl(manifestUrl, resource, type, id, extras = {}) {
  const manifest = new URL(manifestUrl);
  const root = manifest.pathname.replace(/\/manifest\.json$/, '');
  const encodedExtras = Object.entries(extras)
    .filter(([, value]) => value !== '' && value != null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  manifest.pathname = resource === 'meta'
    ? `${root}/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`
    : `${root}/${resource}/${encodeURIComponent(type)}/${encodeURIComponent(id)}/${encodedExtras ? `${encodedExtras}.json` : 'catalog.json'}`;
  manifest.search = '';
  return manifest.href;
}

async function fetchJsonForSource(url, fetchImpl) {
  if (fetchImpl !== fetch) {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error('Catalogue request failed');
    return response.json();
  }
  return safeFetchJson(new URL(url), fetchImpl);
}

async function fetchCatalogPages({ source, catalog, extras, fetchImpl, pageCount, page = 0 }) {
  const pages = catalog.extras.includes('skip') ? pageCount : 1;
  const requests = Array.from({ length: pages }, (_, index) => {
    const pageExtras = catalog.extras.includes('skip') ? { ...extras, skip: (page * pageCount + index) * catalog.pageSize } : extras;
    const url = buildResourceUrl(source.manifestUrl, 'catalog', catalog.type, catalog.id, pageExtras);
    return fetchJsonForSource(url, fetchImpl);
  });
  const settled = await Promise.allSettled(requests);
  const bodies = settled.filter(({ status }) => status === 'fulfilled').map(({ value }) => value);
  if (!bodies.length && settled.some(({ status }) => status === 'rejected')) throw new Error('Catalogue pages are unavailable');
  return bodies.flatMap((body) => Array.isArray(body.metas) ? body.metas : []);
}

async function fetchStoreShelf({ source, genre, genres, year, type = 'movie', fetchImpl = fetch, yearWindow = 5, pageCount = 2, page = 0 }) {
  const aisleGenres = (Array.isArray(genres) && genres.length ? genres : [genre]).filter(Boolean);
  const catalogs = (source.catalogs || []).filter((catalog) => catalog.type === type);
  const yearCatalog = catalogs.find((catalog) => catalog.extras.includes('genre') && /(^|\.)year$|year/i.test(`${catalog.id} ${catalog.name || ''}`));
  const genreCatalog = catalogs.find((catalog) => {
    if (!catalog.extras.includes('genre')) return false;
    const options = catalog.options && catalog.options.genre;
    return !options || !options.length || aisleGenres.some((item) => options.includes(item));
  });
  const fallbackCatalog = catalogs.find((catalog) => !(catalog.requiredExtras || []).length);
  let raw = [];

  if (yearCatalog) {
    const years = Array.from({ length: yearWindow }, (_, index) => year - index);
    const pages = await Promise.allSettled(years.map((catalogYear) => fetchCatalogPages({
      source,
      catalog: yearCatalog,
      extras: { genre: catalogYear },
      fetchImpl,
      pageCount,
      page,
    })));
    raw = pages.filter(({ status }) => status === 'fulfilled').flatMap(({ value }) => value);
    if (!raw.length && pages.some(({ status }) => status === 'rejected')) throw new Error('Catalogue year pages are unavailable');
  } else if (genreCatalog) {
    const options = genreCatalog.options && genreCatalog.options.genre;
    const supportedGenres = !options || !options.length ? aisleGenres : aisleGenres.filter((item) => options.includes(item));
    const pages = await Promise.allSettled(supportedGenres.map((item) => fetchCatalogPages({
      source, catalog: genreCatalog, extras: { genre: item }, fetchImpl, pageCount, page,
    })));
    raw = pages.filter(({ status }) => status === 'fulfilled').flatMap(({ value }) => value);
    if (!raw.length && pages.some(({ status }) => status === 'rejected')) throw new Error('Catalogue genre pages are unavailable');
  } else if (fallbackCatalog) {
    raw = await fetchCatalogPages({ source, catalog: fallbackCatalog, extras: {}, fetchImpl, pageCount, page });
  }

  const normalized = raw.map((meta) => normalizeTitle(meta, source.id)).filter((title) => title.id);
  return filterByStore(deduplicateTitles(normalized), { genres: aisleGenres, year, yearWindow })
    .sort((a, b) => (b.year - a.year) || a.name.localeCompare(b.name));
}

async function fetchTitleMeta({ sources, type, id, fetchImpl = fetch }) {
  const compatible = sources.filter((source) => (source.metaResources || []).some((resource) =>
    resource.types.includes(type) && (!resource.idPrefixes.length || resource.idPrefixes.some((prefix) => id.startsWith(prefix)))));
  for (const source of compatible) {
    try {
      const url = buildResourceUrl(source.manifestUrl, 'meta', type, id);
      const body = await fetchJsonForSource(url, fetchImpl);
      if (body && body.meta) return normalizeTitle(body.meta, source.id);
    } catch {}
  }
  throw new Error('Title metadata is unavailable');
}

class CatalogueStore {
  constructor({ dataDir = path.join(process.cwd(), '.locadora'), fetchImpl = fetch, tmdbClient = null } = {}) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'sources.json');
    this.fetchImpl = fetchImpl;
    this.tmdbClient = tmdbClient;
    this.sources = [];
    this.metaCache = new Map();
  }

  async init() {
    let saved = [];
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const defaultUrls = new Set(DEFAULT_SOURCES.map(({ manifestUrl }) => manifestUrl));
    const definitions = [...DEFAULT_SOURCES, ...saved.filter((item) => !defaultUrls.has(item.manifestUrl))];
    const loaded = await Promise.allSettled(definitions.map((definition) => this.loadSource(definition.manifestUrl)));
    this.sources = loaded.filter((result) => result.status === 'fulfilled').map((result) => result.value);
    if (!this.sources.length) throw new Error('No catalogue sources are available');
    return this;
  }

  async loadSource(input) {
    const url = assertSafeManifestUrl(input);
    const manifest = await safeFetchJson(url, this.fetchImpl);
    const catalogs = discoverCatalogs(manifest);
    if (!manifest.id || !manifest.name || !catalogs.length) throw new Error('Manifest has no usable movie or series catalogues');
    return { id: String(manifest.id), name: String(manifest.name), manifestUrl: url.href, catalogs, metaResources: discoverMetaResources(manifest) };
  }

  listSources() {
    return this.sources.map(({ id, name, catalogs }) => ({ id, name, catalogs }));
  }

  async addSource(manifestUrl) {
    const source = await this.loadSource(manifestUrl);
    this.sources = [...this.sources.filter((item) => item.id !== source.id), source];
    fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    const defaultUrls = new Set(DEFAULT_SOURCES.map(({ manifestUrl: url }) => url));
    const saved = this.sources.filter((item) => !defaultUrls.has(item.manifestUrl)).map(({ manifestUrl: url }) => ({ manifestUrl: url }));
    fs.writeFileSync(this.file, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 });
    return { id: source.id, name: source.name, catalogs: source.catalogs };
  }

  async shelf(options) {
    const providerName = BRAZIL_PROVIDER_FILTERS[options.provider] || '';
    if (options.provider && !providerName) throw new Error('Invalid Brazil streaming provider filter');
    if (providerName && !this.tmdbClient?.enabled) throw new Error('Netflix and Prime Video filters require TMDB_API_KEY in .env');
    if (providerName) {
      return this.tmdbClient.discoverProviderShelf({
        year: options.year,
        genres: options.genres,
        type: options.type,
        providerName,
        page: options.page,
      });
    }
    const sources = options.sourceId ? this.sources.filter((source) => source.id === options.sourceId) : this.sources;
    const yearWindow = providerName ? 20 : 5;
    const results = await Promise.allSettled(sources.map((source) => fetchStoreShelf({ ...options, source, yearWindow, fetchImpl: this.fetchImpl })));
    const titles = deduplicateTitles(results.filter((result) => result.status === 'fulfilled').flatMap((result) => result.value));
    if (!titles.length && results.some((result) => result.status === 'rejected')) {
      throw new Error('Catalogue sources could not fill this shelf');
    }
    return titles.slice(0, 40);
  }

  async titleMeta({ type, id, locale = 'pt-BR' }) {
    const requestedLocale = locale === 'en-US' ? 'en-US' : 'pt-BR';
    const key = `${requestedLocale}:${type}:${id}`;
    if (!this.metaCache.has(key)) this.metaCache.set(key, (async () => {
      const meta = await fetchTitleMeta({ sources: this.sources, type, id, fetchImpl: this.fetchImpl });
      if (!this.tmdbClient) return meta;
      try { return await this.tmdbClient.enrich(meta, requestedLocale); } catch { return meta; }
    })());
    try { return await this.metaCache.get(key); } catch (error) {
      this.metaCache.delete(key);
      throw error;
    }
  }
}

module.exports = {
  BRAZIL_PROVIDER_FILTERS, DEFAULT_SOURCES, CatalogueStore, assertSafeManifestUrl, buildResourceUrl, discoverCatalogs, discoverMetaResources, fetchStoreShelf, fetchTitleMeta, isPrivateAddress, safeFetchImage, safeFetchJson,
};
