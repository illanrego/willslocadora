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
- persistent PT/EN site copy with locale-aware TMDB title/synopsis enrichment;
- safe HTTPS configuration for additional catalogue-capable add-ons;
- Node test suite covering core rules, catalogue integration, redirect safety, and server behavior.

The default catalogue set combines public Cinemeta, TMDB, and IMDb manifests. Catalogue presence does not guarantee that a stream is available; the user's Stremio add-ons make that decision after handoff.

## Run locally

Requirements: Node.js 18 or newer and native Stremio.

```bash
npm start
```

Open <http://127.0.0.1:4173>.

### Optional TMDB enrichment

Create a free non-commercial TMDB API key at <https://www.themoviedb.org/settings/api>. Keep it local — never put it in browser code, source control, or a public static host. Copy the supplied example, then put the key only in `.env`:

```bash
cp .env.example .env
```

```dotenv
TMDB_API_KEY=your-local-key
```

`npm start` now reads `.env` locally. An explicit shell variable still wins when present.

With a key, title inspection supplements the existing Stremio metadata with TMDB backdrops, title logos, expanded credits, Brazilian certification, and Brazil-region provider listings. The **Brazil streaming** filter supports multi-select OR discovery for Netflix, Prime Video, Max, Disney+, Globoplay, Paramount+, Apple TV+, MUBI, and Crunchyroll. It queries TMDB's Brazil `flatrate` catalogue first, then resolves compatible IMDb/Stremio IDs. By default it covers the selected year plus its previous nineteen years; **Ignore store year** deliberately searches the bounded 1920–2026 catalogue era instead. **Watch options** opens the Brazil link returned by TMDB (often a JustWatch result page); it is not a playback guarantee or necessarily a direct Netflix/Prime link. Trailers and clips are deliberately out of scope.

The site starts in Brazilian Portuguese. Use the **Idioma / Language** selector in the header to switch between Portuguese (`pt-BR`) and English (`en-US`). TMDB metadata requests follow the selected locale and fall back to the catalogue/original value when a localized field is unavailable. Person names and provider identities are not machine-translated.

> This product uses the TMDB API but is not endorsed or certified by TMDB.

Run verification:

```bash
npm test
```

There is no dependency-install step: the app uses browser APIs and the Node standard library.

## Core loop

1. Choose a store year.
2. Enter a genre aisle and browse releases from that year and the four years before it. Optionally select one or more Brazil streaming services for TMDB-confirmed `flatrate` availability (OR semantics) across the selected year and previous nineteen years, or explicitly ignore the store-year lens.
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
- browser code never receives the `TMDB_API_KEY`;
- no Stremio account tokens or private Flatpak files are read.

## Project documents

- [PRODUCT_SPEC.md](PRODUCT_SPEC.md) — product scope and success criteria
- [ARCHITECTURE.md](ARCHITECTURE.md) — component and security boundaries
- [TASKS.md](TASKS.md) — live ship board
- [docs/integration-spike.md](docs/integration-spike.md) — actual Stremio handoff/catalogue evidence
- [docs/balcony.md](docs/balcony.md) — frontend-first 3D Balcony brief: Balcão rental pile/bag, returns, counter atmosphere, and tip jar
- [.hermes/plans/2026-07-20_160243-locadora-localization-store-expansion.md](.hermes/plans/2026-07-20_160243-locadora-localization-store-expansion.md) — future localization, immersive-store, balcony, and rental roadmap

## Product truth

> Pick a store year. Browse the shelves that could exist then. Take a title to the counter; Stremio plays it.
