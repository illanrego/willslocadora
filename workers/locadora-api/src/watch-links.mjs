const HOSTS = new Set([
  'netflix.com', 'www.netflix.com', 'primevideo.com', 'www.primevideo.com', 'app.primevideo.com',
  'amazon.com', 'www.amazon.com', 'amazon.com.br', 'www.amazon.com.br',
  'play.hbomax.com', 'www.hbomax.com', 'hbomax.com', 'play.max.com', 'www.max.com',
  'disneyplus.com', 'www.disneyplus.com', 'globoplay.globo.com',
  'paramountplus.com', 'www.paramountplus.com', 'tv.apple.com',
  'mubi.com', 'www.mubi.com', 'crunchyroll.com', 'www.crunchyroll.com',
  'www.clarovideo.com', 'clarovideo.com', 'www.telecine.com.br',
]);
const MAX_BYTES = 1_000_000;
export const WATCH_TTL = 6 * 60 * 60;
export const WATCH_FAILURE_TTL = 60;

export function watchIdentity(type, id) {
  const value = String(id || '').replace(/^tmdb:/, '');
  if (!['movie', 'series'].includes(type) || !/^[1-9]\d{0,9}$/.test(value)) throw new Error('Invalid watch-links title');
  return { type, id: value, fallbackUrl: `https://www.themoviedb.org/${type === 'series' ? 'tv' : 'movie'}/${value}/watch?locale=BR` };
}

function destination(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && HOSTS.has(url.hostname) && !url.username && !url.password && !url.port && url.pathname !== '/' && value.length <= 4096 ? url.href : '';
  } catch { return ''; }
}

// The public page contains JustWatch clickout anchors. Never execute its markup
// or follow the clickout: the destination and offer identity are already present.
export function extractWatchLinks(html) {
  const offers = new Map();
  for (const match of html.matchAll(/<a\b[^>]{0,16000}?\bhref\s*=\s*["']([^"']{1,12000})["']/gi)) {
    try {
      const anchor = new URL(match[1].replaceAll('&amp;', '&').replaceAll('&#38;', '&'));
      if (anchor.origin !== 'https://click.justwatch.com' || anchor.pathname !== '/a' || anchor.username || anchor.password || anchor.searchParams.get('uct_country') !== 'br') continue;
      const encoded = anchor.searchParams.get('cx') || '';
      const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0));
      const context = JSON.parse(new TextDecoder().decode(bytes));
      const offer = context.data?.find((entry) => String(entry.schema).includes('/clickout_context/') && entry.data?.providerId)?.data;
      const url = destination(anchor.searchParams.get('r') || '');
      if (offer?.monetizationType !== 'flatrate' || !Number.isSafeInteger(offer.providerId) || offer.providerId <= 0 || typeof offer.provider !== 'string' || !offer.provider.trim() || offer.provider.length > 100 || !url) continue;
      if (!offers.has(offer.providerId)) offers.set(offer.providerId, { providerId: offer.providerId, providerName: offer.provider, url });
      if (offers.size >= 40) break;
    } catch { /* Malformed or changed markup falls back to TMDB. */ }
  }
  return [...offers.values()];
}

async function boundedHtml(response) {
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html') || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) throw new Error('Unavailable watch page');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('Watch page too large');
      html += decoder.decode(chunk.value, { stream: true });
    }
    return html + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
}

export async function fetchWatchLinks(identity, fetchImpl = fetch) {
  try {
    let page = new URL(identity.fallbackUrl);
    const signal = AbortSignal.timeout(5000);
    for (let redirects = 0; redirects <= 2; redirects += 1) {
      const response = await fetchImpl(page.href, { redirect: 'manual', signal, headers: { accept: 'text/html' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) break;
        const next = new URL(location, page);
        const prefix = `/${identity.type === 'series' ? 'tv' : 'movie'}/${identity.id}`;
        if (next.origin !== 'https://www.themoviedb.org' || next.username || next.password || !new RegExp(`^${prefix}(?:-[a-zA-Z0-9_-]+)?/watch$`).test(next.pathname)) break;
        next.search = '?locale=BR';
        page = next;
        continue;
      }
      const offers = extractWatchLinks(await boundedHtml(response));
      return { offers, fallbackUrl: identity.fallbackUrl, retrievedAt: new Date().toISOString(), status: offers.length ? 'ok' : 'unavailable' };
    }
  } catch { /* Network, size and parser failures never prevent a rental. */ }
  return { offers: [], fallbackUrl: identity.fallbackUrl, retrievedAt: null, status: 'unavailable' };
}

export function createWatchLinkService(fetchImpl = fetch) {
  const cache = new Map();
  return async (identity) => {
    const key = `${identity.type}:${identity.id}`;
    const found = cache.get(key);
    if (found && found.until > Date.now()) return found.value;
    const value = await fetchWatchLinks(identity, fetchImpl);
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(key, { value, until: Date.now() + 1000 * (value.status === 'ok' ? WATCH_TTL : WATCH_FAILURE_TTL) });
    return value;
  };
}
