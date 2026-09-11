const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync(require.resolve('../public/store-ambience.js'), 'utf8');

test('master mute silences active channels and restores their configured levels', () => {
  const tracks = [];
  class Audio {
    constructor(url) { this.url = url; this.volume = 1; this.currentTime = 0; tracks.push(this); }
    addEventListener() {}
    play() { return Promise.resolve(); }
    pause() {}
  }
  const window = { setTimeout: () => 1 };
  vm.runInNewContext(source, { Audio, clearTimeout() {}, console, Math, window });

  const audio = window.LocadoraAudio.createStoreAudio(1999);
  audio.setVolume('ambience', .5);
  assert.deepEqual(tracks.map((track) => track.volume), [.04, .1]);
  assert.equal(audio.setMuted(true), true);
  assert.equal(audio.isMuted(), true);
  assert.deepEqual(tracks.map((track) => track.volume), [0, 0]);

  audio.setVolume('ambience', .25);
  assert.deepEqual(tracks.map((track) => track.volume), [0, 0]);
  assert.equal(audio.setMuted(false), false);
  assert.deepEqual(tracks.map((track) => track.volume), [.02, .05]);
});
