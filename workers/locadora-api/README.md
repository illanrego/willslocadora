# `locadora-api`

Dedicated public read-only Cloudflare Worker for Will’s Locadora.

It owns no Supabase credentials, user data, Stremio configuration, arbitrary URL proxying, or playback capability. It keeps the TMDB key server-side and provides:

- `GET /v1/health`
- `GET /v1/providers`
- `GET /v1/shelf`
- `GET /v1/title`
- `GET /v1/featured`
- `GET /v1/image` — validated TMDB image proxy only

## Deployment configuration

1. Authenticate the intended Cloudflare account:

   ```sh
   npx wrangler login
   ```

2. Keep `ALLOWED_ORIGINS` in `wrangler.toml` as an exact comma-separated list of intentional public and local origins. Never use `*` or reflect arbitrary request origins.

3. Set the secret interactively; never place its value in a file:

   ```sh
   npx wrangler secret put TMDB_API_KEY
   ```

4. Deploy from this directory:

   ```sh
   npx wrangler deploy
   ```

5. Verify the deployed endpoint from an allowed origin, including the CORS response and a real shelf/title contract.

The public frontend uses this Worker outside local hosts through `public/api-config.js`. `git push` deploys the static Pages frontend only; it does not deploy Worker changes.

## Contract and cache notes

- Shelf results are bounded and expose `hasNextStand` separately from the number of usable IMDb-linked titles.
- Title metadata includes credits, Brazilian classification/provider information, poster/background, and an optional TMDB title logo.
- Brazil availability is informational `flatrate` metadata, never a playback promise.
- Cache lifetimes are intentionally short for shelves/availability and longer for stable title metadata/provider registry.
