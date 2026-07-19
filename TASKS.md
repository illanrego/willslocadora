# Locadora — live ship board

Last updated: 2026-07-19  
Status legend: [ ] todo · [~] in progress · [x] done

## Done

- [x] Established product boundary: Locadora is a local discovery GUI; native Stremio owns add-ons, stream resolution, and playback.
- [x] Proved movie and series `stremio:///detail/...` routes against the installed Flatpak handler without starting playback.
- [x] Chose a constrained hybrid catalogue path: curated Cinemeta, TMDB, and IMDb defaults plus explicit custom catalogue manifests.
- [x] Implemented a dependency-free Node loopback bridge bound to `127.0.0.1`.
- [x] Added manifest validation, per-hop redirect/DNS safety, sanitized source listing, title normalization, and ID deduplication.
- [x] Implemented six genre aisles, 1987–1999 Store Year control, movie/series switch, and five-year period shelves.
- [x] Implemented the VHS store presentation, title details, local counter persistence, empty/error states, responsive layout, and reduced-motion handling.
- [x] Implemented native Stremio handoff and verified generated movie URI in the live UI.
- [x] Broadened historical coverage with capability-aware multi-page catalogue fetching and partial source/page failure isolation.
- [x] Added click-loaded catalogue stands: each keeps existing tapes open, loads a non-duplicate next 48 when available, and resets on aisle/year/type changes.
- [x] Added on-demand Stremio metadata to title details: IMDb score, director, writers, and main cast, without adding that data to shelf cards.
- [x] Renamed the local presentation to Will's Locadora with one compact red/yellow top-bar mark.
- [x] Added canonical `npm test`; 14 tests pass as of the broadened-catalogue verification.
- [x] Exercised the real server, live Cinemeta catalogue, browser UI, detail dialog, counter action, and year refresh without browser console errors.

## Now — playtest the rental loop

- [ ] User playtest: browse several aisles/years and judge whether discovery feels fun rather than merely functional.
- [ ] Click **Watch in Stremio** in the user's normal browser and assess external-app confirmation/focus behavior.
- [x] Classified the important Stremio add-ons: Torrentio is stream-only; TMDB and IMDb expose catalogue resources and are automatic defaults.
- [ ] Decide whether five-year shelves are the right amount of period depth.
- [ ] Review mobile behavior on the user's phone or a real narrow browser window.

## Next — quality after playtest

- [ ] Add source health/removal controls and clearer per-source errors.

- [ ] Add director browse, New This Year, and staff picks only if the core aisle loop works.
- [ ] Add browser-level automated interaction tests if the current visual direction is accepted.

## Explicitly later

- [ ] 2.5D/isometric store only after this simpler shelf UI proves the product loop.
- [ ] Debian desktop packaging only after the local web version is satisfying.

## Session log — 2026-07-19

- Planning foundation and boundaries created.
- Phase 0 protocol/catalogue assumptions replaced with real evidence.
- MVP implemented without dependency installation.
- Live Horror/1999 shelf returned 17 titles; live Action/1999 UI rendered 32 titles across 1995–1999.
- Native Flatpak processes received exact movie and series detail URIs.
- Broadened Horror/1999 from the earlier 17-title sample to the 48-title shelf cap while enforcing the exact 1995–1999 window.

## Next session start here

1. Run `npm start` and open `http://127.0.0.1:4173`.
2. Playtest the complete browse → inspect → counter → Stremio loop.
3. Record what feels wrong before adding features.
