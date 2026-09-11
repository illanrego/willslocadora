# Locadora Master Roadmap Tracker

Status: active planning tracker  
Owner: Will  
Last updated: 2026-09-11

This is the index for the remaining Locadora work. Future agents should update the focused tracker first, then update this file and `TASKS.md` when a phase changes.

## Product decisions

- [x] The catalogue owner is the only administrator for v1.
- [x] Blocked titles are identified by `type + TMDB id`, not title text.
- [x] A blocked title is hidden from every public catalogue surface: shelves, search, featured results, metadata, Cesta, saved collections, and new rental actions.
- [x] Existing rentals and history keep a neutral unavailable record so old activity is not silently rewritten.
- [x] Blocks are reversible, reasoned, and audited.
- [x] Review moderation is owner hide/restore only for v1.
- [x] Statistics are aggregate activity metrics, not individual browsing surveillance.
- [x] Public browsing remains read-only; the private data Worker remains the only service-role boundary.

## Phase gates

| Phase | Tracker | Status | Exit condition |
| --- | --- | --- | --- |
| P0 | This file | [~] | Trackers committed and linked from `TASKS.md`. |
| P1 | [catalogue/admin tracker](2026-09-11-locadora-catalogue-admin-tracker.md) | [~] | Code is implemented and tested; live migration/KV deployment and blocked authenticated-state filtering remain. |
| P2 | [launch/reliability tracker](2026-09-11-locadora-launch-reliability-tracker.md) | [ ] | Migrations, Workers, caches, tests, and live account/admin flows are verified. |
| P3 | [community/product tracker](2026-09-11-locadora-community-growth-tracker.md) | [ ] | Milestones and support/community value are backed by real state and are playtestable. |
| P4 | [parked roadmap](2026-09-11-locadora-parked-roadmap.md) | [ ] | Revisit only after P1-P3 are stable. |

## Current known gaps

- [x] `/admin/` now includes catalogue blocks, review moderation, aggregate metrics, users, and session revocation.
- [x] Owner-managed catalogue blocklist code exists, keyed by type and TMDB id.
- [~] Public catalogue policy filtering exists in code, but the shared KV namespace is not provisioned/bound yet.
- [x] Review visibility/moderation API and admin controls exist; live migration/deployment remains.
- [ ] Authenticated Cesta/saved/rental state does not yet hide or reject blocked canonical keys.
- [ ] Milestone labels are still largely static scene content rather than measured product state.
- [ ] The full Better Auth/Supabase deployment and live account loop still need operator verification.
- [ ] `npm test` has three known stale source-contract failures; see `P2-05`.

## Working rules for future agents

1. Read `MVP_PUBLIC_PRODUCT_AND_ARCHITECTURE.md`, `TASKS.md`, and `docs/balcony.md` before changing product behavior.
2. Keep migrations forward-only and keep secrets out of static assets, fixtures, and logs.
3. Add or update tests with every API, migration, cache, or state-contract change.
4. Do not mark a Worker integration live without deploying and checking the actual endpoint.
5. Do not add playback, torrent, debrid, subtitle, or Stremio-addon functionality.
6. When completing an item, change `[ ]` to `[x]`, add the commit hash, and record any deployment evidence in the focused tracker.

## Suggested implementation order

- [ ] P1: catalogue block policy and admin catalogue screen.
- [ ] P1: admin users, reviews, and aggregate statistics screens.
- [ ] P2: schema/policy propagation, cache versioning, and API tests.
- [ ] P2: deploy private/public Workers and verify live endpoints.
- [ ] P2: repair stale tests and complete the account/admin playtest.
- [ ] P3: make milestones and support indicators real, then add import/export.
- [ ] P4: reconsider broader community and recommendation ideas only after evidence from use.

## Handoff log

| Date | Agent/commit | Update |
| --- | --- | --- |
| 2026-09-11 | planning | Created the roadmap trackers and captured the owner-only moderation/admin scope. |
| 2026-09-11 | implementation | P1 code slices pushed through `71726dc`; full suite is 233/236 with three known stale assertions, Pages build passes. |
