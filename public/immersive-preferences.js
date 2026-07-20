(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LocadoraImmersivePreferences = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_LIGHTING = Object.freeze({ brightness: 100, warmth: 3200 });
  const BRIGHTNESS_MIN = 25;
  const BRIGHTNESS_MAX = 150;
  const WARMTH_MIN = 2200;
  const WARMTH_MAX = 4200;

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Math.max(minimum, Math.min(maximum, Number.isFinite(number) ? Math.round(number) : fallback));
  }

  function normalizeLighting(value = {}) {
    return {
      brightness: clamp(value.brightness, BRIGHTNESS_MIN, BRIGHTNESS_MAX, DEFAULT_LIGHTING.brightness),
      warmth: clamp(value.warmth, WARMTH_MIN, WARMTH_MAX, DEFAULT_LIGHTING.warmth),
    };
  }

  function kelvinToRgb(kelvin) {
    const temperature = clamp(kelvin, WARMTH_MIN, WARMTH_MAX, DEFAULT_LIGHTING.warmth) / 100;
    let red;
    let green;
    let blue;
    if (temperature <= 66) {
      red = 255;
      green = 99.4708025861 * Math.log(temperature) - 161.1195681661;
      blue = temperature <= 19 ? 0 : 138.5177312231 * Math.log(temperature - 10) - 305.0447927307;
    } else {
      red = 329.698727446 * Math.pow(temperature - 60, -0.1332047592);
      green = 288.1221695283 * Math.pow(temperature - 60, -0.0755148492);
      blue = 255;
    }
    const channel = (value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');
    return `#${channel(red)}${channel(green)}${channel(blue)}`;
  }

  return { BRIGHTNESS_MAX, BRIGHTNESS_MIN, DEFAULT_LIGHTING, WARMTH_MAX, WARMTH_MIN, kelvinToRgb, normalizeLighting };
}));
