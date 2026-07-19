# Locadora

A local, genre-first 1990s video-rental interface for Stremio.

Locadora is not a streaming service, torrent client, player, or Stremio add-on. It is a local discovery GUI: browse a period-aware catalogue, take titles to the counter, then hand them to native Stremio for stream resolution and playback.

## Current status

A runnable MVP is implemented with no third-party application dependencies:

- store years from 1987–1999;
- six genre aisles for movies and series;
- live Stremio catalogue metadata through a loopback bridge;
- VHS shelf, title detail, local counter queue, and responsive layout;
- native `stremio:` detail handoff;
- safe HTTPS configuration for additional catalogue-capable add-ons;
- Node test suite covering core rules, catalogue integration, redirect safety, and server behavior.

The default catalogue set combines public Cinemeta, TMDB, and IMDb manifests. Catalogue presence does not guarantee that a stream is available; the user's Stremio add-ons make that decision after handoff.

## Run locally

Requirements: Node.js 18 or newer and native Stremio.

```bash
npm start
```

Open <http://127.0.0.1:4173>.

Run verification:

```bash
npm test
```

There is no dependency-install step: the app uses browser APIs and the Node standard library.

## Core loop

1. Choose a store year.
2. Enter a genre aisle and browse releases from that year and the four years before it.
3. Inspect a VHS case and optionally take it to the local counter queue.
4. Select **Watch in Stremio**.
5. Native Stremio resolves streams through its own configured add-ons.

## Catalogue sources

The curated automatic sources are Cinemeta, The Movie Database Addon, and IMDb Catalogs. Locadora fetches multiple pages where an add-on advertises pagination, combines healthy responses, and ignores failed sources/pages. Cinemeta is currently the reliable historical backbone; community add-ons remain opportunistic.

Torrentio is not a catalogue source: its manifest exposes streams, not title shelves. It still participates normally after **Watch in Stremio**, when native Stremio resolves the selected title through the user's installed stream add-ons.

Open **Sources** to add another HTTPS Stremio add-on `manifest.json` URL. The localhost bridge validates the manifest, stores custom entries under ignored `.locadora/` state, and exposes only sanitized source metadata back to the browser.

Security boundaries:

- bridge binds only to `127.0.0.1`;
- HTTP, embedded credentials, localhost/private-network hosts, and unsafe redirects are rejected;
- each redirect host is DNS-checked before following;
- browser code never receives configured manifest URLs;
- no Stremio account tokens or private Flatpak files are read.

## Project documents

- [PRODUCT_SPEC.md](PRODUCT_SPEC.md) — product scope and success criteria
- [ARCHITECTURE.md](ARCHITECTURE.md) — component and security boundaries
- [TASKS.md](TASKS.md) — live ship board
- [docs/integration-spike.md](docs/integration-spike.md) — actual Stremio handoff/catalogue evidence

## Product truth

> Pick a store year. Browse the shelves that could exist then. Take a title to the counter; Stremio plays it.
