(() => {
  'use strict';

  const status = document.querySelector('#admin-status');
  const body = document.querySelector('#users-body');
  const search = document.querySelector('#user-search');
  const refresh = document.querySelector('#refresh-users');
  const catalogueBody = document.querySelector('#catalogue-body');
  const catalogueSearch = document.querySelector('#catalogue-search');
  const catalogueStatus = document.querySelector('#catalogue-status');
  const catalogueRefresh = document.querySelector('#refresh-catalogue');
  const catalogueForm = document.querySelector('#catalogue-block-form');
  const catalogueType = document.querySelector('#catalogue-type');
  const catalogueTmdbId = document.querySelector('#catalogue-tmdb-id');
  const catalogueReason = document.querySelector('#catalogue-reason');
  let users = [];
  let blocks = [];

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

  function renderCatalogue() {
    const query = catalogueSearch.value.trim().toLowerCase();
    catalogueBody.replaceChildren();
    blocks.filter((block) => !query || `${block.canonicalKey} ${block.reason}`.toLowerCase().includes(query)).forEach((block) => {
      const row = document.createElement('tr');
      const key = document.createElement('td'); key.textContent = block.canonicalKey;
      const reason = document.createElement('td'); reason.textContent = block.reason;
      const created = document.createElement('td'); created.textContent = date(block.createdAt);
      const state = document.createElement('td'); state.textContent = block.active ? 'Ativo' : `Restaurado em ${date(block.removedAt)}`;
      const actions = document.createElement('td');
      if (block.active) {
        const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'admin-restore'; restore.textContent = 'Restaurar';
        restore.addEventListener('click', async () => {
          restore.disabled = true;
          try {
            await window.LocadoraAccount.request(`/v1/admin/catalogue/blocks/${block.type}/${block.tmdbId}/restore`, { method: 'POST', body: '{}' });
            setStatus(`${block.canonicalKey} restaurado.`, 'success');
            await loadCatalogue();
          } catch (error) { setStatus(error.message || 'Não foi possível restaurar o título.', 'error'); }
          finally { restore.disabled = false; }
        });
        actions.append(restore);
      } else actions.textContent = '—';
      row.append(key, reason, created, state, actions);
      catalogueBody.append(row);
    });
  }

  async function loadCatalogue() {
    catalogueRefresh.disabled = true;
    try {
      const params = new URLSearchParams({ active: catalogueStatus.value, limit: '100' });
      const query = catalogueSearch.value.trim();
      if (query) params.set('q', query);
      const result = await window.LocadoraAccount.request(`/v1/admin/catalogue/blocks?${params}`);
      blocks = Array.isArray(result.blocks) ? result.blocks : [];
      renderCatalogue();
    } catch (error) {
      catalogueBody.replaceChildren();
      setStatus(error.message || 'Não foi possível carregar os bloqueios.', 'error');
    } finally { catalogueRefresh.disabled = false; }
  }

  async function load() {
    refresh.disabled = true;
    setStatus('Carregando usuários…');
    try {
      await window.LocadoraAccount.init();
      if (!window.LocadoraAccount.state().signedIn) throw new Error('Entre na Carteirinha primeiro e abra esta página novamente.');
      const [result] = await Promise.all([
        window.LocadoraAccount.request('/v1/admin/users'),
        loadCatalogue(),
      ]);
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
  catalogueSearch.addEventListener('input', renderCatalogue);
  catalogueStatus.addEventListener('change', loadCatalogue);
  catalogueRefresh.addEventListener('click', loadCatalogue);
  catalogueForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const tmdbId = Number(catalogueTmdbId.value);
    if (!Number.isSafeInteger(tmdbId) || tmdbId < 1) { setStatus('Informe um ID TMDB positivo.', 'error'); return; }
    const submit = catalogueForm.querySelector('button[type="submit"]'); submit.disabled = true;
    try {
      await window.LocadoraAccount.request('/v1/admin/catalogue/blocks', { method: 'POST', body: JSON.stringify({ type: catalogueType.value, tmdbId, reason: catalogueReason.value }) });
      catalogueForm.reset();
      setStatus(`${catalogueType.value}:${tmdbId} bloqueado.`, 'success');
      await loadCatalogue();
    } catch (error) { setStatus(error.message || 'Não foi possível bloquear o título.', 'error'); }
    finally { submit.disabled = false; }
  });
  load();
})();
