import test from 'node:test';
import assert from 'node:assert/strict';
import { createSamsungRuntime, matchProviderApp } from '../tv/samsung/src/samsung-runtime.mjs';

function fakeTizen({ apps = [], handlers = [], controlFails = false, launchFails = false } = {}) {
  const calls = [];
  class ApplicationControl {
    constructor(operation, uri) { this.operation = operation; this.uri = uri; }
  }
  const tizen = {
    ApplicationControl,
    application: {
      getAppsInfo(success) { calls.push(['apps']); success(apps); },
      findAppControl(control, success) { calls.push(['find', control.uri]); success(handlers); },
      launchAppControl(control, appId, success, failure) {
        calls.push(['control', control.uri, appId]);
        const rejected = typeof controlFails === 'function' ? controlFails(control.uri, appId) : controlFails;
        if (rejected) failure(new Error('rejected')); else success();
      },
      launch(appId, success, failure) {
        calls.push(['launch', appId]);
        if (launchFails) failure(new Error('rejected')); else success();
      },
      getCurrentApplication() { return { exit() { calls.push(['exit']); } }; },
    },
  };
  return { root: { tizen, URL }, calls };
}

test('provider discovery prefers observed IDs and also matches app names', () => {
  assert.equal(matchProviderApp([{ id: '3201907018807', name: 'Anything' }], 'netflix').id, '3201907018807');
  assert.equal(matchProviderApp([{ id: 'prime-id', name: 'Amazon Prime Video' }], 'prime-video').id, 'prime-id');
  assert.equal(matchProviderApp([{ id: 'other', name: 'Other' }], 'stremio'), null);
});

test('Samsung runtime sends exact Stremio title to the installed app', async () => {
  const fake = fakeTizen({ apps: [{ id: '3202306031311', name: 'Stremio' }] });
  const result = await createSamsungRuntime(fake.root).openProvider({ providerId: 'stremio', stremioUri: 'stremio:///detail/movie/tt0133093' });
  assert.deepEqual(result, { status: 'exact', appId: '3202306031311' });
  assert.ok(fake.calls.some((call) => call[0] === 'control' && call[1] === 'stremio:///detail/movie/tt0133093/tt0133093' && call[2] === '3202306031311'));
});

test('Samsung runtime asks the platform for a Stremio URI handler when app enumeration misses it', async () => {
  const fake = fakeTizen({ handlers: [{ id: 'regional-stremio', name: 'Stremio Theater' }] });
  const result = await createSamsungRuntime(fake.root).openProvider({ providerId: 'stremio', stremioUri: 'stremio:///detail/movie/tt0133093' });
  assert.deepEqual(result, { status: 'exact', appId: 'regional-stremio' });
  assert.ok(fake.calls.some((call) => call[0] === 'find' && call[1] === 'stremio:///detail/movie/tt0133093/tt0133093'));
});

test('rejected exact provider handoff falls back to the installed app home', async () => {
  const fake = fakeTizen({ apps: [{ id: '3201907018807', name: 'Netflix' }], controlFails: true });
  const result = await createSamsungRuntime(fake.root).openProvider({ providerId: 'netflix', exactUrl: 'https://www.netflix.com/title/1' });
  assert.deepEqual(result, { status: 'app_home', appId: '3201907018807' });
  assert.deepEqual(fake.calls.at(-1), ['launch', '3201907018807']);
});

test('missing provider app uses the browser resolver for a safe HTTPS URL', async () => {
  const fake = fakeTizen({
    apps: [],
    controlFails: (uri, appId) => !uri.startsWith('https:') || Boolean(appId),
    launchFails: true,
  });
  const result = await createSamsungRuntime(fake.root).openProvider({ providerId: 'prime-video', exactUrl: 'https://www.primevideo.com/detail/1' });
  assert.deepEqual(result, { status: 'browser' });
  assert.deepEqual(fake.calls.at(-1), ['control', 'https://www.primevideo.com/detail/1', null]);
});

test('unsafe or unavailable provider destinations stay inside Locadora', async () => {
  const fake = fakeTizen({ apps: [] });
  assert.deepEqual(await createSamsungRuntime(fake.root).openProvider({ providerId: 'netflix', exactUrl: 'javascript:alert(1)' }), { status: 'unavailable' });
  assert.deepEqual(await createSamsungRuntime({}).openProvider({ providerId: 'stremio', stremioUri: 'stremio:///detail/movie/nope' }), { status: 'unavailable' });
});
