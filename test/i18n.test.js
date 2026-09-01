const test = require('node:test');
const assert = require('node:assert/strict');

const { COPY, createTranslator, normalizeLocale } = require('../public/i18n.js');

test('normalizeLocale accepts only the supported locales', () => {
  assert.equal(normalizeLocale('pt-BR'), 'pt-BR');
  assert.equal(normalizeLocale('en-US'), 'en-US');
  assert.equal(normalizeLocale('fr-FR'), 'pt-BR');
});

test('tape action labels avoid decorative arrow characters', () => {
  for (const locale of ['pt-BR', 'en-US']) {
    assert.doesNotMatch(COPY[locale].watchOptions, /[↗→]/);
    assert.doesNotMatch(COPY[locale].stremio, /[↗→]/);
  }
});

test('translator falls back to Portuguese when a key is missing', () => {
  const translate = createTranslator({
    'pt-BR': { greeting: 'Olá', onlyPortuguese: 'Somente português' },
    'en-US': { greeting: 'Hello' },
  }, 'en-US');

  assert.equal(translate('greeting'), 'Hello');
  assert.equal(translate('onlyPortuguese'), 'Somente português');
  assert.equal(translate('missing.key'), 'missing.key');
});
