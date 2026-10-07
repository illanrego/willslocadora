const PROVIDERS = Object.freeze({
  netflix: { names: ['netflix'], knownIds: ['3201907018807', '11101200001'] },
  'prime-video': { names: ['prime video', 'amazon prime', 'primevideo'], knownIds: ['3201910019365', '3201512006785'] },
  stremio: { names: ['stremio'], knownIds: ['3202306031311'] },
});

function call(callbackApi, invoke, timeout = 5000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('tizen_timeout'));
    }, timeout);
    const success = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const failure = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(error?.message || String(error || callbackApi)));
    };
    try { invoke(success, failure); } catch (error) { failure(error); }
  });
}

function safeHttps(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function stremioDeepLink(value) {
  const match = String(value || '').match(/^stremio:\/\/\/detail\/(movie|series)\/(tt\d+)(?:\/[^/?#]+)?$/);
  if (!match) return '';
  return match[1] === 'movie' ? `stremio:///detail/movie/${match[2]}/${match[2]}` : `stremio:///detail/series/${match[2]}`;
}

function providerDeepLinks(providerId, exactUrl, stremioUri) {
  if (providerId === 'stremio') return [stremioDeepLink(stremioUri)].filter(Boolean);
  const web = safeHttps(exactUrl);
  if (!web) return [];
  const links = [];
  const parsed = new URL(web);
  if (providerId === 'netflix') {
    const id = parsed.pathname.match(/\/title\/(\d+)/)?.[1];
    if (id) links.push(`nflx://www.netflix.com/title/${id}`);
  }
  if (providerId === 'prime-video') {
    const id = parsed.searchParams.get('gti') || parsed.pathname.match(/\/detail\/([^/?#]+)/)?.[1] || '';
    if (/^[A-Za-z0-9]+$/.test(id)) links.push(`aiv://aiv/detail?gti=${encodeURIComponent(id)}`);
  }
  links.push(web);
  return [...new Set(links)];
}

function providerApp(apps, providerId) {
  const config = PROVIDERS[providerId];
  if (!config) return null;
  return apps.find((app) => config.knownIds.includes(String(app.id))) || apps.find((app) => {
    const label = `${app.name || ''} ${app.packageId || ''}`.toLowerCase();
    return config.names.some((name) => label.includes(name));
  }) || null;
}

export function createSamsungRuntime(root = globalThis) {
  const tizen = root.tizen;
  let installedApps = null;

  async function apps() {
    if (installedApps) return installedApps;
    if (!tizen?.application?.getAppsInfo) return [];
    installedApps = await call('getAppsInfo', (success, failure) => tizen.application.getAppsInfo(success, failure)).catch(() => []);
    return installedApps;
  }

  function launchApp(appId) {
    if (!tizen?.application?.launch || !appId) return Promise.reject(new Error('app_unavailable'));
    return call('launch', (success, failure) => tizen.application.launch(appId, success, failure));
  }

  function launchControl(uri, appId = null) {
    if (!tizen?.application?.launchAppControl || !tizen?.ApplicationControl || !uri) return Promise.reject(new Error('app_control_unavailable'));
    const control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', uri, null, null, []);
    return call('launchAppControl', (success, failure) => tizen.application.launchAppControl(control, appId, success, failure));
  }

  async function controlHandlers(uri) {
    if (!tizen?.application?.findAppControl || !tizen?.ApplicationControl) return [];
    const control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', uri, null, null, []);
    return call('findAppControl', (success, failure) => tizen.application.findAppControl(control, success, failure)).catch(() => []);
  }

  async function openProvider({ providerId, exactUrl = '', stremioUri = '' }) {
    const installed = await apps();
    const app = providerApp(installed, providerId);
    const links = providerDeepLinks(providerId, exactUrl, stremioUri);
    const knownIds = PROVIDERS[providerId]?.knownIds || [];
    const homeIds = [...new Set([app?.id, ...knownIds].filter(Boolean))];
    for (const uri of links) {
      const handlers = await controlHandlers(uri);
      const matchingHandler = providerApp(handlers, providerId);
      const handlerIds = [...new Set([app?.id, matchingHandler?.id, ...handlers.map((handler) => handler.id), ...knownIds].filter(Boolean))];
      for (const appId of handlerIds) {
        try { await launchControl(uri, appId); return { status: 'exact', appId }; }
        catch { /* Try the next registered or known application. */ }
      }
      if (!uri.startsWith('https:')) {
        try { await launchControl(uri); return { status: 'exact', appId: null }; }
        catch { /* The custom URI is not registered on this TV. */ }
      }
    }
    if (links.length) {
      for (const appId of homeIds) {
        try { await launchApp(appId); return { status: 'app_home', appId }; }
        catch { /* Try another known regional/year app ID. */ }
      }
    }
    const browserUrl = safeHttps(exactUrl);
    if (browserUrl) {
      try { await launchControl(browserUrl); return { status: 'browser' }; }
      catch { /* Report unavailable below. */ }
    }
    return { status: 'unavailable' };
  }

  function exit() {
    try { tizen?.application?.getCurrentApplication?.().exit(); return true; }
    catch { return false; }
  }

  return {
    target: 'samsung-tv',
    capabilities: Object.freeze({ auth: false, savedCollections: false, reviews: false, admin: false, donations: false, localRental: true, externalApps: true }),
    apps,
    openProvider,
    exit,
    resetApps() { installedApps = null; },
  };
}

export function matchProviderApp(apps, providerId) { return providerApp(apps, providerId); }
