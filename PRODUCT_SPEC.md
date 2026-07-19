# Locadora — product specification

**Status:** initial plan  
**Date:** 2026-07-19  
**Product type:** local web GUI, with a future desktop wrapper only after the web experience proves itself

## One-line concept

Locadora is a local, decade-selectable 1990s video-rental store where people browse a genre-first catalogue as physical shelves, then launch the chosen title in their installed Stremio client.

## Core product truth

Locadora makes discovery feel like visiting a video store, not filtering a database:

> Pick a store year. Enter the store as it could exist then. Browse the shelves. Take a title to Stremio.

The selected year is a real discovery mechanic: it limits titles to releases available by that date and changes the store's presentation and “new arrivals” logic.

## Intended user

A Stremio user with their own configured add-ons who wants a more tactile, curated, genre-led way to discover something to watch on a desktop or local network machine.

Locadora is initially personal/local software, not a public streaming catalogue or a replacement for Stremio.

## Product boundaries

### Locadora owns

- 1990s rental-store visual world and interaction model.
- Genre aisles as primary navigation.
- Store-year selection and historical release filtering.
- Shelf organisation, curation, title detail, counter queue, and local preferences.
- A safe local catalogue bridge for catalogue-capable Stremio add-ons, if the integration spike proves it viable.
- Sending a selected known item to the installed Stremio client.

### Stremio owns

- User account and installed add-ons.
- Stream discovery, torrent/debrid/provider handling, playback, subtitles, casting, and local streaming engine.
- Resolving whether a particular selected title is currently watchable.

### Explicitly out of scope for MVP

- Implementing torrents, debrid, streams, playback, subtitles, or a Stremio add-on.
- Embedding or cloning the Stremio player/UI.
- Scraping Stremio's screen or private Flatpak/session files.
- Exposing the app or bridge to the internet.
- Full free-roam 3D, WASD movement, multiplayer, accounts, social features, or a mobile app.
- Claiming every installed add-on can fill shelves: stream-only add-ons cannot provide browsable catalogues.

## MVP experience

### 1. Enter the store

The home screen presents a stylised 2.5D/isometric store with a practical fallback shelf view. The first navigation choice is genre, not an all-purpose search field.

Initial aisle set:

- Action & Adventure
- Comedy
- Horror
- Science Fiction & Fantasy
- Drama & Romance
- Thriller / Mystery

The exact visual treatment is deliberately secondary to the browsing loop; it must work cleanly with keyboard, mouse, and a narrow desktop window before visual effects grow.

### 2. Set the store year

A year dial/preset control changes the latest eligible release date. Initial presets: 1987, 1991, 1994, 1997, and 1999. A title is eligible when its release date is on or before the selected year.

Store year controls:

- eligible title set;
- “new arrivals” (recent releases relative to that year);
- copy/signage and small presentation variations later.

It does **not** pretend the catalogue perfectly reconstructs historical local inventory; it is a discovery lens over the available catalogue.

### 3. Browse shelves

Each aisle displays VHS-inspired cases in paged/virtualised shelves. Cards show poster, title, year, and short genre labels. Filters remain sparse: year availability is implicit; genre is the aisle; director is a secondary route.

Shelf collections for MVP:

- genre aisle;
- New This Year;
- Staff Picks (deterministic local curation);
- Director shelf when data supports it;
- Counter queue.

### 4. Inspect a title

The title detail view shows poster, title, release year, genres, director where available, synopsis, and related shelf placement. The main actions are **Take to counter** and **Watch in Stremio**.

### 5. Checkout / playback handoff

Locadora sends an identified title to the registered native Stremio handler. Stremio then uses the user's own add-ons to resolve streams and play. The first integration spike must establish one exact, repeatable title URI/handoff shape before this is treated as shipped.

## Catalogue model

Locadora must not require the user to maintain title data.

### Preferred source: Stremio-connected catalogue mode

A localhost-only bridge receives explicit user-authorised add-on transport/configuration data and queries only catalogue-capable add-ons using their documented manifests/catalogue endpoints. It normalises results locally and caches non-secret metadata.

- Catalogue-capable add-ons can populate shelves.
- Stream-only add-ons participate only after a user selects a known item in Stremio.
- Add-ons with incomplete filtering can be locally filtered by genre/release year after paged retrieval.
- Results must be deduplicated by stable Stremio/IMDb-style identifier where available.

The bridge must never be based on scraping Stremio's private files. The precise authorised configuration source remains an integration-spike decision.

### Fallback: metadata discovery mode

If bridge access is unavailable or an add-on is not catalogue-capable, Locadora may use a legitimate public metadata source for browsing. It still delegates the final stream lookup to Stremio. This fallback must clearly avoid promising that an item is available before Stremio resolves it.

## Data entities

- **Title:** stable ID, type (movie/series), name, release year/date, genres, director(s), poster, synopsis, source IDs.
- **Catalogue source:** add-on identity, transport base URL, catalogue ID/type, supported filters, enabled state. Sensitive configuration is never sent to browser logs or remote services.
- **Shelf:** a derived title collection: genre, Store Year, source/cursor, sort, pagination state.
- **Store setting:** selected store year, preferred genres, display mode, audio/accessibility preferences.
- **Counter item:** title ID, added timestamp, optional notes. Stored locally.

## Product and technical decisions already made

- Web first; a Debian desktop app is a later packaging decision, not a separate MVP.
- Local-first, localhost-only architecture.
- 2.5D/isometric atmosphere first, no free-roam 3D in MVP.
- Existing Stremio installation remains the content/playback engine.
- The active local Stremio streaming engine is reachable at port 11470, but it is not assumed to be the catalogue API.
- Native `stremio:` handoff is the intended checkout path; its exact title-link form needs verification.

## Success criteria for the first usable MVP

A user can:

1. open Locadora locally;
2. choose one store-year preset;
3. browse at least three genre shelves backed by real, non-manual title data;
4. inspect a title and add/remove it from the counter;
5. launch one known movie and one known series in native Stremio with a repeatable handoff;
6. use the primary loop without exposing Stremio credentials/configuration to the browser or a hosted service.

## Delivery phases

### Phase 0 — prove integration, do not build the shop

Verify exact native Stremio deep-link handoff and discover a safe, authorised way for a local bridge to obtain and query catalogue-capable add-ons. Produce fixtures from non-sensitive sample catalogue responses.

### Phase 1 — functional local catalogue shell

Build the local web app and localhost bridge boundary. Implement title normalisation, source configuration, caching, release-year filtering, basic genre shelves, and an accessible title detail/handoff action. Start with a plain shelf interface.

### Phase 2 — validate the core rental loop

Add selected year presets, counter queue, shelf pagination, deterministic staff picks, director navigation, error states, and real local playtesting using the installed Stremio client.

### Phase 3 — the Locadora presentation layer

Make the proven shelf loop feel like the store: 2.5D room/aisles, VHS cases, signage, CRT/fluorescent atmosphere, responsive interactions, and reduced-motion mode. Presentation must not obscure or replace basic navigation.

### Later, only after validation

- Desktop packaging for Debian.
- Full 3D navigation / React Three Fiber.
- More store decades, different store skins, physical cassette interactions.
- Optional integration with the local Stremio engine beyond app handoff.

## Open decisions to resolve through spikes

1. What exact `stremio:` URI reliably opens a specific IMDb/Stremio movie and series in the installed Flatpak build?
2. What supported user-authorised mechanism can safely provide the local bridge the installed add-on catalogue transport configuration?
3. Which three catalogue-capable add-ons provide enough genre/release metadata for the first shelves?
4. What web stack best supports the UI after Phase 0 (likely React + Vite, but do not install until the spike is accepted)?
