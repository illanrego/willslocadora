const featuredByYear = new Map();
const FEATURED_YEAR_CACHE_LIMIT = 6;

export function loadFeaturedTitles(year) {
  const key = String(year);
  if (featuredByYear.has(key)) {
    const cached = featuredByYear.get(key);
    featuredByYear.delete(key);
    featuredByYear.set(key, cached);
    return cached;
  }
  featuredByYear.set(key, fetch(window.locadoraApiUrl(`/api/featured?year=${encodeURIComponent(year)}`))
    .then(async (response) => {
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data?.titles) ? data.titles : [];
    })
    .catch(() => []));
  while (featuredByYear.size > FEATURED_YEAR_CACHE_LIMIT) featuredByYear.delete(featuredByYear.keys().next().value);
  return featuredByYear.get(key);
}
