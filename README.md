# Will’s Locadora

A free, Brazil-first online video-rental discovery experience: browse films as VHS, build a small rental selection, and open known titles in the visitor’s own Stremio app. Locadora is not a player and never promises playback.

## Current status

The public browse experience is live:

- GitHub Pages serves the static frontend;
- the dedicated read-only Cloudflare Worker keeps the TMDB key server-side;
- genre/year/type shelves, Brazil subscription-provider filters, title metadata, posters, title logos, and Stremio handoff work publicly;
- normal shelves, immersive Three.js shelves, and a DOM tape-card fallback are available;
- the Balcony currently simulates `available → counter → rented → returned` in browser-local state.

The next product phase is durable account and rental data: Supabase Auth, profiles, rental history, reviews, and recommendations. See [MVP_PUBLIC_PRODUCT_AND_ARCHITECTURE.md](MVP_PUBLIC_PRODUCT_AND_ARCHITECTURE.md).

## Product boundaries

- TMDB supplies metadata and Brazil provider information. Provider listings are informational and never a playback guarantee.
- Stremio owns visitors’ accounts, add-ons, streams, subtitles, casting, and playback. Locadora only opens a known `stremio:` title route.
- Locadora never reads Stremio configuration, tokens, local files, or playback history.
- The Worker is public and read-only. It has no Supabase credentials or user data.

## Local development

Requirements: Node.js 18+.

```sh
npm start
```

Open <http://127.0.0.1:4173>. Local hosts use the local Node bridge; public hosts use the Worker configured in `public/api-config.js`.

Run checks:

```sh
npm test
npm run build:pages
```

## Deployment

Pushing `main` runs `.github/workflows/deploy-pages.yml`, which builds and deploys the static Pages site. A Git push does **not** deploy the Worker.

After changing `workers/locadora-api/`, deploy it separately:

```sh
cd workers/locadora-api
npx wrangler deploy
```

Worker setup and its exact CORS-origin configuration are documented in [workers/locadora-api/README.md](workers/locadora-api/README.md). Set `TMDB_API_KEY` only with Wrangler secrets; never put it in frontend code or a committed file.

## Documents

- [MVP_PUBLIC_PRODUCT_AND_ARCHITECTURE.md](MVP_PUBLIC_PRODUCT_AND_ARCHITECTURE.md) — authoritative public MVP scope and data architecture.
- [TASKS.md](TASKS.md) — current delivery board.
- [docs/balcony.md](docs/balcony.md) — local-state Balcony interaction brief.
- [docs/ambience.md](docs/ambience.md) — ambience/audio rules.
- [docs/integration-spike.md](docs/integration-spike.md) — verified local Stremio handoff evidence.
- [PRODUCT_SPEC.md](PRODUCT_SPEC.md) and [ARCHITECTURE.md](ARCHITECTURE.md) — historical local-first reference material.
