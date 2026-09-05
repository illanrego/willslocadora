# Will’s Locadora — public MVP product and architecture

**Status:** active product direction
**Date:** 2026-07-21
**Purpose:** authoritative brief for the public, free, open-source Will’s Locadora MVP. It supersedes the old local-only deployment assumptions in `PRODUCT_SPEC.md` and `ARCHITECTURE.md`; those documents remain useful for the established catalogue, Stremio handoff, and visual implementation details.

## One-line concept

A Brazil-first discovery experience for films and series on the visitor's streaming subscriptions, presented as a joyful VHS rental store. Visitors choose their services, browse tapes, rent a small selection for free, and open titles on their own streaming services. Returns and rental history preserve the video-store ritual.

## Core product truth

Locadora is not a player and not a Letterboxd clone.

It recreates the decision ritual of renting films:

```text
browse → choose up to three titles → rent → return → remember what happened
```

The key distinction is that a rental is meaningful even when the film is not watched. A user can return a film as `not_watched` without being penalized. That is an honest signal: the film was attractive enough to rent but lost the competition for attention.

## Product boundaries

### Locadora owns

- 1990s video-store browsing and VHS presentation.
- Brazil-first discovery, including informational streaming availability.
- Open-ended, three-title rental simulation, return state, and rental history.
- Personal recommendations based on rental behaviour.
- Optional ratings and short reviews written inside Locadora.
- A deliberately light title-based community layer.

### External systems own

- **Stremio:** a visitor’s own add-ons, stream resolution, playback, subtitles, casting, and account. Locadora only opens a known public title deep link; it never accesses a visitor’s Stremio account, configuration, streams, tokens, local files, or playback history.
- **TMDB:** title metadata, images, regional provider data, credits, and Brazil certification where available.
- **Letterboxd:** its own diary, watchlist, ratings, reviews, and social network. Locadora does not pretend to be a live Letterboxd client.

### Never claim

- A title is playable because it appears in Locadora.
- A Brazil provider listing guarantees subscription access or playback.
- Rent/buy offers are subscription access.
- A Locadora review was posted to Letterboxd.

## Public MVP experience

### Anonymous browsing

“Seus streamings” is a visible optional chooser in normal and immersive browsing, with OR matching across selected subscriptions. New visitors selecting services default to all years; explicit saved year preferences are retained. Choosing no services explores the broader catalogue. A fixed Cesta with a count and up to three decorative tape spines keeps the current selection accessible; adding a tape announces success without requiring an OK dialog.

Anyone can browse the public store without an account:

- genre and store-year shelves;
- movie/series switch;
- Brazil subscription-provider filters;
- title details and local Stremio handoff;
- public Locadora ratings/reviews where enabled.

### Account creation only when participation begins

Require an account only for actions that need durable personal data:

- renting titles;
- returning a rental;
- recording watched/not watched;
- saving a title to Assistir depois or Favoritos;
- rating/reviewing;
- viewing personal rental history.

The initial sign-in is Clerk-managed email + password. Account setup also requires a unique public username, used as the visible byline on the member's public reviews. Clerk owns the browser session; Locadora does not implement password handling, email verification, password-recovery emails, or its own session cookies in MVP.

### Minimal personal data

Required:

- email address and password credential in Clerk;
- Clerk user ID.
- unique public username.

Not collected for MVP:

- Locadora-held password or password hash;
- real name;
- address;
- phone number;
- payment details;
- date of birth;
- Stremio details;
- playback or device tracking.

Email is private Clerk-held authentication/contact data and is never displayed on reviews or public pages. The Locadora database stores the Clerk user ID and unique public username, not a password credential. The required username is the public review byline and may later also appear on a membership card; it is not a full public profile.

## Rental loop

Initial default: an open-ended rental simulation, not a real purchase or real inventory reservation.

```text
Choose titles over time
  → keep at most three active titles at once
  → retain each title until the visitor chooses to return it
  → record each title's rental and return timestamps
  → derive the number of days held from those timestamps
  → return each title later
  → mark watched / not watched / leave unknown
  → optionally rate or write a short rental note
```

There is no due date or payment in MVP. A visitor can keep an active title indefinitely, but may not hold more than three titles at once. The three-title limit is enforced server-side across all active rental items.

Successful rental ends with “🍿 Boa sessão!”, selected-title cards and service destinations loaded independently of the rental write. “Ver streamings” is also available from public title inspection and active rentals in Minha conta. Subscription destinations are best-effort public TMDB watch-page extraction by the read-only Worker, with JustWatch attribution and a clearly labelled TMDB fallback. Paid rental/purchase offers are excluded, and add-on channels are never conflated with base subscriptions. Link loading or failures never change the confirmed rental.

## Core data model

### Authentication and profile

```text
Clerk user
- id
- email (held by Clerk)

profile
- user_id (PK; Clerk user ID)
- username (unique; required; public review byline)
- created_at
```

### Rental history

```text
rental
- id
- user_id
- opened_at
- returned_at (nullable)
- status: active | returned

rental_item
- id
- rental_id
- tmdb_id / imdb_id / canonical title key
- title_type: movie | series
- title_title_snapshot
- release_year_snapshot
- rented_at
- returned_at (nullable)
- watched_status: unknown | watched | not_watched
```

Only one active rental exists per user, with at most three active `rental_item` rows. The title snapshots preserve meaningful rental history even if upstream metadata changes, while `returned_at - rented_at` provides the days held.

### Personal saved collections

```text
saved_title_membership
- id
- user_id
- canonical title key (unique per user and collection)
- tmdb_id
- title_type: movie | series
- title_title_snapshot
- release_year_snapshot
- collection: watch_later | favorite
- source: locadora | letterboxd | startpage
- source_note (nullable)
- added_at
- completed_at (nullable; meaningful only for watch_later)
```

Assistir depois and Favoritos are independent personal shelves between the public shelves and the Balcão. One title may have one membership in each collection without duplicating its canonical title identity. Returning a matching rented title as `watched` automatically completes/removes only its active Assistir depois membership; Favoritos remains unchanged. Returning as `not_watched` or `unknown` leaves Assistir depois active. Re-saving a completed Assistir depois title reactivates its existing membership rather than creating a duplicate. A saved title is interest, not watched history, rating, or rental history. The collection identifiers are also the stable basis for future dedicated immersive stands.

### Reviews and community

```text
review
- id
- user_id
- canonical title key
- rating (nullable, 0.5–5)
- body (nullable, bounded length)
- visibility: public by default | private when explicitly selected
- body_censored (derived/display text with prohibited cursewords masked)
- created_at
- updated_at
- deleted_at (nullable)

review_reaction
- review_id
- user_id
- type: helpful

review_report
- review_id
- reporter_user_id
- reason
- status: open | reviewed | actioned
```

Ratings/reviews are optional and should be offered during return, never demanded. A user can rent/return without watching and without reviewing. Reviews are public by default and visibly attributed to the author's username; the author may explicitly mark a review private.

### Implemented first review slice

The first delivery is deliberately title-inspector-first: every inspected tape has an indicated `★ Avaliações` action that opens the public rating and review ledger. A review requires a written text and a rating from `0.5` to `5` in `0.5` increments. A member may submit or replace their review only after a server-verified returned `rental_item` for that exact canonical title is marked `watched`; browser state is never trusted as the eligibility proof. Public reads expose only username bylines, rating, display body, and aggregate/title review data. Private visibility, reactions, reports, moderation, edit/delete UI, and display-time curseword masking remain later community work.

## Recommendation philosophy

No AI is required for MVP. Start deterministic and explainable:

- genres, directors, cast, and eras repeatedly chosen and marked watched;
- films commonly held together;
- people who rented this also rented…;
- alternatives to titles a user rented but returned unwatched;
- a user’s recurring genre patterns.

Do not infer a negative opinion from `not_watched`. Treat it as an incomplete-interest signal, not a dislike.

## Light community scope

MVP community is title-centric, not a general social network:

- public ratings and short public reviews;
- recent reviews on a title page;
- useful/helpful reaction;
- report review;
- edit/delete own review;
- automatic display-time curseword censoring that masks prohibited words but preserves the review;
- an admin moderation queue and ability to hide/remove content for reports or policy violations beyond ordinary profanity.

Explicitly not MVP:

- direct messages;
- follows/feed;
- replies/threaded comments;
- public user profiles;
- real-time chat;
- paid creator features.

Replies can be reconsidered only after moderation flow and title-review usage are proven.

## Letterboxd interoperability

Letterboxd’s official FAQ describes its API as private and selectively offered to partners. Therefore:

- do not scrape Letterboxd;
- do not request a Letterboxd password or session;
- do not use undocumented website endpoints;
- do not promise automatic or background synchronization.

### Feasible import: user-controlled CSV

A user may export their own Letterboxd account bundle and upload selected CSV data to Locadora.

First scope: **watchlist import**.

```text
Letterboxd export CSV → Locadora upload → title matching/review screen → Locadora wishlist / rental candidates
```

Later optional import scopes:

- watched history;
- ratings;
- reviews.

Import must show ambiguous/unmatched titles for user correction. Imported Letterboxd data must be clearly marked as imported, not fabricated as Locadora rental history.

### Feasible export: user-controlled CSV

Locadora can generate a Letterboxd-compatible CSV for manual user import, such as:

- Locadora wishlist;
- watched rental history;
- user-selected ratings/reviews written in Locadora.

This is an export file, not an automatic post to Letterboxd.

### Private Startpage integration

Startpage is a separate production application with its own frontend, Worker, and Supabase setup. Locadora must not share databases, browser sessions, or credentials with it.

After the public Locadora watchlist exists, a narrow server-to-server integration may let the owner's Startpage Rec List send a user-confirmed, resolved TMDB title to the owner's Locadora watchlist. Startpage's Worker holds the integration credential; the browser never does. Its target must be a separate private integration service or Supabase Edge Function—not the public read-only `locadora-api` Worker, which never holds a Supabase service-role secret. This is private owner tooling only: it is not shown, documented as a public account feature, or made available to ordinary Locadora members in the first public release. A future public version would need explicit user account linking, not reuse this owner credential.

## Hosting architecture

```text
GitHub Pages (public static portfolio deployment)
  ├─ public Locadora UI
  ├─ Clerk (email + password authentication and session)
  └─ dedicated locadora-api Cloudflare Worker
       ├─ TMDB_API_KEY secret
       ├─ public catalogue manifests / metadata fetches
       ├─ data normalization and validation
       ├─ strict cache policy
       └─ exact CORS allowlist for the GitHub Pages origin
  └─ dedicated private locadora-data Cloudflare Worker
       ├─ verifies Clerk user tokens
       ├─ holds the Supabase service-role secret
       └─ reads/writes Supabase Postgres for Locadora data
```

GitHub Pages stays the public frontend for portfolio reasons.

## Supabase responsibilities

Use hosted Supabase Postgres for MVP. Clerk, not Supabase Auth, owns email/password authentication and sessions. Supabase is open source and can be self-hosted later if needed.

The browser has no Supabase credential. Only the private `locadora-data` Worker receives the Supabase service-role secret; the public `locadora-api` Worker never receives it.

The private data Worker must enforce:

- a user can read/write only their own profile, rentals, rental items, private reviews, reactions, and reports;
- users can read only public reviews and their aggregated title statistics;
- public review creation requires an authenticated user;
- moderator/admin actions use a separate controlled role/server path;
- rental/history queries never expose another user’s personal history.

Configure Clerk for email + password sign-in without Locadora-operated email delivery, verification, or password recovery in MVP.

## Cloudflare Worker responsibilities

Create a dedicated public Worker, e.g. `locadora-api`, in the existing Cloudflare account/workspace. Do **not** add anonymous Locadora routes to `/home/illan/Documents/coding/wrangler/api-proxy`: that Worker contains personal authenticated APIs and unrelated provider secrets.

The dedicated Worker has only what Locadora needs:

```text
secret:
- TMDB_API_KEY

public read-only endpoints:
- GET /v1/shelf
- GET /v1/title
- GET /v1/providers
- GET /v1/watch-links (validated title identity; public Brazil subscription destinations only)
- GET /v1/image (only if a validated image proxy remains necessary)
```

Worker functions:

1. validate bounded shelf/title/filter inputs;
2. request TMDB and approved public catalogue sources over HTTPS;
3. enforce a fixed allowlist of upstream hosts and safe redirects — never act as an arbitrary URL proxy;
4. normalize external data into Locadora’s stable title contract;
5. keep TMDB API credentials server-side;
6. return country-specific provider data as informational, time-sensitive metadata;
7. cache safely;
8. return clean errors and never log secrets.

The public Worker does not:

- access Supabase service-role credentials;
- own user authentication or rental writes;
- proxy arbitrary user requests;
- access Stremio user data;
- resolve/play streams;
- write to Letterboxd.

### CORS

Allow only the deliberate GitHub Pages production origin and explicit development/preview origins. Do not reflect arbitrary `Origin` headers. The public Worker is read-only, but its CORS policy still must be explicit.

### Caching

Start with Cloudflare Cache API, then add KV only if measurements require it.

Suggested lifetimes:

```text
shelf result: 15–60 minutes
stable title metadata/credits: 1–7 days
provider registry: 7–30 days
Brazil availability: short-lived and visibly informational
```

### Current Workers Free-plan constraints checked on 2026-07-21

- 100,000 incoming Worker requests/day per Cloudflare account;
- 10 ms CPU/request;
- 50 subrequests/request;
- 6 simultaneous outbound connections/request;
- Cache API: 50 calls/request;
- 64 environment variables/secrets per Worker;
- 3 MB compressed Worker bundle.

The existing provider-filtered shelf behaviour can reach roughly 42 TMDB subrequests (two discovery pages plus up to 40 external-ID lookups). This fits under 50 but leaves little headroom: do not add per-title enrichment to that same request. Cache aggressively and retain a bounded request design.

Workers in the same account share the daily request quota. Separating `locadora-api` is nevertheless required for security, deployment isolation, and a minimal-secret boundary.

## Stremio integration boundary

Locadora may generate a known-title URI such as:

```text
stremio:///detail/movie/tt0133093
```

The visitor’s operating system/browser passes it to their own installed Stremio handler. Locadora receives no confirmation of playback and stores no playback data. Any user-facing text must describe this as “Open in Stremio,” never promise availability.

## Funding

The project is free and open source. A voluntary 3D tip jar and quiet “Apoiar a Locadora” controls throughout browsing and modal flows open the same anonymous Pix support panel. Rental completion includes a warmer optional invitation beneath service links. Support is never tied to rentals, accounts, or feature access. The public key and QR-image path are configured in `public/donation-config.js`; empty configuration shows an honest unavailable state. See [Pix setup](docs/donations.md). There is no donation verification or payment backend.

No feature, account, rental history, or recommendation is paywalled in MVP.

## Balcony visual direction

The Balcony is the next frontend-first, non-free-roam counter experiment. It uses local state to make one active Balcão pile move through `counter → rented → returned`, before the public backend exists. It also holds the distinct voluntary 3D tip jar, a return area, a staff-side CRT counter, and a subtle username/rental-card cue. The CRT visibly says “Clique para pesquisar título”; a physical/visible Balcão action says “Alugar títulos”. The 3D Balcão and its 2D fallback must offer the same rental, search, saved-collection, return, and counter actions. The Assistir depois and Favoritos shelves sit between ordinary shelves and the Balcão, with a floating saved-collections access button beside the CRT. Their collection identifiers are designed for future dedicated immersive stands. Its detailed visual brief, interaction model, supporter-thank-you outcomes, and local-state acceptance checkpoint are in [`docs/balcony.md`](docs/balcony.md).

## MVP scope

Ship when a person can:

1. browse the public GitHub Pages store;
2. sign in with Clerk email + password and choose a unique public username when they choose to rent, save a title to Assistir depois or Favoritos, or review;
3. rent and retain up to three active titles without a due date;
4. return each item as watched, not watched, or unknown;
5. view their rental history;
6. write an optional rating or short review that is public under their username unless they explicitly make it private;
7. read public title reviews, see ordinary cursewords automatically censored, and report harmful content;
8. import a personal Letterboxd watchlist CSV and export a Locadora list/history CSV;
9. open a known title in their own Stremio installation without Locadora touching personal Stremio data.

## Explicitly later

- payments, subscriptions, or any paywall; the voluntary external tip jar is the only funding element;
- real inventory/scarcity;
- direct Letterboxd API integration, unless Letterboxd grants official partner access;
- automatic Letterboxd sync;
- full social graph, follows, DMs, replies, or public profiles;
- AI recommendations;
- shared/family rental accounts;
- desktop packaging;
- advanced 3D store expansion before the rental loop is proven.

## Decisions

Resolved MVP decisions:

- The first Letterboxd import is watchlist-only; diary/ratings/reviews are deferred.
- Cesta holds up to fifteen candidate titles; active rentals have no due date, allow at most three titles per user, and measure days held from per-title timestamps.
- Assistir depois and Favoritos are independent saved-title collections. A watched return automatically removes only the matching Assistir depois membership; unknown and not-watched returns retain it; Favoritos remains independent. Collection identifiers are reserved for future dedicated immersive stands.
- Startpage-to-Locadora Assistir depois saving is private owner tooling through a narrow Startpage Worker → separate private Locadora integration API, never the public read-only Worker or a public feature in the first release.
- Accounts require a unique public username; reviews are public by default under that username unless the author explicitly marks one private. Email remains private.
- Ordinary cursewords are automatically censored in displayed review text, not grounds for deleting the review by themselves. Reports go to an admin queue; moderators may hide/remove content for policy violations beyond this automatic censoring.
