# `locadora-data`

Private authenticated data Worker for Will's Locadora.

Better Auth owns email/password authentication and browser sessions. This Worker verifies Better Auth bearer sessions, then is the only Locadora component that can use the Supabase service-role credential. The public `locadora-api` Worker must never receive these secrets.

## Endpoints

Browser CORS headers are emitted only for allowed origins. All mutation and member-specific routes require a valid Better Auth bearer session; public title-review reads intentionally require no bearer token.

- `GET /v1/titles/:type/:tmdbId/reviews` — public aggregate and the 20 most recent public reviews for one canonical movie or series.
- `/api/auth/*` — Better Auth sign-up, email/username sign-in, session, and sign-out endpoints.
- `GET /v1/titles/:type/:tmdbId/review-eligibility` — verifies the signed-in member has returned that exact title as `watched`.
- `POST /v1/titles/:type/:tmdbId/review` — creates or replaces the signed-in member’s public written review and `0.5`–`5` half-star rating. The database independently enforces watched-history eligibility.
- `GET /v1/state` — the member's profile, active Assistir depois/Favoritos collections, current rental, and recent return history.
- `PUT /v1/profile` — creates/updates a lowercase public username.
- `POST /v1/watchlist` — legacy compatibility route that saves or reactivates Assistir depois for a canonical TMDB title.
- `POST /v1/collections/:collection` — saves an authenticated canonical title in `watch_later` or `favorite`.
- `DELETE /v1/collections/:collection/:type/:tmdbId` — removes only the requested saved collection membership.
- `POST /v1/rentals` — atomically rents one to three distinct titles; the database enforces the three-active-title cap.
- `POST /v1/rental-items/:id/return` — records `watched`, `not_watched`, or `unknown`. Only `watched` completes the active Assistir depois membership.

Active catalogue blocks are excluded from saved collections. Existing active rentals and history retain their snapshots and dates with `unavailable: true`; new saved-title and rental writes for those canonical keys are rejected.
- `GET /v1/admin/users` — exact-admin-only user directory with account, rental, watched, and review counts.
- `POST /v1/admin/users/:id/revoke-sessions` — exact-admin-only session revocation for one user.

## One-time setup

1. Create the Locadora Supabase project. Apply `../../supabase/migrations/20260730_locadora_core.sql`, followed by every later migration in filename order, including `20260801_fix_return_rental_item.sql`, `20260802_add_title_reviews.sql`, and `20260803_saved_title_collections.sql`, with the Supabase SQL editor or Supabase CLI.
2. Configure a Better Auth database connection to the Supabase Postgres project. Apply `20260905_better_auth.sql` and `20260907_protect_will_identity.sql` after the existing Locadora migrations.
3. From this directory, authenticate the intended Cloudflare account, then set secrets interactively — never put values in files or source control:

   ```sh
   npx wrangler secret put BETTER_AUTH_SECRET
   npx wrangler secret put DATABASE_URL
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put RESEND_API_KEY
   ```

   `DATABASE_URL` is the Supabase Postgres connection string used as a local fallback. Production uses the `HYPERDRIVE` binding configured in `wrangler.toml`; its SQL response cache must remain disabled because Better Auth session and credential reads cannot be stale.

   `AUTH_RATE_LIMITER` permits 30 authentication attempts per minute for each client and auth route. It runs before a database connection is opened and returns a CORS-readable `429` response when exceeded.

   `ADMIN_EMAIL` is the exact email allowed to use `/admin/` and the admin API. Authorization never trusts a username.

   `RESEND_API_KEY` is used only by Better Auth's verification and password-reset callbacks. `RESEND_FROM_EMAIL` is a non-secret Wrangler variable and must use an address on the verified Resend domain. Email delivery is queued with the Worker execution context so auth responses do not wait on Resend. Email verification is sent after signup, but `requireEmailVerification` remains disabled until delivery is playtested.

4. Review `ALLOWED_ORIGINS` in `wrangler.toml`, then deploy:

   ```sh
   npx wrangler deploy
   ```

5. Configure the static frontend's `auth-config.js` with this deployed Worker base URL. Better Auth secrets remain Worker-only.

`git push` deploys only the static frontend. It does not apply the migration or deploy this Worker.
