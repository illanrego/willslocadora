# Will's Locadora powered by Stremio

Feasibility and clean-slate architecture notes captured on 2026-09-22. This document records the two reports prepared before implementation planning.

## 1. Feasibility report

The proposed application is highly feasible:

- Approximately **8/10 feasible** as a Debian-first personal application.
- Approximately **7/10 feasible** as a polished open-source application for public installation.
- The main difficulties are identity mapping, dual accounts, maintaining compatibility with Stremio, and redistribution licensing—not the requested player features.

The intended ownership split is:

```text
Locadora interface and product logic
        |
        +-- Stremio engine
        |   +-- catalogues and metadata
        |   +-- installed add-ons
        |   +-- stream resolution
        |   +-- subtitles
        |   +-- playback
        |
        +-- Locadora services
            +-- Locadora account
            +-- rentals and returns
            +-- saved titles
            +-- reviews
            +-- donations
```

Stremio separates its React UI from `stremio-core`: the core supplies add-on state, catalogues, metadata, streams, subtitles, player state, and deep links through a WebAssembly bridge. This makes replacing most of the visible Stremio interface with Locadora a realistic architecture, although it is not a drop-in theme.

Relevant upstream projects:

- [Stremio Web](https://github.com/Stremio/stremio-web)
- [stremio-core](https://github.com/Stremio/stremio-core)
- [Stremio Addon Protocol](https://stremio.github.io/stremio-addon-sdk/protocol.html)
- [Stremio Linux shell](https://github.com/Stremio/stremio-linux-shell)

### What should be reused

- `stremio-core` and its web/WASM bridge for application state and the add-on protocol.
- The existing Stremio player integration, add-on handling, stream loading, subtitle handling, and shell communication where licensing permits.
- A native Linux shell using GTK4, WebKitGTK, and `libmpv`.
- Locadora's visual assets, CSS language, VHS components, rental experience, account panels, reviews, and donation UI.
- The Locadora private Worker and Supabase database for member data.

The Stremio add-on protocol already separates `catalog`, `meta`, `stream`, and `subtitles`. Locadora can render catalog and metadata results as tapes, then let the engine fetch streams and subtitles only when the visitor watches something.

The current Locadora browser code cannot simply be pasted into Stremio Web because Locadora is largely static JavaScript, DOM code, and Three.js, while Stremio Web is React. Assets, styles, and some rendering modules are reusable; application-level UI would need to be ported into React components.

### Existing Locadora database

The existing database can be reused through the private Locadora API. The desktop application must not connect directly to Supabase or carry any privileged key.

The largest integration issue is content identity:

- Locadora primarily records `movie:TMDB_ID` or `series:TMDB_ID`.
- Stremio/Cinemeta commonly uses IMDb IDs.
- Other add-ons may use entirely custom IDs.
- Series streams use episode-specific video IDs.

This requires a cached identity bridge:

```text
Stremio meta/video ID
    <-> IMDb ID
    <-> TMDB movie/series ID
    <-> Locadora canonical key
```

Because Stremio permits arbitrary add-on IDs, not every item will be resolvable automatically. A sensible rule is:

- Every compatible Stremio item may be browsed and played.
- Renting, reviewing, and saving through Locadora require a confirmed Locadora content mapping.
- An unmapped item must not silently create an incorrect Locadora record.

### Accounts

There will probably be two independent identities:

1. **Locadora identity:** rentals, saved titles, reviews, and membership.
2. **Stremio identity:** installed add-ons, Stremio library, preferences, and Stremio synchronization.

The application can present them together, but it should not send Stremio credentials or add-on configuration to the Locadora backend.

If inheriting an existing Stremio account's add-ons is unnecessary, the Stremio side could use a locally managed add-on list. If the user's existing Stremio setup must appear automatically, Stremio authentication becomes part of the product.

### Requested features

| Feature | Feasibility | Important detail |
| --- | --- | --- |
| Remove streaming-service filters | Very high | Shelves come from Stremio catalogues instead of provider-filtered TMDB discovery. |
| Only Portuguese and English subtitles | Very high | Normalize PT/EN codes and rank Brazilian Portuguese first if desired. |
| Open subtitle delay after selection | Very high | This is primarily a player UI state change. |
| Automatic speech/subtitle synchronization | Medium/low | This is a separate signal-processing feature. |
| Quick Watch | High | Apply deterministic rules to streams returned by installed add-ons. |
| Native playback on Debian | High | A native `libmpv` shell and Flatpak are a good fit. |
| Existing rentals, reviews, and donations | High | Preserve the Locadora APIs and domain model beside the media engine. |

The subtitle policy can normalize language variants such as `pt`, `por`, `pob`, `pt-BR`, `en`, and `eng`. Selecting a subtitle can immediately open its delay control without creating a new subtitle engine.

### Quick Watch

Quick Watch is practical, with this definition of determinism:

> Given the same normalized candidate streams and the same rules version, Quick Watch always selects the same result.

Remote add-ons can change their results, so the selected source cannot be guaranteed to remain identical forever. Rules could consider:

- preferred or allowed add-on;
- transport/source type;
- resolution;
- codec and HDR/Dolby Vision policy;
- audio language;
- file-size limits;
- excluded keywords such as CAM;
- preferred release groups;
- a stable final tie-breaker.

Some add-ons expose structured fields such as filename, video size, hash, and binge group, but other quality information may exist only in human-readable labels. The normalizer is therefore an important component. When no stream matches, the application should display the normal source picker instead of guessing.

### Debian packaging and licensing concern

The native shell should remain close to upstream, with most Locadora behavior in the web UI. Flatpak is the strongest first Linux-wide distribution target.

For public binary distribution, licensing requires deliberate review:

- `stremio-core` is MIT.
- `stremio-web` is GPL-2.0.
- `stremio-linux-shell` declares GPL-3.0-only.
- The redistribution status of the bundled Stremio `server.js` has been questioned upstream and should not be assumed.

This is not a blocker for a local prototype, but it must be resolved before publishing binaries. Branding is separate from source licensing, so the application should be presented as Will's Locadora rather than as an official Stremio build.

### Overall recommendation

This should eventually become a separate product and repository rather than a playback branch inside the existing public Locadora site. The strongest direction is:

- retain the Stremio core provider, add-on machinery, player behavior, subtitles, and shell bridge where licensing permits;
- replace catalogue, discovery, details, library, and navigation with Locadora;
- add a separate Locadora service adapter for membership, rentals, reviews, saved titles, and donations;
- retain a thin identity resolver for TMDB/IMDb/add-on IDs;
- package the result as a native desktop application.

This is not merely a reskin, but it also does not require building a media engine from scratch.

## 2. What a clean-slate version would do differently

The central design change would be:

> Stremio owns the media lifecycle; Locadora owns the experience, community, and rental ritual.

IMDb should not simply replace TMDB as the database primary key. Cinemeta commonly uses IMDb IDs, but Stremio add-ons can use arbitrary identifiers. IMDb should be an important mapping key, not the database foundation.

### Architectural comparison

| Area | Existing web Locadora | Clean-slate Locadora player |
| --- | --- | --- |
| Product foundation | Discovery website that hands off playback | Desktop media client with native playback |
| Catalogue | TMDB shelves assembled by our Worker | Stremio add-on catalogues and metadata |
| Identity | `movie:TMDB_ID` | Internal content ID plus namespaced external IDs |
| Playback | External Stremio/provider link | Native stream selection and player lifecycle |
| Platform | Static GitHub Pages frontend | React web UI inside a native shell |
| State | Browser DOM/local state plus Locadora API | Explicit media state and Locadora state |
| Accounts | Locadora account only | Separate Locadora and Stremio identities |
| Subtitles | Outside Locadora | First-class track selection, filtering, and synchronization |
| Sources | Informational streaming destinations | Add-on-provided stream candidates |
| Testing | Browse/rental UI behavior | Add-on contracts, rules, player events, subtitles, and UI |

### Content identity

A clean schema would use an internal content record and namespaced external identities:

```text
content
- id: internal UUID
- type: movie | series

external_identity
- content_id
- namespace: imdb | tmdb | stremio | addon
- external_id
```

Examples:

```text
imdb:tt0133093
tmdb:movie:603
stremio:cinemeta:tt0133093
addon:some-addon:custom-matrix-id
```

Rentals, saved titles, and reviews would reference the internal content ID. This allows multiple add-ons to describe the same title without producing duplicate Locadora records.

For series:

- the series is the rent/review/save entity;
- seasons and episodes are playback entities;
- an episode video ID must not become a separate Locadora title.

### Desktop-first structure

The application would begin with three independently owned layers:

```text
Locadora React UI
       |
Stremio core adapter
       |
Native shell + libmpv
```

The Locadora service remains separate:

```text
Locadora UI -> Locadora API -> Better Auth / Supabase
```

The native shell should remain close to upstream. Locadora behavior belongs primarily in the React UI and adapters, making upstream updates easier.

### Separate frontend domains

`MediaState` would own:

- installed add-ons;
- catalogues and metadata;
- seasons and episodes;
- stream candidates;
- active playback;
- audio and subtitle tracks;
- playback position.

`LocadoraState` would own:

- Locadora membership;
- Cesta and Balcão;
- active rentals;
- returns and watched status;
- favorites and Assistir depois;
- reviews;
- donations.

The bridge is explicit:

```text
Stremio meta -> identity resolver -> Locadora content
```

A Locadora backend failure must not stop playback, and an add-on failure must not corrupt rentals or reviews.

### Add-on catalogues rather than provider filtering

The `Seus streamings` provider-filter architecture would disappear. Shelves would instead represent:

- Stremio catalogues;
- catalogue-supported genres and search;
- Locadora rentals;
- favorites and watch-later;
- curated Locadora shelves where desired.

TMDB could remain as optional identity or artwork enrichment, but it would no longer define the browsing universe. Because add-on metadata is less uniform, every UI surface must tolerate missing genres, years, logos, and descriptions.

### Quick Watch as a subsystem

Rules should not be scattered through player components. They should be a pure, versioned evaluator:

```text
candidate streams
    -> normalize metadata
    -> reject forbidden candidates
    -> rank preferred candidates
    -> stable tie-break
    -> selected stream plus explanation
```

The behavior can still be expressed as straightforward conditions. It should also explain the result, for example:

> Selected: 1080p, H.265, Portuguese audio, preferred source.

This keeps the system deterministic and testable. If nothing qualifies, it should fall back to the source picker.

### Subtitle behavior from day one

Language normalization belongs in the media layer:

```text
Portuguese: pt, por, pob, pt-BR, pt-PT
English: en, eng, en-US, en-GB
```

The UI can either completely hide other languages or initially show PT/EN with an explicit “all languages” escape hatch.

After selecting a subtitle:

1. Apply the track.
2. Open the delay control over the player.
3. Keep playback controls accessible.
4. Save the offset against the stream/file fingerprint.

Subtitle delay should normally be remembered per file or release, not globally per film, because different releases can require different offsets.

### Playback state machine

Playback should be explicit:

```text
idle
-> loading metadata
-> loading streams
-> applying Quick Watch rules
-> buffering
-> playing
-> paused
-> ended or failed
```

This supports predictable handling for add-on timeouts, unavailable sources, source switching, subtitle failure, resume behavior, series autoplay, and player failures.

Playback and the rental ritual remain independent. Starting a film does not automatically mean watched, and reaching the credits should not automatically return the tape.

### Privacy and authentication

- Stremio credentials and add-on configuration remain local or go only to Stremio.
- Locadora credentials go only to Better Auth.
- Locadora member data goes through the private Worker.
- No Supabase service-role secret exists in the desktop application.
- Playback history remains local unless cloud resume synchronization is deliberately introduced.

A packaged desktop application should use a desktop-safe login/token exchange rather than weakening CORS for `file://` or arbitrary localhost origins.

### Untrusted add-on boundary

Every add-on response must be treated as untrusted. The boundary should enforce:

- allowed URL schemes;
- HTTPS where appropriate;
- explicit P2P/magnet handling;
- isolated web content;
- no arbitrary privileged proxy;
- bounded response sizes and timeouts;
- local-only storage for configurable add-on secrets.

P2P behavior should be disclosed clearly rather than hidden.

### Upstream maintenance

Locadora-specific work should be isolated into:

- Locadora routes and components;
- a Stremio adapter;
- a Locadora backend adapter;
- Quick Watch rules;
- subtitle policy.

The Stremio core provider, player bridge, and native shell should receive as few changes as possible.

### Product behavior worth preserving

- the VHS-store visual identity;
- Cesta to Balcão to rental;
- the three-active-rental rule;
- watched, not watched, and unknown returns;
- reviews tied to genuine returned/watched rentals;
- favorites and Assistir depois;
- optional donations;
- public browsing with participation requiring a Locadora account;
- accessible normal browsing alongside immersive presentation.

The resulting product would not be Stremio with a Locadora skin. It would be a purpose-built Locadora media client using Stremio as its engine.
