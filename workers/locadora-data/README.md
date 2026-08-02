# `locadora-data`

Private authenticated data Worker for Will's Locadora.

Clerk owns email/password authentication and browser sessions. This Worker verifies each Clerk bearer token, then is the only Locadora component that can use the Supabase service-role credential. The public `locadora-api` Worker must never receive these secrets.

## Endpoints

Browser CORS headers are emitted only for allowed origins. All mutation and member-specific routes require a valid Clerk bearer token; public title-review reads intentionally require no bearer token.

- `GET /v1/titles/:type/:tmdbId/reviews` — public aggregate and the 20 most recent public reviews for one canonical movie or series.
- `GET /v1/titles/:type/:tmdbId/review-eligibility` — verifies the signed-in member has returned that exact title as `watched`.
- `POST /v1/titles/:type/:tmdbId/review` — creates or replaces the signed-in member’s public written review and `0.5`–`5` half-star rating. The database independently enforces watched-history eligibility.
- `GET /v1/state` — the member's profile, active watchlist, current rental, and recent return history.
- `PUT /v1/profile` — creates/updates a lowercase public username.
- `POST /v1/watchlist` — saves or reactivates a canonical TMDB title.
- `POST /v1/rentals` — atomically rents one to three distinct titles; the database enforces the three-active-title cap.
- `POST /v1/rental-items/:id/return` — records `watched`, `not_watched`, or `unknown`. Only `watched` completes the active watchlist entry.

## One-time setup

1. Create the Locadora Supabase project. Apply `../../supabase/migrations/20260730_locadora_core.sql`, followed by every later migration in filename order (including `20260801_fix_return_rental_item.sql`), with the Supabase SQL editor or Supabase CLI.
2. Create a Clerk application configured for email + password. Configure the exact production and local origins as permitted origins/redirect URLs. Do not enable Locadora-managed verification or recovery email flows for this MVP.
3. From this directory, authenticate the intended Cloudflare account, then set secrets interactively — never put values in files or source control:

   ```sh
   npx wrangler secret put CLERK_SECRET_KEY
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```

4. Review `ALLOWED_ORIGINS` in `wrangler.toml`, then deploy:

   ```sh
   npx wrangler deploy
   ```

5. Configure the static frontend's `auth-config.js` with the Clerk publishable key, Clerk Frontend API hostname, and this deployed Worker base URL. The first two values are browser-visible by design; the other three values are secrets and must remain Worker-only.

`git push` deploys only the static frontend. It does not apply the migration or deploy this Worker.
