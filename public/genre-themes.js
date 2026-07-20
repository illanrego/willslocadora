(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LocadoraGenreThemes = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FALLBACK_THEME = Object.freeze({ backing: '#2f526b', trim: '#527f9e', sign: '#101827', lamp: '#c99a2e' });
  const GENRE_THEMES = Object.freeze({
    'Action & Adventure': Object.freeze({ backing: '#70402b', trim: '#d47a3c', sign: '#30170f', lamp: '#f2a84b' }),
    Comedy: Object.freeze({ backing: '#5b4b76', trim: '#b98645', sign: '#2a2137', lamp: '#f2c744' }),
    Horror: Object.freeze({ backing: '#45252b', trim: '#8e343a', sign: '#1c1013', lamp: '#d6783b' }),
    'Sci-Fi & Fantasy': Object.freeze({ backing: '#38346a', trim: '#8e8ae8', sign: '#1d1a42', lamp: '#a8b6ff' }),
    Drama: Object.freeze({ backing: '#594133', trim: '#9b6945', sign: '#2b1d18', lamp: '#e2a65a' }),
    'Crime & Thriller': Object.freeze({ backing: '#244b43', trim: '#6f9a7a', sign: '#102820', lamp: '#c0bf72' }),
    Romance: Object.freeze({ backing: '#673b52', trim: '#c7758c', sign: '#351a2a', lamp: '#f2a16f' }),
    'Family & Animation': Object.freeze({ backing: '#3f655d', trim: '#8ab86e', sign: '#203d39', lamp: '#f2d15c' }),
    Documentary: Object.freeze({ backing: '#53634a', trim: '#a8a56c', sign: '#2d382b', lamp: '#ddd08a' }),
  });

  function getGenreTheme(genre) {
    return GENRE_THEMES[genre] || FALLBACK_THEME;
  }

  return { FALLBACK_THEME, GENRE_THEMES, getGenreTheme };
}));
