# Account rental limit (2026-10-06)

Users choose 1–10 active tapes in web or desktop Carteirinha. Default remains 3.
Lowering the setting preserves existing rentals and prevents new rentals until
there is capacity. Profile-row locking serializes rentals with setting updates.
Carteirinha previews show three watch-later and favorite entries; full lists
remain accessible through their existing section links.

## Release order

1. The user manually runs `supabase/migrations/20261006_member_rental_limit.sql`
   in the production SQL editor. This adds a constrained `profiles.rental_limit`
   and replaces `rent_titles` without changing its signature or permissions.
2. Deploy `workers/locadora-data` (new authenticated `PUT /v1/rental-limit`,
   JSON `{ "rentalLimit": 1..10 }`; `/v1/state` returns `profile.rentalLimit`).
3. Publish the web build and reopen the rebuilt desktop executable.

Do not deploy the Worker before the migration: its profile query needs the new
column. No production migration, Worker deployment or web publication was done
in this task. Unrelated existing web/TV changes remain outside this commit.

## Validation

- `npm test`: 276 passed.
- `npm run build:pages`: passed.
- Isolated PostgreSQL 18: core migration, new rental-limit migration, then
  `test/member-rental-limit.sql`, all with `psql -v ON_ERROR_STOP=1`: passed.
  Verifies default, database bounds, enforcement, ten-title rental and retaining
  existing tapes after lowering the limit. The SQL test rolls back its data;
  run it only against an isolated database, never production.
- No browser/manual acceptance claimed.
