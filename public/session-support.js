(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LocadoraSessionSupport = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function donationSettings(config = {}) {
    const pixKey = typeof config.pixKey === 'string' ? config.pixKey.trim() : '';
    const qrImage = typeof config.qrImage === 'string' && /^\.\/images\/[a-zA-Z0-9_/-]+\.(png|jpe?g|webp|svg)$/.test(config.qrImage) && !config.qrImage.includes('..') ? config.qrImage : '';
    return { pixKey, qrImage: pixKey ? qrImage : '' };
  }

  function titleIdentity(title) {
    const id = String(title.tmdbId || title.id || '').replace(/^tmdb:/, '');
    return ['movie', 'series'].includes(title.type) && /^[1-9]\d{0,9}$/.test(id) ? { id, type: title.type } : null;
  }

  // Ads tiers are the same base service; paid channels deliberately remain separate.
  const PROVIDER_IDS = { netflix: [8, 1796], 'prime-video': [119], max: [1899], 'disney-plus': [337], globoplay: [307], 'paramount-plus': [531], 'apple-tv-plus': [350], mubi: [11], crunchyroll: [283] };
  function groupOffers(offers, selected) {
    const ids = new Set(selected.flatMap((id) => PROVIDER_IDS[id] || []));
    return { selected: offers.filter((offer) => ids.has(offer.providerId)), other: offers.filter((offer) => !ids.has(offer.providerId)) };
  }

  function allYearsPreference(saved) { return saved === null || saved === 'true'; }

  async function copyPixKey(key, clipboard) {
    if (!key) return false;
    try { await clipboard.writeText(key); return true; } catch { return false; }
  }

  function install({ translate: t, api, selectedProviders }) {
    const $ = (selector) => document.querySelector(selector);
    const cache = new Map();
    const settings = donationSettings(window.LocadoraDonationConfig);
    const donation = $('#donation-dialog');
    const streaming = $('#streaming-dialog');
    let streamingTitle = null;
    let donationOrigin = null;
    let streamingOrigin = null;
    let copyVersion = 0;
    function button(label, action, className = 'support-link') {
      const element = document.createElement('button'); element.type = 'button'; element.className = className;
      element.textContent = label; element.addEventListener('click', action); return element;
    }
    function openDonation() {
      if (donation.open) return;
      donationOrigin = document.activeElement;
      $('#donation-key-controls').hidden = !settings.pixKey;
      $('#donation-key').value = settings.pixKey;
      const qr = $('#donation-qr');
      qr.alt = t('pixQrAlt'); qr.hidden = !settings.qrImage;
      qr.onerror = () => { qr.hidden = true; $('#donation-status').textContent = t('pixQrFailed'); };
      if (settings.qrImage) qr.src = settings.qrImage;
      $('#donation-status').textContent = settings.pixKey ? '' : t('pixUnavailable');
      donation.showModal();
    }
    async function copyPix() {
      if (!settings.pixKey) return;
      const version = ++copyVersion;
      const copied = await copyPixKey(settings.pixKey, navigator.clipboard);
      if (version !== copyVersion || !donation.open) return;
      if (copied) $('#donation-status').textContent = t('pixCopied');
      else {
        $('#donation-key').focus(); $('#donation-key').select();
        $('#donation-status').textContent = t('pixCopyFailed');
      }
    }
    donation.addEventListener('close', () => { copyVersion += 1; donationOrigin?.isConnected && donationOrigin.focus(); });
    $('#donation-copy').addEventListener('click', copyPix);
    $('#donation-key').addEventListener('click', copyPix);
    document.addEventListener('click', (event) => { if (event.target.closest('[data-support]')) openDonation(); });

    // Each modal needs its own reachable entry: the page dock is inert behind it.
    for (const dialog of document.querySelectorAll('dialog')) {
      if (dialog === donation || dialog.querySelector('[data-support], #tip-jar, #return-tip-jar, #basket-donation')) continue;
      const support = button(t('support'), openDonation); support.dataset.i18n = 'support';
      support.classList.add('dialog-support'); dialog.append(support);
    }

    function externalLink(label, href) {
      const a = document.createElement('a'); a.textContent = label; a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
    }
    async function linksFor(title) {
      const identity = titleIdentity(title);
      if (!identity) return { offers: [], fallbackUrl: '' };
      const key = `${identity.type}:${identity.id}`;
      const previous = cache.get(key);
      if (previous && previous.until > Date.now()) return previous.promise;
      const fallbackUrl = `https://www.themoviedb.org/${identity.type === 'series' ? 'tv' : 'movie'}/${identity.id}/watch?locale=BR`;
      const entry = { until: Date.now() + 60_000 };
      entry.promise = api(`/api/watch-links?${new URLSearchParams(identity)}`, { signal: AbortSignal.timeout(8000) }).then((result) => {
        entry.until = Date.now() + (result.status === 'ok' ? 6 * 60 * 60_000 : 60_000);
        return { ...result, fallbackUrl };
      }).catch(() => ({ offers: [], fallbackUrl }));
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, entry);
      return entry.promise;
    }
    async function renderLinks(host, title) {
      const token = {};
      host.watchToken = token;
      host.classList.add('streaming-options');
      const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = t('loadingStreamings');
      host.replaceChildren(status);
      const result = await linksFor(title);
      if (!host.isConnected || host.watchToken !== token) return;
      host.replaceChildren();
      const offers = (Array.isArray(result.offers) ? result.offers : []).filter((offer) => {
        try { const url = new URL(offer.url); return url.protocol === 'https:' && !url.username && !url.password && !url.port; } catch { return false; }
      });
      const selected = selectedProviders();
      const groups = groupOffers(offers, selected);
      function appendGroup(items, heading) {
        if (!items.length) return;
        if (heading) { const label = document.createElement('p'); label.className = 'streaming-group-label'; label.textContent = heading; host.append(label); }
        const actions = document.createElement('div'); actions.className = 'streaming-actions';
        for (const offer of items) actions.append(externalLink(`${t('openService')} ${offer.providerName}`, offer.url));
        host.append(actions);
      }
      if (!selected.length) appendGroup(offers, '');
      else { appendGroup(groups.selected, t('yourSubscriptions')); appendGroup(groups.other, t('otherSubscriptions')); }
      if (!offers.length) { const empty = document.createElement('p'); empty.textContent = t('streamingUnavailable'); host.append(empty); }
      if (result.fallbackUrl) { const fallback = externalLink(t('streamingFallback'), result.fallbackUrl); fallback.className = 'streaming-fallback'; host.append(fallback); }
      const note = document.createElement('small'); note.className = 'streaming-note'; note.textContent = t('streamingNote');
      const attribution = externalLink('JustWatch', 'https://www.justwatch.com/br');
      host.append(note, attribution);
    }
    function openStreamings(title) {
      streamingTitle = title;
      streamingOrigin = document.activeElement;
      $('#streaming-title').textContent = title.name;
      streaming.showModal();
      renderLinks($('#streaming-options'), title);
    }
    streaming.addEventListener('close', () => { $('#streaming-options').watchToken = null; streamingOrigin?.isConnected && streamingOrigin.focus(); });
    function refreshLocale() {
      if (streaming.open && streamingTitle) renderLinks($('#streaming-options'), streamingTitle);
    }
    return { openDonation, openStreamings, renderLinks, refreshLocale, button };
  }
  return { install, donationSettings, titleIdentity, groupOffers, allYearsPreference, copyPixKey };
}));
