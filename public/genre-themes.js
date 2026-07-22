(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LocadoraGenreThemes = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FALLBACK_THEME = Object.freeze({ backing: '#2f526b', trim: '#527f9e', sign: '#101827', lamp: '#c99a2e' });
  const GENRE_THEMES = Object.freeze({
    'Action & Adventure': Object.freeze({ backing: '#8a421f', trim: '#f09a3e', sign: '#3b1608', lamp: '#ffd06a' }),
    Comedy: Object.freeze({ backing: '#a87913', trim: '#ffe27a', sign: '#503405', lamp: '#fff0a6' }),
    Horror: Object.freeze({ backing: '#4c101b', trim: '#a92e43', sign: '#21060d', lamp: '#e86452' }),
    'Sci-Fi & Fantasy': Object.freeze({ backing: '#49328b', trim: '#ab9cff', sign: '#21154d', lamp: '#d5ceff' }),
    Drama: Object.freeze({ backing: '#6b302b', trim: '#d27b62', sign: '#341311', lamp: '#efaf79' }),
    'Crime & Thriller': Object.freeze({ backing: '#5a1724', trim: '#bd4a61', sign: '#260811', lamp: '#f0b36b' }),
    Romance: Object.freeze({ backing: '#873858', trim: '#f29ab1', sign: '#461628', lamp: '#ffd0a0' }),
    'Family & Animation': Object.freeze({ backing: '#276550', trim: '#8ed179', sign: '#10362d', lamp: '#f4e06f' }),
    Documentary: Object.freeze({ backing: '#4c6634', trim: '#b2c96a', sign: '#243318', lamp: '#e3d990' }),
  });

  function getGenreTheme(genre) {
    return GENRE_THEMES[genre] || FALLBACK_THEME;
  }

  return { FALLBACK_THEME, GENRE_THEMES, getGenreTheme };
}));
