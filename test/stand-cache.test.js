const test = require('node:test');
const assert = require('node:assert/strict');
const { createBoundedStandCache } = require('../public/stand-cache.js');

test('stand cache keeps only the three most recently used stands', () => {
  const cache = createBoundedStandCache(3);
  cache.set(0, { titles: ['a'] });
  cache.set(1, { titles: ['b'] });
  cache.set(2, { titles: ['c'] });

  assert.deepEqual(cache.get(0), { titles: ['a'] });
  cache.set(3, { titles: ['d'] });

  assert.equal(cache.get(1), undefined);
  assert.deepEqual(cache.get(0), { titles: ['a'] });
  assert.deepEqual(cache.get(2), { titles: ['c'] });
  assert.deepEqual(cache.get(3), { titles: ['d'] });
  assert.equal(cache.size, 3);
});

test('stand cache clears all old query data', () => {
  const cache = createBoundedStandCache(3);
  cache.set(0, { titles: ['old'] });
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.get(0), undefined);
});
