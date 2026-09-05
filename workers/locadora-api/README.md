# `locadora-api`

Dedicated public read-only Cloudflare Worker for Will’s Locadora.

It owns no Supabase credentials, user data, Stremio configuration, arbitrary URL proxying, or playback capability. It keeps the TMDB key server-side and provides:

- `GET /v1/health`
- `GET /v1/providers`
- `GET /v1/shelf`
- `GET /v1/title`
- `GET /v1/featured`
- `GET /v1/search` — bounded whole-catalogue title lookup
- `GET /v1/watch-links?type=movie&id=603` — best-effort Brazil subscription title destinations; `series` and `tmdb:603` identities are also accepted
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

## Direct subscription links

`watch-links` returns `{ offers: [{ providerId, providerName, url }], fallbackUrl, retrievedAt, status }`. Status is `ok` when usable links exist and `unavailable` otherwise. Invalid identities return 400. Lookup failures return 200 with an empty offers array and a constructed Brazil TMDB watch-page fallback, so availability never blocks rental success.

The endpoint extracts public JustWatch clickout anchors from a constructed TMDB watch page; the TMDB API itself does not supply service destinations. Only Brazil `flatrate` offers are accepted. Quality duplicates collapse by provider ID, while paid add-on channels keep their own identities. Destination hosts are explicitly allowed in `src/watch-links.mjs`; other services use the fallback until deliberately supported. This is best-effort public markup extraction, not a supported TMDB deep-link API.

Requests have a five-second deadline, a 1 MB body cap, and at most two validated same-title TMDB redirects. Clickout destinations are returned to the visitor, never fetched by the Worker. Successful results cache for six hours; unavailable results for one minute. Cloudflare Cache API entries omit CORS headers; the exact origin policy is applied to each response, including cache hits. A bounded in-process cache also covers local development. No extra secrets are required.

The frontend requests links only from title service panels and rental confirmation, never for every shelf card. It provides JustWatch attribution, distinguishes selected subscriptions from other subscriptions, and keeps an explicit TMDB fallback.

### Deployment verification — 2026-09-05

Version `f15350a4-a5fe-464e-ad7e-0fb561249cb4` was deployed to `https://locadora-api.willstartpage.workers.dev`. Public checks returned 200 for health, Matrix title metadata, and movie/series watch links. Matrix returned Globoplay/HBO Max and separately named Amazon channels; Stranger Things returned Netflix destinations. Watch-link responses advertised a six-hour cache and the exact production CORS origin; an unapproved origin received 403 without CORS permission. This verifies endpoint behavior, not playback or the unpublished static UI.
