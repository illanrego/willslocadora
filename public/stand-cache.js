(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LocadoraStandCache = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createBoundedStandCache(limit = 3) {
    const capacity = Math.max(1, Number(limit) || 3);
    const entries = new Map();

    function get(key) {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key);
      entries.delete(key);
      entries.set(key, value);
      return value;
    }

    function set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > capacity) entries.delete(entries.keys().next().value);
      return value;
    }

    return {
      get,
      set,
      clear: () => entries.clear(),
      get size() { return entries.size; },
    };
  }

  return { createBoundedStandCache };
}));
