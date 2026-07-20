(() => {
  'use strict';

  const ambiencePack = [
    { url: '/audio/ambience/fluorescent-hum-loop.mp3', volume: 0.08 },
    { url: '/audio/ambience/store-room-tone.mp3', volume: 0.2 },
  ];
  const effects = {
    light: { url: '/audio/ambience/fluorescent-light-flicker.mp3', volume: 0.13, minDelay: 12_000, maxDelay: 28_000 },
    vhs: { url: '/audio/ambience/vhs-eject.mp3', volume: 0.24, minDelay: 35_000, maxDelay: 80_000 },
    bell: { url: '/audio/ambience/shop-door-bell.mp3', volume: 0.28, minDelay: 110_000, maxDelay: 220_000 },
  };

  function decadeForYear(year) {
    const decade = Math.floor(Number(year) / 10) * 10;
    return `${Math.min(2020, Math.max(1980, decade))}s`;
  }

  function musicUrlForYear(year, trackId) {
    return `/audio/music/${decadeForYear(year)}/${trackId}.mp3`;
  }

  function musicUrlsForYear(year, trackId) {
    const preferred = musicUrlForYear(year, trackId);
    const fallback = `/audio/music/1990s/${trackId}.mp3`;
    return preferred === fallback ? [preferred] : [preferred, fallback];
  }

  function createTrack({ url, volume }) {
    const track = new Audio(url);
    track.loop = true;
    track.preload = 'auto';
    track.baseVolume = volume;
    track.volume = volume;
    return track;
  }

  function createStoreAudio(initialYear) {
    const loops = {
      music: [],
      ambience: ambiencePack.map(createTrack),
    };
    const active = new Set();
    const effectTimers = new Map();
    let storeYear = initialYear;
    let musicTrackId = 'night-drive';
    const channelVolumes = { ambience: 1, music: 1 };

    function applyTrackVolume(track, channel) {
      track.volume = track.baseVolume * channelVolumes[channel];
    }

    function scheduleEffect(name) {
      clearTimeout(effectTimers.get(name));
      if (!active.has('ambience')) return;
      const effect = effects[name];
      const delay = effect.minDelay + Math.random() * (effect.maxDelay - effect.minDelay);
      effectTimers.set(name, window.setTimeout(() => {
        const track = new Audio(effect.url);
        track.currentTime = 0;
        track.volume = effect.volume * channelVolumes.ambience;
        track.play().catch(() => {});
        scheduleEffect(name);
      }, delay));
    }

    function scheduleEffects() {
      Object.keys(effects).forEach(scheduleEffect);
    }

    function musicTracks(url) {
      loops.music.forEach((track) => track.pause());
      loops.music = [createTrack({ url, volume: 0.18 })];
      loops.music.forEach((track) => applyTrackVolume(track, 'music'));
      return loops.music;
    }

    async function startMusic() {
      for (const url of musicUrlsForYear(storeYear, musicTrackId)) {
        const tracks = musicTracks(url);
        try {
          await Promise.all(tracks.map((track) => track.play()));
          active.add('music');
          return true;
        } catch {
          tracks.forEach((track) => track.pause());
        }
      }
      throw new Error(`Add the ${decadeForYear(storeYear)} or 1990s music files before turning this on.`);
    }

    function stopEffects() {
      effectTimers.forEach((timer) => clearTimeout(timer));
      effectTimers.clear();
    }

    async function start(channel) {
      if (channel === 'music') return startMusic();
      const tracks = loops.ambience;
      try {
        await Promise.all(tracks.map((track) => track.play()));
      } catch {
        tracks.forEach((track) => track.pause());
        throw new Error('Add the shared ambience files before turning this on.');
      }
      active.add(channel);
      if (channel === 'ambience') scheduleEffects();
      return true;
    }

    function stop(channel) {
      (loops[channel] || []).forEach((track) => {
        track.pause();
        track.currentTime = 0;
      });
      active.delete(channel);
      if (channel === 'ambience') stopEffects();
      return false;
    }

    async function setYear(year) {
      const changedDecade = decadeForYear(year) !== decadeForYear(storeYear);
      storeYear = year;
      if (!changedDecade || !active.has('music')) return;
      stop('music');
      await start('music');
    }

    async function setMusicTrack(trackId) {
      if (trackId === musicTrackId) return active.has('music');
      musicTrackId = trackId;
      if (!active.has('music')) return false;
      stop('music');
      await start('music');
      return true;
    }

    function setVolume(channel, value) {
      if (!(channel in channelVolumes)) return;
      channelVolumes[channel] = Math.min(1, Math.max(0, Number(value)));
      loops[channel].forEach((track) => applyTrackVolume(track, channel));
    }

    return {
      async toggle(channel) {
        return active.has(channel) ? stop(channel) : start(channel);
      },
      setYear,
      setMusicTrack,
      setVolume,
      stopAll() {
        stop('music');
        stop('ambience');
      },
    };
  }

  window.LocadoraAudio = { createStoreAudio, decadeForYear, musicUrlForYear };
})();
