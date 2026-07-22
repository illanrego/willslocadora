const featuredByYear = new Map();

export function loadFeaturedTitles(year) {
  const key = String(year);
  if (!featuredByYear.has(key)) featuredByYear.set(key, fetch(window.locadoraApiUrl(`/api/featured?year=${encodeURIComponent(year)}`))
    .then(async (response) => {
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data?.titles) ? data.titles : [];
    })
    .catch(() => []));
  return featuredByYear.get(key);
}
