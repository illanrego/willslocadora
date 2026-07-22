# locadora-api

Dedicated public read-only Cloudflare Worker for Will's Locadora.

It deliberately owns no Supabase credentials, user data, Stremio configuration, arbitrary URL proxying, or playback capability. It currently provides:

- `GET /v1/health`
- `GET /v1/providers`
- `GET /v1/shelf`
- `GET /v1/title`

## Required deployment configuration

1. Install or run Wrangler. This repository does not currently include it.
2. Authenticate to the intended Cloudflare account: `npx wrangler login`.
3. Set `ALLOWED_ORIGINS` in `wrangler.toml` to the exact GitHub Pages production origin plus any intentional development origin, comma-separated. Do not use `*` and do not reflect arbitrary request origins.
4. Add the TMDB secret interactively; never put its value in a file:

```sh
npx wrangler secret put TMDB_API_KEY
```

5. Deploy from this directory:

```sh
npx wrangler deploy
```

The Worker must be deployed and verified before the public frontend is pointed at it. The current frontend still uses local `/api/*` paths, so wiring it to a Worker base URL is a separate, testable change.

## Cache policy

- provider registry: 7 days;
- shelves: browser 15 minutes / edge 1 hour;
- stable title metadata: browser 1 day / edge 7 days.

Brazil availability is informational only and comes only from TMDB `flatrate` discovery when providers are selected. It is never a playback promise.
