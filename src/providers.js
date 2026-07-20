'use strict';

const BRAZIL_PROVIDERS = Object.freeze([
  { id: 'netflix', tmdbProviderId: 8, canonicalName: 'Netflix', displayName: 'Netflix', logoPath: '/images/providers/netflix.svg' },
  { id: 'prime-video', tmdbProviderId: 119, canonicalName: 'Amazon Prime Video', displayName: 'Prime Video', logoPath: '/images/providers/amazon-prime-video.svg' },
  { id: 'max', tmdbProviderId: 1899, canonicalName: 'HBO Max', displayName: 'Max', logoPath: '/images/providers/hbo-max.svg' },
  { id: 'disney-plus', tmdbProviderId: 337, canonicalName: 'Disney Plus', displayName: 'Disney+', logoPath: '' },
  { id: 'globoplay', tmdbProviderId: 307, canonicalName: 'Globoplay', displayName: 'Globoplay', logoPath: '' },
  { id: 'paramount-plus', tmdbProviderId: 531, canonicalName: 'Paramount Plus', displayName: 'Paramount+', logoPath: '' },
  { id: 'apple-tv-plus', tmdbProviderId: 350, canonicalName: 'Apple TV', displayName: 'Apple TV+', logoPath: '' },
  { id: 'mubi', tmdbProviderId: 11, canonicalName: 'MUBI', displayName: 'MUBI', logoPath: '' },
  { id: 'crunchyroll', tmdbProviderId: 283, canonicalName: 'Crunchyroll', displayName: 'Crunchyroll', logoPath: '' },
]);
const PROVIDERS_BY_ID = new Map(BRAZIL_PROVIDERS.map((provider) => [provider.id, provider]));

function normalizeProviderIds(values) {
  const ids = Array.isArray(values) ? values : String(values || '').split(',');
  return [...new Set(ids.map((id) => String(id).trim()).filter((id) => PROVIDERS_BY_ID.has(id)))].sort();
}

module.exports = { BRAZIL_PROVIDERS, PROVIDERS_BY_ID, normalizeProviderIds };
