(() => {
  'use strict';

  const config = window.LocadoraAuthConfig || {};
  const authApiBase = String(config.authApiBase || config.dataApiBase || '').replace(/\/+$/, '');
  const subscribers = new Set();
  const tokenKey = 'locadora.auth.token';
  let token = window.localStorage.getItem(tokenKey) || '';
  let state = Object.freeze({ configured: Boolean(authApiBase), signedIn: false, user: null });

  function emit() {
    state = Object.freeze({ configured: Boolean(authApiBase), signedIn: Boolean(token && state.user), user: state.user });
    subscribers.forEach((listener) => listener(state));
    return state;
  }

  async function authRequest(path, options = {}) {
    if (!authApiBase) throw new Error('Accounts are not configured yet');
    const headers = new Headers(options.headers || {});
    headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${authApiBase}/api/auth${path}`, { ...options, headers, credentials: 'include' });
    const nextToken = response.headers.get('set-auth-token');
    if (nextToken) { token = nextToken; window.localStorage.setItem(tokenKey, token); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.error || 'Não foi possível entrar.');
    return body;
  }

  async function init() {
    if (!authApiBase || !token) return emit();
    try {
      const body = await authRequest('/get-session', { method: 'GET', headers: {} });
      state = Object.freeze({ configured: true, signedIn: Boolean(body?.user), user: body?.user ? { id: body.user.id, username: body.user.username || null } : null });
    } catch {
      token = '';
      window.localStorage.removeItem(tokenKey);
      state = Object.freeze({ configured: true, signedIn: false, user: null });
    }
    return emit();
  }

  async function request(path, options = {}) {
    if (!state.configured) throw new Error('Accounts are not configured yet');
    if (!token) throw new Error('Entre para usar sua Locadora pessoal');
    const headers = new Headers(options.headers || {});
    headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${authApiBase}${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }

  async function publicRequest(path, options = {}) {
    if (!authApiBase) throw new Error('Reviews are not configured yet');
    const response = await fetch(`${authApiBase}${path}`, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }

  function ensureDialog() {
    let dialog = document.querySelector('#auth-dialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'auth-dialog';
    dialog.className = 'panel-dialog member-dialog';
    dialog.innerHTML = `<form method="dialog" class="panel-header"><div><span class="eyebrow">CARTEIRINHA</span><h2>Entrar na Locadora</h2></div><button class="dialog-close" value="close" aria-label="Fechar">×</button></form><p id="auth-status" class="panel-copy" role="status" aria-live="polite"></p><form id="auth-form" class="source-form"><label for="auth-identifier">Email ou nome de usuário</label><input id="auth-identifier" name="identifier" autocomplete="username" required><label for="auth-password">Senha</label><input id="auth-password" name="password" type="password" minlength="8" autocomplete="current-password" required><label id="auth-username-label" for="auth-username" hidden>Nome de usuário</label><input id="auth-username" name="username" minlength="3" maxlength="24" pattern="[a-z0-9_-]{3,24}" autocomplete="nickname" hidden><div><button class="account-action" id="auth-submit" type="submit">Entrar</button><button class="account-action" id="auth-mode" type="button">Criar conta</button></div></form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('#auth-form');
    let signup = false;
    dialog.querySelector('#auth-mode').addEventListener('click', () => {
      signup = !signup;
      dialog.querySelector('#auth-mode').textContent = signup ? 'Já tenho conta' : 'Criar conta';
      dialog.querySelector('#auth-submit').textContent = signup ? 'Criar conta' : 'Entrar';
      dialog.querySelector('#auth-username-label').hidden = !signup;
      dialog.querySelector('#auth-username').hidden = !signup;
      dialog.querySelector('#auth-username').required = signup;
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const identifier = String(data.get('identifier') || '').trim();
      const password = String(data.get('password') || '');
      const usernameValue = String(data.get('username') || '').trim().toLowerCase();
      const status = dialog.querySelector('#auth-status');
      try {
        const body = signup
          ? await authRequest('/sign-up/email', { method: 'POST', body: JSON.stringify({ name: usernameValue, email: identifier, password, username: usernameValue }) })
          : (/^[^\s@]+@[^\s@]+$/.test(identifier)
            ? await authRequest('/sign-in/email', { method: 'POST', body: JSON.stringify({ email: identifier, password }) })
            : await authRequest('/sign-in/username', { method: 'POST', body: JSON.stringify({ username: identifier, password }) }));
        state = Object.freeze({ configured: true, signedIn: true, user: body?.user ? { id: body.user.id, username: body.user.username || null } : null });
        if (signup) await request('/v1/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: usernameValue }) });
        emit();
        dialog.close();
      } catch (error) { status.textContent = error.message; }
    });
    return dialog;
  }

  window.LocadoraAccount = Object.freeze({
    init,
    request,
    publicRequest,
    state: () => state,
    onChange(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    async signIn() { const dialog = ensureDialog(); dialog.querySelector('#auth-status').textContent = ''; dialog.showModal(); },
    async signOut() {
      try { if (token) await authRequest('/sign-out', { method: 'POST', body: '{}' }); } finally {
        token = ''; window.localStorage.removeItem(tokenKey); state = Object.freeze({ configured: Boolean(authApiBase), signedIn: false, user: null }); emit();
      }
      return state;
    },
  });
})();
