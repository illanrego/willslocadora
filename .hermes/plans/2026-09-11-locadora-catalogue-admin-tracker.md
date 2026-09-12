# Locadora Catalogue and Admin Tracker

Status: ready for implementation  
Priority: highest  
Owner: Will only  
Last updated: 2026-09-11

## Goal

Give Will one private `/admin/` surface to remove unsuitable catalogue titles, moderate reviews, understand aggregate activity, and manage users without exposing private data to the public Worker.

## Data model and policy

- [x] `CAT-01` Add a forward-only migration for `catalogue_blocks` with:
  - `id`, `title_type`, `tmdb_id`, `canonical_key`, `reason`, `created_by`, `created_at`, `removed_at`, `removed_by`.
  - A unique active block per `(title_type, tmdb_id)`.
  - A check constraint allowing only `movie` and `series`, with a positive TMDB id.
  - An audit-friendly history instead of destructive deletion.
- [x] `CAT-02` Define one canonical key helper shared by private Worker, public Worker, and tests. Use `movie:<id>` or `series:<id>` consistently with existing title state contracts.
- [~] `CAT-03` Add a versioned safe policy snapshot in a shared Cloudflare KV namespace bound to both Workers. Code exists; the namespace is not provisioned because Wrangler authentication is currently unavailable.
- [x] `CAT-04` Define propagation behavior: policy changes must become visible to public requests within the configured KV/cache window, targeted at 60 seconds or less. Never rely only on browser cache expiry.

## Private Worker API

- [x] `CAT-05` Add owner-authenticated `GET /v1/admin/catalogue/blocks` with search, active/history filter, pagination, and stable newest-first ordering.
- [x] `CAT-06` Add owner-authenticated `POST /v1/admin/catalogue/blocks` accepting `type`, `tmdbId`, and a required human reason. Make repeated blocking idempotent.
- [x] `CAT-07` Add owner-authenticated `POST` or `DELETE /v1/admin/catalogue/blocks/:type/:tmdbId` to restore a title without deleting its audit history.
- [x] `CAT-08` After every successful change, rebuild the KV policy snapshot and increment its version atomically enough for readers to see either the old or new complete snapshot.
- [x] `CAT-09` Reject malformed types/IDs, empty reasons, oversized reasons, non-owner sessions, and cross-user attempts with explicit status codes.

## Public Worker behavior

- [x] `CAT-10` Load the policy snapshot in the public Worker with a short bounded cache and fail closed for catalogue visibility if the snapshot cannot be read.
- [x] `CAT-11` Filter blocked titles server-side in shelves, search, featured titles, title metadata, and any future discovery route.
- [x] `CAT-12` Apply `include_adult=false` consistently to every TMDB discovery/search path.
- [x] `CAT-13` Expose only a harmless policy version endpoint or response header for clients. Do not expose admin reasons, user identity, or private database details.
- [x] `CAT-14` Include the policy version in public cache keys and static-client requests so a newly unblocked/blocked title does not remain trapped in an old browser or edge response.

## Existing user state

- [x] `CAT-15` Prevent new Cesta additions, saved memberships, and rental submissions for blocked canonical keys.
- [x] `CAT-16` Hide blocked titles from visible Cesta/saved/state responses while retaining user rows for audit and possible restoration.
- [x] `CAT-17` Render existing active rentals and history as a neutral `unavailable` record with no new rent/open action. Preserve title type, TMDB id, dates, and return behavior.
- [x] `CAT-18` Ensure block/unblock refreshes relevant client state without requiring a logout or destructive local-storage reset.

## Admin UI v1

- [x] `ADM-01` Add tabs/sections for Catalogue, Users, Reviews, and Statistics while preserving the current session-revocation workflow.
- [x] `ADM-02` Catalogue section: search by title/TMDB id, inspect a title, block with required reason, restore, and see active/history state.
- [x] `ADM-03` Add a title inspector preview using the existing public metadata path; the action must submit the canonical type/id, never a title string.
- [x] `ADM-04` Users section: retain search, counts, pagination, session revocation, and a small user detail view. Do not add suspension or impersonation in v1.
- [x] `ADM-05` Reviews section: list by visibility/date/title/user, hide with reason, restore, and show an audit trail. Owner-only hide/restore is sufficient for v1.
- [x] `ADM-06` Statistics section: show aggregate rentals, returns, reviews, active users, catalogue blocks, and distinct titles over 7/30/90 days plus a custom bounded date range.
- [x] `ADM-07` Keep admin actions keyboard accessible, readable on narrow screens, and explicit about irreversible actions. Blocks and hides are reversible.

## Reviews and metrics APIs

- [x] `ADM-08` Add private review moderation routes for list, hide, and restore. Preserve public filtering to visible, non-deleted reviews.
- [x] `ADM-09` Add private aggregate metrics route. Use server-side aggregation; never return raw browsing events or another user’s private rows.
- [x] `ADM-10` Add migration/tests for review visibility, moderation reason, moderator identity, and timestamps.
- [x] `ADM-11` Bound metrics date ranges and define timezone behavior explicitly, using the Worker/database contract rather than browser-local guesses.

## Tests and acceptance

- [x] `ADM-12` Unit-test owner authorization, validation, idempotency, audit history, and policy snapshot generation.
- [x] `ADM-13` Test every public discovery route against blocked and restored movie/series keys.
- [x] `ADM-14` Test active/history neutral unavailable records and rejection of new actions.
- [x] `ADM-15` Test admin UI route rendering and action payloads with the existing Node/source-contract strategy.
- [ ] `ADM-16` Acceptance: Will blocks a known unsuitable title, it disappears after policy refresh from shelves/search/featured, old rental history remains neutral, then restore makes it eligible again.

## Completion record

| Item | Commit | Deployment/evidence |
| --- | --- | --- |
| Catalogue block model/API | `5d0d064`, `87d3aea` | Local tests pass; migration not applied live |
| Public policy filtering/cache version | `ef95d92` | Local tests pass; KV namespace not provisioned/bound |
| Admin UI v1 | `0c2cfda`, `71726dc` | Pages build passes |
| Review moderation | `89f9211` | Local Worker/schema tests pass; migration not applied live |
| Aggregate metrics | `89f9211`, `71726dc` | Local Worker/UI/build tests pass |
