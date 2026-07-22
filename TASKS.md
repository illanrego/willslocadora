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

- [ ] Decide weekend package rule: strict 2–3 titles or a flexible small selection.
- [ ] Decide due-date rule: always Monday or based on rental day.
- [ ] Provision Supabase Auth/Postgres and define migrations for profiles, rentals, rental items, reviews, reactions, and reports.
- [ ] Implement passwordless sign-in and unique public username onboarding only when a visitor rents or reviews.
- [ ] Implement Row Level Security and test own-data/private-review/public-review boundaries.
- [ ] Replace local-only rental state with authenticated rental creation, due dates, returns, watched status, and history.
- [ ] Add deterministic recommendations from durable rental behavior.
- [ ] Add ratings, public-by-default reviews, private review option, helpful reactions, reports, censorship display, and moderator flow.
- [ ] Add user-controlled Letterboxd watchlist CSV import and Locadora CSV export.

## Explicitly later

- [ ] Payments, subscriptions, paywalls, real inventory, or scarcity.
- [ ] Direct or automatic Letterboxd synchronization.
- [ ] Social graph, follows, DMs, replies, or public user profiles.
- [ ] AI recommendations.
- [ ] Desktop packaging and expanded/free-roam 3D before the rental loop is proven.
