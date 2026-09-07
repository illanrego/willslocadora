(() => {
  'use strict';

  const status = document.querySelector('#admin-status');
  const body = document.querySelector('#users-body');
  const search = document.querySelector('#user-search');
  const refresh = document.querySelector('#refresh-users');
  let users = [];

  function setStatus(message, tone = '') {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function date(value) {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value)); }
    catch { return '—'; }
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    body.replaceChildren();
    users.filter((user) => !query || `${user.email} ${user.username}`.toLowerCase().includes(query)).forEach((user) => {
      const row = document.createElement('tr');
      const email = document.createElement('td'); email.textContent = user.email || '—';
      const username = document.createElement('td'); username.textContent = `@${user.username || '—'}`;
      if (user.emailVerified) { const verified = document.createElement('small'); verified.textContent = 'email confirmado'; username.append(verified); }
      const created = document.createElement('td'); created.textContent = date(user.createdAt);
      const rentals = document.createElement('td'); rentals.textContent = `${user.rentalCount} (${user.activeRentalCount} ativas)`;
      const reviews = document.createElement('td'); reviews.textContent = `${user.reviewCount} · ${user.watchedCount} vistas`;
      const actions = document.createElement('td');
      const revoke = document.createElement('button'); revoke.type = 'button'; revoke.className = 'admin-revoke'; revoke.textContent = 'Revogar sessões';
      revoke.addEventListener('click', async () => {
        if (!window.confirm(`Desconectar ${user.email} de todos os navegadores?`)) return;
        revoke.disabled = true;
        try {
          const result = await window.LocadoraAccount.request(`/v1/admin/users/${encodeURIComponent(user.id)}/revoke-sessions`, { method: 'POST', body: '{}' });
          setStatus(`${result.revoked || 0} sessão(ões) revogada(s).`, 'success');
        } catch (error) { setStatus(error.message || 'Não foi possível revogar as sessões.', 'error'); }
        finally { revoke.disabled = false; }
      });
      actions.append(revoke);
      row.append(email, username, created, rentals, reviews, actions);
      body.append(row);
    });
  }

  async function load() {
    refresh.disabled = true;
    setStatus('Carregando usuários…');
    try {
      await window.LocadoraAccount.init();
      if (!window.LocadoraAccount.state().signedIn) throw new Error('Entre na Carteirinha primeiro e abra esta página novamente.');
      const result = await window.LocadoraAccount.request('/v1/admin/users');
      users = Array.isArray(result.users) ? result.users : [];
      render();
      setStatus(`${users.length} usuário(s) encontrado(s).`, 'success');
    } catch (error) {
      body.replaceChildren();
      setStatus(error.message || 'Acesso negado ou serviço indisponível.', 'error');
    } finally { refresh.disabled = false; }
  }

  search.addEventListener('input', render);
  refresh.addEventListener('click', load);
  load();
})();
