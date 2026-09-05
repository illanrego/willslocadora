const test = require('node:test');
const assert = require('node:assert/strict');
const { donationSettings, titleIdentity, groupOffers, allYearsPreference, copyPixKey } = require('../public/session-support.js');

test('Pix starts unconfigured and only accepts a supplied local QR with a real key', () => {
  assert.deepEqual(donationSettings(), { pixKey: '', qrImage: '' });
  assert.deepEqual(donationSettings({ pixKey: ' example-key ', qrImage: './images/pix-qr.png' }), { pixKey: 'example-key', qrImage: './images/pix-qr.png' });
  assert.equal(donationSettings({ qrImage: './images/pix.png' }).qrImage, '');
  assert.equal(donationSettings({ pixKey: 'key', qrImage: 'https://untrusted.test/qr.png' }).qrImage, '');
  assert.equal(donationSettings({ pixKey: 'key', qrImage: './images/../../private.png' }).qrImage, '');
});

test('rental snapshots and catalogue titles retain their movie/series identity', () => {
  assert.deepEqual(titleIdentity({ id: 'tmdb:603', type: 'movie' }), { id: '603', type: 'movie' });
  assert.deepEqual(titleIdentity({ tmdbId: 603, type: 'series' }), { id: '603', type: 'series' });
  assert.equal(titleIdentity({ id: 'tt123', type: 'movie' }), null);
});

test('selected subscriptions prioritize base services without treating add-on channels as included', () => {
  const netflix = { providerId: 8 }, ads = { providerId: 1796 }, prime = { providerId: 119 }, channel = { providerId: 1825 };
  assert.deepEqual(groupOffers([channel, netflix, ads, prime], ['netflix', 'prime-video']), { selected: [netflix, ads, prime], other: [channel] });
});

test('first-time visitors default to all years while explicit saved preferences are retained', () => {
  assert.equal(allYearsPreference(null), true);
  assert.equal(allYearsPreference('false'), false);
  assert.equal(allYearsPreference('true'), true);
});

test('Pix copy reports success only after writing the exact key and allows manual fallback', async () => {
  let copied = '';
  assert.equal(await copyPixKey('example-key', { writeText: async (value) => { copied = value; } }), true);
  assert.equal(copied, 'example-key');
  assert.equal(await copyPixKey('example-key', { writeText: async () => { throw new Error('denied'); } }), false);
  assert.equal(await copyPixKey('example-key', undefined), false);
  assert.equal(await copyPixKey('', { writeText: () => { throw new Error('must not copy an empty key'); } }), false);
});
