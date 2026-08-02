# Will’s Locadora — live ship board

Last updated: 2026-07-22
Status legend: [ ] todo · [~] in progress · [x] done

The public-MVP authority is [MVP_PUBLIC_PRODUCT_AND_ARCHITECTURE.md](MVP_PUBLIC_PRODUCT_AND_ARCHITECTURE.md). Historical local-first work remains documented in `PRODUCT_SPEC.md` and `ARCHITECTURE.md`.

## Done — public browse foundation

- [x] Public static frontend on GitHub Pages with a dedicated, read-only `locadora-api` Cloudflare Worker.
- [x] TMDB secret remains Worker-only; public CORS uses exact allowed origins.
- [x] Validated Worker routes for shelves, providers, titles, featured titles, and safe TMDB image proxying.
- [x] Brazil `flatrate` subscription filters with OR semantics and explicit bounded year override.
- [x] Genre/year/type shelves, 40-title stands, previous/next stand navigation, and normal/immersive presentation.
- [x] Three.js static build support and failure-only DOM tape-card fallback.
- [x] Public title metadata: Brazilian provider details, classification, credits, poster/background, and title logos.
- [x] PT/EN interface and locale-aware title metadata.
- [x] Balcony local-state rental simulation: `available → counter → rented → returned`.
- [x] Genre-specific shelf palettes and accessible visual preferences.
- [x] Native Stremio detail handoff is proven locally for movies and series; Locadora does not claim playback availability.
- [x] Canonical local verification: `npm test` and `npm run build:pages`.

## Now — user playtest and public polish

- [~] User playtests browse loop, shelf counts, next/previous stands, and genre visual identity on the live site.
- [ ] Validate mobile/narrow-screen behavior and normal-mode accessibility after current visual direction is accepted.
- [ ] Playtest title inspection, title-logo quality, Brazil availability copy, and Stremio external-app handoff in normal browsers.
- [ ] Add and live-playtest the optional ambience/music assets described in `docs/ambience.md`.
- [ ] Add browser-level interaction tests after the visual direction is accepted.

## Next — durable public rental loop

- [~] Supabase migration is committed for Clerk-linked profiles, watchlist items, rentals, and rental items; provisioning the actual Supabase project remains an operator step.
- [x] Private `locadora-data` Worker verifies Clerk user tokens and is the only component designed to receive the Supabase service-role secret; the existing `locadora-api` Worker remains public/read-only.
- [x] Static Clerk sign-in, public-username onboarding, and configuration-gated account controls are wired for rental/watchlist actions; no Locadora-run verification or recovery email flow exists.
- [x] Worker unit tests cover own-data routing, username validation, canonical watchlist writes, rental request validation, and the three return outcomes. Live Clerk/Supabase boundary testing waits for provisioned credentials.
- [x] Local-only rental history is cleared on boot; signed-in members use the authenticated watchlist, up-to-three active rentals, open-ended returns, watched status, and watched-return watchlist completion.
- [~] A personal watchlist dialog is reachable from the normal header and a floating Balcão control; title saving remains available when the 3D VHS view falls back to DOM. The physical shelf placement still needs a visual playtest/refinement.
- [x] CRT “Clique para pesquisar título” and the “Alugar títulos” Balcão action remain present in both 3D and 2D fallback.

- [ ] Provision Clerk + Supabase, set Worker secrets, deploy `locadora-data`, populate `auth-config.js`, and manually playtest the complete live account loop before calling this feature public.

- [~] Title-inspector reviews are implemented locally: public aggregate/recent-review reads; public username bylines; required written text plus `0.5`–`5` half-star ratings; and server-verified eligibility only after the exact title was returned as `watched`. The Supabase migration and `locadora-data` Worker still need authorized deployment and a live browser playtest.
- [ ] Add private review visibility, helpful reactions, reports, display-time censorship, edit/delete controls, and moderator flow.
- [ ] Add user-controlled Letterboxd watchlist CSV import and Locadora CSV export.
- [ ] After the core watchlist is live, add a private owner-only Startpage Worker → separate Locadora integration API; do not put Supabase write secrets in the public read-only Worker or expose it to regular Locadora users.

## Explicitly later

- [ ] Payments, subscriptions, paywalls, real inventory, or scarcity.
- [ ] Direct or automatic Letterboxd synchronization.
- [ ] Social graph, follows, DMs, replies, or public user profiles.
- [ ] AI recommendations.
- [ ] Deterministic recommendations from durable rental behavior.
- [ ] Desktop packaging and expanded/free-roam 3D before the rental loop is proven.
