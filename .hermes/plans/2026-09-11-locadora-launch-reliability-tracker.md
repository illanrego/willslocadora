# Locadora Launch and Reliability Tracker

Status: pending after catalogue/admin implementation  
Last updated: 2026-09-11

This tracker covers the boundary between code that exists locally and behavior that is genuinely deployed and usable.

## Data and Worker deployment

- [ ] `REL-01` Apply forward-only Supabase migrations in a controlled order and record the migration identifiers.
- [ ] `REL-02` Bind the shared catalogue-policy KV namespace to both Workers without placing Supabase service credentials in the public Worker.
- [ ] `REL-03` Configure private Worker secrets and admin authorization in the deployment environment. Do not duplicate secrets in Pages/static configuration.
- [ ] `REL-04` Deploy `locadora-data` from its Worker directory and verify private admin endpoints with an owner session.
- [ ] `REL-05` Deploy `locadora-api` from its Worker directory and verify public shelves, search, featured, metadata, policy version, and exact CORS behavior.
- [ ] `REL-06` Publish static Pages after frontend changes. Remember that `git push` does not deploy either Worker.

## Cache and failure behavior

- [ ] `REL-07` Verify policy version changes invalidate or bypass browser, edge, and Worker cache layers.
- [ ] `REL-08` Verify stale public catalogue responses never reintroduce a title that is currently blocked beyond the documented propagation window.
- [ ] `REL-09` Verify KV read failure has a deliberate safe behavior and a visible operator signal without exposing internal details to users.
- [ ] `REL-10` Verify public rate limits, exact CORS, bounded upstream reads, and no arbitrary proxying regressions.

## Test repair and verification

- [ ] `REL-11` Repair the stale rental-confirmation source assertion to match the current `beganOnBackdrop` behavior.
- [ ] `REL-12` Repair the stale mobile-layout assertion to include the current compact-room offset contract.
- [ ] `REL-13` Repair the stale server assertion for the current `loadProviderAssets` signature.
- [ ] `REL-14` Run `npm test`, `npm run build:pages`, and `git diff --check` before each relevant commit.
- [ ] `REL-15` Add focused tests for each new migration/API/cache contract before broad test repair is declared complete.

## Live acceptance checklist

- [ ] `REL-16` Public visitor can browse shelves and search without signing in.
- [ ] `REL-17` Owner can sign in to `/admin/`, block a title, and see it disappear from a fresh public request.
- [ ] `REL-18` Owner can restore the title and see it return to eligible discovery.
- [ ] `REL-19` Existing account rental/history state remains readable and neutral for blocked titles.
- [ ] `REL-20` Review hide/restore and aggregate metrics work against deployed data.
- [ ] `REL-21` Document actual endpoint URLs, deployment timestamps, and commit hashes here after verification.

## Evidence log

| Date | Endpoint/build | Result | Notes |
| --- | --- | --- | --- |
| pending | pending | pending | No new deployment claimed yet. |

