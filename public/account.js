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
    if (!response.ok) {
      const error = new Error(body.message || body.error || 'Não foi possível concluir essa ação.');
      error.code = body.code || '';
      error.status = response.status;
      throw error;
    }
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
    dialog.innerHTML = `<form method="dialog" class="panel-header"><div><span class="eyebrow">CARTEIRINHA</span><h2>Entrar na Locadora</h2></div><button class="dialog-close" value="close" aria-label="Fechar">×</button></form><div id="auth-status" class="auth-feedback" role="alert" aria-live="assertive" hidden></div><form id="auth-form" class="source-form"><label for="auth-identifier">Email ou nome de usuário</label><input id="auth-identifier" name="identifier" autocomplete="username" required aria-describedby="auth-status"><p class="auth-field-hint" id="auth-identifier-hint">Entre com o email ou nome que você cadastrou.</p><label for="auth-password">Senha</label><input id="auth-password" name="password" type="password" minlength="8" autocomplete="current-password" required aria-describedby="auth-status"><label id="auth-username-label" for="auth-username" hidden>Nome de usuário</label><input id="auth-username" name="username" minlength="3" maxlength="24" pattern="[a-z0-9_-]{3,24}" autocomplete="nickname" hidden aria-describedby="auth-status"><p class="auth-field-hint" id="auth-username-hint" hidden>Use de 3 a 24 letras minúsculas, números, _ ou -.</p><div class="auth-form-actions"><button class="account-action" id="auth-submit" type="submit">Entrar</button><button class="account-action account-secondary-action" id="auth-mode" type="button">Criar conta</button></div></form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('#auth-form');
    let signup = false;
    const status = dialog.querySelector('#auth-status');
    const identifierInput = dialog.querySelector('#auth-identifier');
    const passwordInput = dialog.querySelector('#auth-password');
    const usernameInput = dialog.querySelector('#auth-username');
    const submit = dialog.querySelector('#auth-submit');
    const modeButton = dialog.querySelector('#auth-mode');
    const setFeedback = (message, tone = 'error') => {
      status.textContent = message;
      status.dataset.tone = tone;
      status.hidden = !message;
    };
    const setBusy = (busy) => {
      submit.disabled = busy;
      modeButton.disabled = busy;
      submit.textContent = busy ? (signup ? 'Criando…' : 'Entrando…') : (signup ? 'Criar conta' : 'Entrar');
    };
    const clearFieldErrors = () => [identifierInput, passwordInput, usernameInput].forEach((input) => input.removeAttribute('aria-invalid'));
    const showFieldError = (input, message) => { input.setAttribute('aria-invalid', 'true'); setFeedback(message); input.focus(); };
    [identifierInput, passwordInput, usernameInput].forEach((input) => input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); if (status.dataset.tone === 'error') setFeedback(''); }));
    modeButton.addEventListener('click', () => {
      signup = !signup;
      modeButton.textContent = signup ? 'Já tenho conta' : 'Criar conta';
      submit.textContent = signup ? 'Criar conta' : 'Entrar';
      dialog.querySelector('#auth-username-label').hidden = !signup;
      usernameInput.hidden = !signup;
      usernameInput.required = signup;
      dialog.querySelector('#auth-username-hint').hidden = !signup;
      identifierInput.type = signup ? 'email' : 'text';
      identifierInput.autocomplete = signup ? 'email' : 'username';
      setFeedback('');
      clearFieldErrors();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const identifier = String(data.get('identifier') || '').trim();
      const password = String(data.get('password') || '');
      const usernameValue = String(data.get('username') || '').trim().toLowerCase();
      clearFieldErrors();
      if (!identifier || (signup && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier))) return showFieldError(identifierInput, 'Digite um email válido para criar sua conta.');
      if (password.length < 8) return showFieldError(passwordInput, 'A senha precisa ter pelo menos 8 caracteres.');
      if (signup && !/^[a-z0-9_-]{3,24}$/.test(usernameValue)) return showFieldError(usernameInput, 'Escolha um nome de 3–24 caracteres: letras minúsculas, números, _ ou -.');
      setFeedback('');
      setBusy(true);
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
      } catch (error) {
        const messages = {
          INVALID_USERNAME_OR_PASSWORD: 'Não encontramos essa combinação de login e senha. Confira os dados ou crie sua conta.',
          USERNAME_IS_ALREADY_TAKEN: 'Esse nome de usuário já está em uso. Escolha outro.',
          USER_ALREADY_EXISTS: 'Já existe uma conta com esse email. Entre usando a senha cadastrada.',
          INVALID_EMAIL: 'Esse email não parece válido. Confira a digitação.',
        };
        const message = messages[error.code] || (error.status >= 500 ? 'A Locadora está temporariamente indisponível. Tente novamente em instantes.' : 'Não foi possível concluir. Confira os dados e tente de novo.');
        setFeedback(message);
      } finally { setBusy(false); }
    });
    return dialog;
  }

  window.LocadoraAccount = Object.freeze({
    init,
    request,
    publicRequest,
    state: () => state,
    onChange(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    async signIn() { const dialog = ensureDialog(); dialog.querySelector('#auth-status').hidden = true; dialog.querySelector('#auth-status').textContent = ''; dialog.querySelector('#auth-form').reset(); dialog.showModal(); },
    async signOut() {
      try { if (token) await authRequest('/sign-out', { method: 'POST', body: '{}' }); } finally {
        token = ''; window.localStorage.removeItem(tokenKey); state = Object.freeze({ configured: Boolean(authApiBase), signedIn: false, user: null }); emit();
      }
      return state;
    },
  });
})();
