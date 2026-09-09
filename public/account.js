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
    if (!authApiBase || !token) {
      const result = emit();
      const resetToken = new URL(window.location.href).searchParams.get('token');
      if (resetToken) window.setTimeout(() => openPasswordReset(resetToken), 0);
      return result;
    }
    try {
      const body = await authRequest('/get-session', { method: 'GET', headers: {} });
      state = Object.freeze({ configured: true, signedIn: Boolean(body?.user), user: body?.user ? { id: body.user.id, username: body.user.username || null } : null });
    } catch {
      token = '';
      window.localStorage.removeItem(tokenKey);
      state = Object.freeze({ configured: true, signedIn: false, user: null });
    }
    const result = emit();
    const resetToken = new URL(window.location.href).searchParams.get('token');
    if (resetToken) window.setTimeout(() => openPasswordReset(resetToken), 0);
    return result;
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
    dialog.innerHTML = `<form method="dialog" class="panel-header"><div><span class="eyebrow">CARTEIRINHA</span><h2 id="auth-heading">Entrar na Locadora</h2></div><button class="dialog-close" value="close" aria-label="Fechar">×</button></form><div id="auth-status" class="auth-feedback" role="alert" aria-live="assertive" hidden></div><form id="auth-form" class="source-form"><label for="auth-identifier">Email ou nome de usuário</label><input id="auth-identifier" name="identifier" autocomplete="username" required aria-describedby="auth-status"><p class="auth-field-hint" id="auth-identifier-hint">Entre com o email ou nome que você cadastrou.</p><label for="auth-password">Senha</label><input id="auth-password" name="password" type="password" minlength="8" autocomplete="current-password" required aria-describedby="auth-status"><label id="auth-username-label" for="auth-username" hidden>Nome de usuário</label><input id="auth-username" name="username" minlength="3" maxlength="24" pattern="[a-z0-9_\\-]{3,24}" autocomplete="nickname" hidden aria-describedby="auth-status"><p class="auth-field-hint" id="auth-username-hint" hidden>Use de 3 a 24 letras minúsculas, números, _ ou -.</p><div class="auth-form-actions"><button class="account-action" id="auth-submit" type="submit">Entrar</button><button class="account-action account-secondary-action" id="auth-mode" type="button">Criar conta</button></div><button class="auth-text-action" id="auth-forgot" type="button">Esqueci minha senha</button></form><form id="reset-form" class="source-form" hidden><p class="auth-field-hint">Escolha uma nova senha para sua Carteirinha.</p><label for="reset-password">Nova senha</label><input id="reset-password" type="password" minlength="8" autocomplete="new-password" required aria-describedby="auth-status"><label for="reset-password-confirm">Repita a nova senha</label><input id="reset-password-confirm" type="password" minlength="8" autocomplete="new-password" required aria-describedby="auth-status"><button class="account-action" type="submit">Salvar nova senha</button></form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('#auth-form');
    let signup = false;
    const status = dialog.querySelector('#auth-status');
    const identifierInput = dialog.querySelector('#auth-identifier');
    const identifierLabel = dialog.querySelector('label[for="auth-identifier"]');
    const passwordInput = dialog.querySelector('#auth-password');
    const usernameInput = dialog.querySelector('#auth-username');
    const submit = dialog.querySelector('#auth-submit');
    const modeButton = dialog.querySelector('#auth-mode');
    const forgotButton = dialog.querySelector('#auth-forgot');
    const resetForm = dialog.querySelector('#reset-form');
    const setFeedback = (message, tone = 'error') => {
      status.textContent = message;
      status.dataset.tone = tone;
      status.hidden = !message;
    };
    const setBusy = (busy) => {
      submit.disabled = busy;
      modeButton.disabled = busy;
      forgotButton.disabled = busy;
      submit.textContent = busy ? (signup ? 'Criando…' : 'Entrando…') : (signup ? 'Criar conta' : 'Entrar');
    };
    const setIdentifierMode = (emailOnly) => {
      identifierLabel.textContent = emailOnly ? 'Email' : 'Email ou nome de usuário';
      identifierInput.type = emailOnly ? 'email' : 'text';
      identifierInput.autocomplete = emailOnly ? 'email' : 'username';
      identifierInput.placeholder = emailOnly ? 'seu@email.com' : '';
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
      forgotButton.hidden = signup;
      setIdentifierMode(signup);
      setFeedback('');
      clearFieldErrors();
    });
    forgotButton.addEventListener('click', async () => {
      setIdentifierMode(true);
      const email = identifierInput.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showFieldError(identifierInput, 'Digite seu email para receber um link de recuperação.');
      setBusy(true);
      try {
        await authRequest('/request-password-reset', { method: 'POST', body: JSON.stringify({ email, redirectTo: `${window.location.origin}${window.location.pathname}?reset=1` }) });
      } catch { /* Keep the response generic so emails cannot be enumerated. */ }
      setFeedback('Se existir uma conta com esse email, enviaremos um link de recuperação.', 'success');
      setBusy(false);
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
          ? await authRequest('/sign-up/email', { method: 'POST', body: JSON.stringify({ name: usernameValue, email: identifier, password, username: usernameValue, callbackURL: `${window.location.origin}${window.location.pathname}?verified=1` }) })
          : (/^[^\s@]+@[^\s@]+$/.test(identifier)
            ? await authRequest('/sign-in/email', { method: 'POST', body: JSON.stringify({ email: identifier, password }) })
            : await authRequest('/sign-in/username', { method: 'POST', body: JSON.stringify({ username: identifier, password }) }));
        state = Object.freeze({ configured: true, signedIn: true, user: body?.user ? { id: body.user.id, username: body.user.username || null } : null });
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
    resetForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = dialog.querySelector('#reset-password');
      const confirmation = dialog.querySelector('#reset-password-confirm');
      if (password.value.length < 8) return showFieldError(password, 'A senha precisa ter pelo menos 8 caracteres.');
      if (password.value !== confirmation.value) return showFieldError(confirmation, 'As senhas precisam ser iguais.');
      const resetButton = resetForm.querySelector('button[type="submit"]');
      const resetToken = resetForm.dataset.token || '';
      if (!resetToken) return setFeedback('Esse link de recuperação não é válido. Solicite outro.', 'error');
      resetButton.disabled = true;
      try {
        await authRequest('/reset-password', { method: 'POST', body: JSON.stringify({ token: resetToken, newPassword: password.value }) });
        window.history.replaceState({}, '', window.location.pathname);
        resetForm.hidden = true;
        form.hidden = false;
        dialog.querySelector('#auth-heading').textContent = 'Entrar na Locadora';
        setFeedback('Senha atualizada. Agora você já pode entrar.', 'success');
        form.reset();
      } catch {
        setFeedback('Esse link expirou ou já foi usado. Solicite uma nova recuperação.', 'error');
      } finally { resetButton.disabled = false; }
    });
    return dialog;
  }

  function openPasswordReset(resetToken) {
    const dialog = ensureDialog();
    dialog.querySelector('#auth-form').hidden = true;
    const resetForm = dialog.querySelector('#reset-form');
    resetForm.hidden = false;
    resetForm.dataset.token = resetToken;
    dialog.querySelector('#auth-heading').textContent = 'Redefinir senha';
    dialog.querySelector('#auth-status').hidden = true;
    dialog.showModal();
    dialog.querySelector('#reset-password').focus();
  }

  window.LocadoraAccount = Object.freeze({
    init,
    request,
    publicRequest,
    state: () => state,
    onChange(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    async signIn() { const dialog = ensureDialog(); if (dialog.querySelector('#auth-mode').textContent === 'Já tenho conta') dialog.querySelector('#auth-mode').click(); const identifier = dialog.querySelector('#auth-identifier'); identifier.type = 'text'; identifier.autocomplete = 'username'; identifier.placeholder = ''; dialog.querySelector('label[for="auth-identifier"]').textContent = 'Email ou nome de usuário'; dialog.querySelector('#auth-status').hidden = true; dialog.querySelector('#auth-status').textContent = ''; dialog.querySelector('#reset-form').hidden = true; dialog.querySelector('#auth-form').hidden = false; dialog.querySelector('#auth-heading').textContent = 'Entrar na Locadora'; dialog.querySelector('#auth-form').reset(); dialog.showModal(); },
    async signOut() {
      try { if (token) await authRequest('/sign-out', { method: 'POST', body: '{}' }); } finally {
        token = ''; window.localStorage.removeItem(tokenKey); state = Object.freeze({ configured: Boolean(authApiBase), signedIn: false, user: null }); emit();
      }
      return state;
    },
  });
})();
