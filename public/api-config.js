(() => {
  const local = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
  const base = local ? '' : 'https://locadora-api.willstartpage.workers.dev/v1';
  const workerPath = (path) => {
    const endpoint = path.replace(/^\/api/, '').replace(/^\/meta/, '/title').replace(/^\/poster/, '/image');
    return `${base}${endpoint}`;
  };

  window.locadoraIsPublic = Boolean(base);
  window.locadoraApiUrl = (path) => base ? workerPath(path) : path;
  window.locadoraPosterUrl = (source) => source
    ? window.locadoraApiUrl(`/api/poster?${new URLSearchParams({ url: source })}`)
    : '';
})();
