# Locadora agent rules

## Mission

Build Will’s Locadora: a free, Brazil-first public video-rental discovery experience. Browsing is public; durable participation begins only when a visitor rents or reviews.

## Authority and reading order

1. `MVP_PUBLIC_PRODUCT_AND_ARCHITECTURE.md` — current product and architecture authority.
2. `TASKS.md` — live delivery board.
3. `docs/balcony.md` — local-state rental prototype rules.
4. `PRODUCT_SPEC.md` and `ARCHITECTURE.md` — historical local-first implementation reference only.

## Boundaries

- Do not implement torrents, debrid, streams, playback, subtitles, or a Stremio add-on.
- Do not scrape Stremio UI or access private Stremio files, sessions, tokens, or account data.
- Never state that a catalogue/provider listing guarantees playback or subscription access.
- Keep TMDB credentials in the Worker secret store only. Never expose a service-role key, credentials, or secrets in static assets, fixtures, logs, or docs.
- The public Worker is read-only: no Supabase service-role secret, rental writes, arbitrary proxying, or Stremio-user data.
- Use exact CORS allowlists, never `*` or reflected request origins.
- Preserve the accessible normal shelf workflow. Three.js is an enhancement, not a replacement.

## Delivery priorities

1. Keep the public browse and Worker contract reliable.
2. Let the user playtest the rental ritual and visual direction.
3. Before durable rental work, resolve package-size and due-date decisions.
4. Add Supabase Auth, data model, RLS, rentals, reviews, and deterministic recommendations in small verified stages.

## Deployment and verification

- `git push` triggers the GitHub Pages static deployment; it does not deploy the Worker.
- Changes under `workers/locadora-api/` require `npx wrangler deploy` from that directory and a public endpoint verification.
- Run `npm test` and `npm run build:pages` before committing relevant application changes.
- Do not claim a public integration is live without checking the actual public endpoint/site.
