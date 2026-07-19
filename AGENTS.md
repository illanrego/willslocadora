# Locadora agent rules

## Mission

Build a local, genre-first 1990s video-rental discovery UI. Native Stremio remains responsible for the user's add-ons, stream resolution, and playback.

## Read first

- `TASKS.md`
- `PRODUCT_SPEC.md`
- `ARCHITECTURE.md`
- `.hermes.md`

## Non-negotiable boundaries

- Do not implement torrents, debrid, streams, playback, or a Stremio add-on.
- Do not scrape Stremio's UI or read its private Flatpak/session/cache files.
- Do not expose a local bridge to the network; bind it to loopback only.
- Do not put Stremio account tokens, raw secret add-on configurations, or credentials in client code, logs, fixtures, or documentation.
- A catalogue listing is not a playback guarantee; Stremio decides stream availability.
- Preserve a plain accessible shelf workflow while adding visual 2.5D presentation.

## Delivery order

1. Verify title-specific `stremio:` handoff and safe catalogue connection.
2. Build plain, local genre shelves with store-year filtering and a counter queue.
3. Playtest real handoff to native Stremio.
4. Add the rental-store presentation layer.

Do not add dependencies or choose a framework before the integration spike has been reviewed and accepted.

## Verification

Do not report an integration as working unless it has been exercised against the running local Stremio client. Update `TASKS.md` and `docs/integration-spike.md` with factual results.
