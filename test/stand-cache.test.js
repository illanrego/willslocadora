const test = require('node:test');
const assert = require('node:assert/strict');
const { createBoundedCache, createBoundedStandCache } = require('../public/stand-cache.js');

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

test('bounded cache supports metadata promise eviction and deletion', () => {
  const cache = createBoundedCache(2);
  cache.set('a', Promise.resolve('a'));
  cache.set('b', Promise.resolve('b'));
  cache.get('a');
  cache.set('c', Promise.resolve('c'));
  assert.equal(cache.has('b'), false);
  assert.equal(cache.has('a'), true);
  assert.equal(cache.delete('a'), true);
  assert.equal(cache.size, 1);
});
