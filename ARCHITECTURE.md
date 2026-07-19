# Locadora — architecture and integration plan

## System boundary

```text
Local browser UI  <-->  localhost Locadora bridge  <-->  catalogue-capable Stremio add-ons
       |                         |
       |                         +--> local cache / preferences (non-secret)
       |
       +--> registered stremio: protocol --> Native Flatpak Stremio --> existing stream add-ons --> playback
```

## Components

### 1. Local web UI

Responsibilities: store navigation, shelves, title detail, store-year filtering, counter queue, and opening Stremio.

The browser talks only to the Locadora localhost bridge for catalogue data. It must not contain Stremio account tokens or raw confidential add-on configuration.

### 2. Localhost bridge

Responsibilities: explicit local configuration/authorisation flow; manifest discovery; catalogue requests; pagination; normalisation; deduplication; cache; source health reporting.

Security baseline:

- bind to loopback only (`127.0.0.1`), not LAN/all interfaces;
- no hosted backend and no analytics by default;
- never print secret-bearing URLs/tokens in logs;
- keep source credentials/configuration out of static browser assets;
- provide a deliberate “forget/reset local connection” action;
- validate outgoing add-on URLs and handle untrusted remote add-on data as data, not instructions.

The exact Stremio account/configuration handoff is unknown. The bridge must use a supported, user-authorised mechanism discovered in Phase 0; it must not read private Flatpak storage.

### 3. Existing Stremio Desktop

Responsibilities: account/add-ons, stream resolution, torrent/debrid/provider functionality, player, subtitles, and casting. Locadora does not replicate any of these.

Observed runtime on this machine (2026-07-19): Flatpak Stremio is running with its Node-based local engine listening on `127.0.0.1:11470`. That engine is potentially useful later but is not assumed to expose the complete installed catalogue.

## Catalogue request flow

1. Bridge loads a configured catalogue source's public manifest/capabilities.
2. UI asks bridge for a shelf: type, genre, selected Store Year, cursor/page.
3. Bridge calls a supported catalogue endpoint only for that source.
4. Bridge normalises items into the `Title` model, deduplicates, locally filters only when required, and caches bounded results.
5. UI renders the titles and retains the stable item identifier needed for native handoff.

### Failure behaviour

- One unavailable source does not break the store: show shelf-level availability and retry state.
- No source supporting a requested aisle: show an honest empty-state and browse another source/metadata mode.
- A title appearing in a shelf is not a promise of a playable stream; Stremio makes that determination at checkout.

## Playback handoff flow

1. User chooses **Watch in Stremio** for a `Title` with a stable target ID.
2. Locadora constructs the verified title-specific Stremio URI.
3. Browser opens the registered `stremio:` handler.
4. Flatpak Stremio focuses/opens the item and resolves streams through the user's existing configuration.

No arbitrary stream URL, magnet, add-on secret, or player embedding belongs in Locadora.

## Phase 0 acceptance tests

Before application scaffolding or dependency installation:

- With native Stremio running, prove one exact movie handoff and one series handoff from a harmless local HTML/command test.
- Record the title IDs and URI forms, expected client behaviour, and failure behaviour in `docs/integration-spike.md`.
- Identify a supported, explicit authorisation/configuration approach for catalogue-capable add-ons—or record that it is unavailable and select metadata discovery mode for Phase 1.
- Capture non-secret fixture responses for at least one catalogue source.
- Confirm the bridge can be loopback-only and that normal browser CORS behaviour is accounted for.

## Non-goals / anti-patterns

- Do not use Stremio's private cache/session/account files as an API.
- Do not scrape or automate Stremio's GUI.
- Do not expose the local bridge beyond this computer.
- Do not build a player or stream resolver.
- Do not adopt Three.js/full 3D before the plain shelf loop is playtested.
