# Will’s Locadora — public MVP product and architecture

**Status:** active product direction
**Date:** 2026-07-21
**Purpose:** authoritative brief for the public, free, open-source Will’s Locadora MVP. It supersedes the old local-only deployment assumptions in `PRODUCT_SPEC.md` and `ARCHITECTURE.md`; those documents remain useful for the established catalogue, Stremio handoff, and visual implementation details.

## One-line concept

A Brazil-first online video rental store where people browse films as VHS, rent a small weekend selection, return it as watched or unwatched, and gradually build a personal rental history and community taste signal.

## Core product truth

Locadora is not a player and not a Letterboxd clone.

It recreates the decision ritual of renting films:

```text
browse → choose a small weekend selection → rent → return → remember what happened
```

The key distinction is that a rental is meaningful even when the film is not watched. A user can return a film as `not_watched` without being penalized. That is an honest signal: the film was attractive enough to rent but lost the competition for attention.

## Product boundaries

### Locadora owns

- 1990s video-store browsing and VHS presentation.
- Brazil-first discovery, including informational streaming availability.
- Weekend rental simulation, due dates, return state, and rental history.
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
- rating/reviewing;
- viewing personal rental history and recommendations.

The initial sign-in is passwordless email. Account setup also requires a unique public username, used as the visible byline on the member's public reviews. Supabase persists the browser session, so a returning visitor normally stays signed in; a new email link/code is only required on a new device/browser, after logout, cleared browser data, or expiry.

### Minimal personal data

Required:

- email address in Supabase Auth;
- internal authentication user ID.
- unique public username.

Not collected for MVP:

- password;
- real name;
- address;
- phone number;
- payment details;
- date of birth;
- Stremio details;
- playback or device tracking.

Email is private authentication/contact data and is never displayed on reviews or public pages. The required username is the public review byline and may later also appear on a membership card; it is not a full public profile.

## Rental loop

Initial default: a weekend rental simulation, not a real purchase or real inventory reservation.

```text
Friday/weekend selection
  → choose a small set of titles
  → create rental with a due date (normally Monday)
  → return each title later
  → mark watched / not watched / leave unknown
  → optionally rate or write a short rental note
```

The exact package constraint (strict 2–3 titles versus any small number) remains a product decision. Pricing is simulated and descriptive at first, e.g. a Friday-to-Monday rental charging one daily price per title. There are no payments in MVP.

## Core data model

### Authentication and profile

```text
Auth user
- id
- email

profile
- user_id (PK/FK to auth user)
- username (unique; required; public review byline)
- created_at
```

### Rental history

```text
rental
- id
- user_id
- rented_at
- due_at
- returned_at (nullable)
- status: active | returned
- pricing_rule_snapshot
- displayed_total (simulated)

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

The title snapshots preserve meaningful rental history even if upstream metadata changes.

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

## Recommendation philosophy

No AI is required for MVP. Start deterministic and explainable:

- genres, directors, cast, and eras repeatedly chosen and marked watched;
- films commonly rented together for a weekend;
- people who rented this also rented…;
- alternatives to titles a user rented but returned unwatched;
- a user’s recurring weekend/genre patterns.

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

## Hosting architecture

```text
GitHub Pages (public static portfolio deployment)
  ├─ public Locadora UI
  ├─ Supabase Auth (passwordless email/session)
  ├─ Supabase Postgres through anon key + Row Level Security
  └─ dedicated locadora-api Cloudflare Worker
       ├─ TMDB_API_KEY secret
       ├─ public catalogue manifests / metadata fetches
       ├─ data normalization and validation
       ├─ strict cache policy
       └─ exact CORS allowlist for the GitHub Pages origin
```

GitHub Pages stays the public frontend for portfolio reasons.

## Supabase responsibilities

Use hosted Supabase Auth + Postgres for MVP. Supabase is open source and can be self-hosted later if needed.

The browser may use the public Supabase anon key. It must never have a service-role key.

Row Level Security must ensure:

- a user can read/write only their own profile, rentals, rental items, private reviews, reactions, and reports;
- users can read only public reviews and their aggregated title statistics;
- public review creation requires an authenticated user;
- moderator/admin actions use a separate controlled role/server path;
- rental/recommendation queries never expose another user’s personal history.

Use passwordless email with a custom verified sender/domain SMTP configuration for real public email delivery. Do not rely on a development sender for launch.

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

The Worker does not:

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

The project is free and open source. A voluntary, non-blocking 3D tip jar is part of the store ambience: “Keep the lights on at the Locadora.” It may lead to an external donation flow, but is never tied to rentals, accounts, or feature access.

No feature, account, rental history, or recommendation is paywalled in MVP.

## Balcony visual direction

The Balcony is the next frontend-first, non-free-roam counter experiment. It uses local state to make one active Balcão pile move through `counter → rented → returned`, before the public backend exists. It also holds the distinct voluntary 3D tip jar, a return area, a staff-side CRT counter, and a subtle username/rental-card cue. Its detailed visual brief, interaction model, supporter-thank-you outcomes, and local-state acceptance checkpoint are in [`docs/balcony.md`](docs/balcony.md).

## MVP scope

Ship when a person can:

1. browse the public GitHub Pages store;
2. sign in with passwordless email and choose a unique public username when they choose to rent or review;
3. rent a weekend selection with a due date;
4. return each item as watched, not watched, or unknown;
5. view their rental history;
6. receive basic deterministic picks from their rental data;
7. write an optional rating or short review that is public under their username unless they explicitly make it private;
8. read public title reviews, see ordinary cursewords automatically censored, and report harmful content;
9. import a personal Letterboxd watchlist CSV and export a Locadora list/history CSV;
10. open a known title in their own Stremio installation without Locadora touching personal Stremio data.

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

Still required before rental implementation:

1. Is the initial weekend deal a strict 2–3 title package or any small number of titles?
2. Is the return due date always Monday, or based on the day of the week?

Resolved MVP decisions:

- The first Letterboxd import is watchlist-only; diary/ratings/reviews are deferred.
- Accounts require a unique public username; reviews are public by default under that username unless the author explicitly marks one private. Email remains private.
- Ordinary cursewords are automatically censored in displayed review text, not grounds for deleting the review by themselves. Reports go to an admin queue; moderators may hide/remove content for policy violations beyond this automatic censoring.
