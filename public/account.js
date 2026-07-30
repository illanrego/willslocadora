(() => {
  'use strict';

  const config = window.LocadoraAuthConfig || {};
  const publishableKey = String(config.clerkPublishableKey || '').trim();
  const frontendApi = String(config.clerkFrontendApi || '').trim().replace(/^https:\/\//, '').replace(/\/+$/, '');
  const dataApiBase = String(config.dataApiBase || '').replace(/\/+$/, '');
  const subscribers = new Set();
  let clerk = null;
  let state = Object.freeze({ configured: Boolean(publishableKey && frontendApi && dataApiBase), signedIn: false, user: null });

  function emit() {
    state = Object.freeze({
      configured: Boolean(publishableKey && frontendApi && dataApiBase),
      signedIn: Boolean(clerk?.user && clerk?.session),
      user: clerk?.user ? { id: clerk.user.id, username: clerk.user.username || null } : null,
    });
    subscribers.forEach((listener) => listener(state));
    return state;
  }

  function loadClerkScript(name, source, attributes = {}) {
    return new Promise((resolve, reject) => {
      const selector = `script[data-locadora-clerk="${name}"]`;
      const existing = document.querySelector(selector);
      if (existing) { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); return; }
      const script = document.createElement('script');
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.dataset.locadoraClerk = name;
      Object.entries(attributes).forEach(([key, value]) => script.setAttribute(key, value));
      script.src = source;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error('Clerk could not be loaded')), { once: true });
      document.head.append(script);
    });
  }

  async function init() {
    if (!state.configured) return emit();
    if (!window.__internal_ClerkUICtor) await loadClerkScript('ui', `https://${frontendApi}/npm/@clerk/ui@1/dist/ui.browser.js`);
    if (!window.Clerk) await loadClerkScript('sdk', `https://${frontendApi}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, { 'data-clerk-publishable-key': publishableKey });
    clerk = window.Clerk;
    if (!clerk?.load) throw new Error('Clerk did not initialise');
    await clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
    clerk.addListener?.(() => emit());
    return emit();
  }

  async function request(path, options = {}) {
    if (!state.configured) throw new Error('Accounts are not configured yet');
    if (!clerk?.session) throw new Error('Sign in to use your personal Locadora');
    const token = await clerk.session.getToken();
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    const headers = new Headers(options.headers || {});
    headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${dataApiBase}${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }

  window.LocadoraAccount = Object.freeze({
    init,
    request,
    state: () => state,
    onChange(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    async signIn() { if (!state.configured) throw new Error('Accounts are not configured yet'); await clerk?.openSignIn?.(); },
    async signOut() { await clerk?.signOut?.(); return emit(); },
  });
})();
