# Locadora Localization, Store Expansion, and Rental Model Plan

> **Historical planning record (2026-07-20):** This plan predates the public Pages + Worker architecture and its SQLite/local-only persistence assumptions are superseded. Use `MVP_PUBLIC_PRODUCT_AND_ARCHITECTURE.md` and `TASKS.md` for current work.

**Goal:** Extend Locadora after the current rental loop is accepted with bilingual presentation, richer immersive-store controls and landmarks, multi-service discovery, then a durable local rental model and database schema.

**Architecture:** Keep the browser as a local discovery/presentation layer and retain native Stremio as the playback authority. Add locale and visual preferences as local settings first; only introduce a database when rental history, title metadata, provider availability, and durable room state need coherent persistence.

**Tech Stack:** Existing dependency-free Node bridge, browser JavaScript, Three.js, TMDB server-side enrichment, Stremio-compatible catalogue sources. Future local persistence should be SQLite behind the Node bridge; do not introduce a hosted backend for these features.

---

## Product decisions recorded

1. **Locale:** Add a persistent PT/EN toggle. `pt-BR` is the preferred metadata locale; `en-US` is the English alternative. Never machine-translate missing metadata.
2. **Metadata fallback:** For a localized title, synopsis, tagline, collection name, genre label, and logo: requested TMDB locale → TMDB original value → existing catalogue value. Person names remain unchanged.
3. **Service filters:** Multi-select service filters use **OR** semantics: a title is eligible when it is available on *any* selected service in Brazil through TMDB `flatrate` availability. Matching must use canonical TMDB provider IDs, not localized names.
4. **Year override:** When at least one service is selected, expose an explicit `Ignore store year` checkbox. Off retains the current provider-filtered 20-year window; on removes the Store Year constraint rather than silently changing it.
5. **Provider channels:** Keep provider channels (for example, Amazon Channels) out of the primary service filters unless separately chosen later. A `Prime Video` filter means Prime Video’s ordinary subscription availability.
6. **Immersive store:** All visible controls remain optional, compact, accessible, persisted locally, and available without requiring free-roam movement.
7. **Balcony:** The future balcony has two distinct zones: recent picks (titles the visitor explicitly handled/selected) and counter items (titles actively queued for rental). The exact definition and retention policy for a “recent pick” remain a product decision before implementation.
8. **Rental:** A Locadora rental is a local experience/state model, not playback entitlement. Stremio still decides whether a title can play.

---

## Recommended delivery order

Do not build all of this at once. Implement and playtest in this order:

1. Localization foundation and PT/EN toggle.
2. Multi-service filtering plus the explicit year override.
3. Genre color system, selected-service logo indicators, and lighting customization.
4. Front/back VHS zoom and wall posters.
5. Balcony interactions after the main shelf loop and selected-title semantics are accepted.
6. Rental-time product definition, then the persistence/schema migration.

---

## Phase A — PT/EN localization

### Task A1: Define locale contract and UI copy inventory

**Objective:** Establish the two supported locales without mixed or hard-coded UI copy.

**Files:**
- Create: `public/i18n.js`
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Test: `test/app-core.test.js`

**Steps:**
1. List every user-visible static string in the normal shelf, immersive controls, title view actions, empty states, and provider filters.
2. Add a small locale dictionary keyed by stable message IDs for `pt-BR` and `en-US`; do not add a translation library.
3. Add a keyboard-accessible locale selector to the existing compact header and immersive strip.
4. Persist `locadora.locale`; synchronize both controls and restore it on startup.
5. Write tests for locale normalization, persistence-safe fallback to `pt-BR`, and missing-key fallback behavior.
6. Run `node --test test/app-core.test.js`.

**Acceptance:** Changing the locale updates all static UI copy without a page reload, and all unsupported values safely resolve to `pt-BR`.

### Task A2: Make TMDB metadata locale-aware

**Objective:** Return title metadata in the requested language while preserving clean fallbacks.

**Files:**
- Modify: `src/tmdb.js`
- Modify: `src/catalogue.js`
- Modify: `src/server.js`
- Modify: `public/app.js`
- Test: `test/catalogue.test.js`
- Test: `test/server.test.js`

**Steps:**
1. Write a failing TMDB-client test with distinct `pt-BR` and `en-US` title/overview fields and a missing Portuguese field.
2. Change the TMDB request function to accept a validated locale per enrichment request; only allow `pt-BR` and `en-US`.
3. Add normalized metadata fields such as `displayTitle`, `displayDescription`, and optional `tagline`; preserve source title/description as final fallbacks.
4. Include locale in the server metadata request validation and `CatalogueStore` metadata-cache key so an English request cannot return cached Portuguese text.
5. Pass the selected client locale through `/api/meta` and refresh the open VHS detail when locale changes.
6. Do not eagerly enrich every shelf card merely to translate its spine; defer that product/performance choice until localized detail playtesting is accepted.
7. Run focused tests, then `npm run test`.

**Acceptance:** A title with Portuguese TMDB data displays Portuguese title/synopsis on the opened VHS; missing Portuguese values cleanly fall back to source/original values; switching to English returns English data independently.

---

## Phase B — multi-service discovery

### Task B1: Define the canonical Brazilian provider registry

**Objective:** Support a deliberately curated set of services without matching translated display strings.

**Files:**
- Create: `src/providers.js`
- Modify: `src/tmdb.js`
- Modify: `src/catalogue.js`
- Test: `test/catalogue.test.js`

**Initial provider candidates:** Netflix, Prime Video, Max, Disney+, Globoplay, Paramount+, Apple TV+, MUBI, Telecine, Crunchyroll.

**Steps:**
1. Confirm each TMDB provider ID and Brazil availability behavior using a non-secret fixture and a short live validation only after the user approves the roster.
2. Store `{ id, tmdbProviderId, canonicalName, displayName, logoPath }` in one registry; do not use raw names as filter identity.
3. Change TMDB availability normalization to retain provider IDs and logo paths alongside display information.
4. Write tests covering one provider, multiple providers, no Brazilian offers, rent/buy-only offers, and provider-channel exclusion.
5. Run `node --test test/catalogue.test.js`.

**Acceptance:** The app can identify a selected service even if TMDB localizes its provider display name.

### Task B2: Replace the single service dropdown with multi-select OR filtering

**Objective:** Let a visitor select any number of services and receive titles available on at least one selected service in Brazil.

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/app.js`
- Modify: `src/server.js`
- Modify: `src/catalogue.js`
- Test: `test/server.test.js`
- Test: `test/catalogue.test.js`

**Steps:**
1. Write failing server tests for repeated/comma-separated selected provider IDs and reject unsupported IDs.
2. Normalize selected IDs as a sorted unique array in the server contract and cache key.
3. Implement OR matching with `Array.prototype.some` against provider IDs in TMDB `flatrate` offers.
4. Replace the normal and immersive single selects with accessible checkbox/popover controls, preserving immersive staged **Go** behavior.
5. State the active filter in shelf caption/status using translated display names.
6. Run focused tests and `npm run test`.

**Acceptance:** Selecting Netflix plus Max shows titles found on Netflix **or** Max in Brazil; no service selection preserves existing shelves.

### Task B3: Add the explicit Ignore Store Year setting

**Objective:** Make broad provider discovery intentional and understandable.

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `src/server.js`
- Modify: `src/catalogue.js`
- Modify: `README.md`
- Test: `test/app-core.test.js`
- Test: `test/catalogue.test.js`
- Test: `test/server.test.js`

**Steps:**
1. Write a failing filter test: selected providers + override includes titles outside the Store Year window; no selected provider ignores/disabled override.
2. Add a persisted `ignoreStoreYear` boolean valid only when providers are selected.
3. When false, retain the 20-year provider window. When true, use a documented release-year range capped by the catalogue’s supported era/current upper bound; do not issue unbounded requests.
4. Add explanatory UI copy that names the active scope, e.g. “Netflix + Max in Brazil · all release years.”
5. Benchmark source requests and add a result cap/cursor strategy before enabling wide historical scans.
6. Run `npm run test` and a real local API probe with the user’s configured key.

**Acceptance:** Users can knowingly choose discovery across all supported years without accidentally losing the historical-store mechanic.

---

## Phase C — immersive visual controls and identity

### Task C1: Create centralized genre stand themes

**Objective:** Make each genre stand visibly distinct while retaining Locadora’s identity.

**Files:**
- Create: `public/genre-themes.js`
- Modify: `public/immersive-shelf.mjs`
- Modify: `public/app.js`
- Test: static/source contract in `test/server.test.js` or a new pure-data test

**Steps:**
1. Define one palette per existing broad genre: stand paint, shelf trim, sign accent, and restrained lamp accent.
2. Keep required text contrast and retain common Locadora red/yellow/cream accents.
3. Pass the selected genre’s theme into the reusable immersive shelf instead of hard-coding blue material values.
4. Test that every supported genre has a complete theme and no invalid color values.
5. User playtests readability and mood before further visual work.

**Acceptance:** Changing genre changes the stand’s identity without changing interaction behavior or making labels unreadable.

### Task C2: Add persistent lamp brightness and warmth controls

**Objective:** Let visitors tune the immersive lamps without introducing a complex lighting console.

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/immersive-shelf.mjs`
- Modify: `public/app.js`
- Test: pure preference-normalization tests

**Steps:**
1. Add two compact sliders inside the existing Sound/settings drawer: brightness and warmth.
2. Represent warmth as a bounded Kelvin-like preset/range mapped to RGB in one helper; never expose arbitrary per-light colors.
3. Apply settings to both physical lamp emissive material and light color/intensity together.
4. Persist local values, honor reduced-motion/preferences, and add a Reset Lights action.
5. Test bounds, default values, and persistence normalization.
6. User playtests in dark and bright displays.

**Acceptance:** Brightness and warmth update immediately, persist locally, and preserve readable tape labels.

### Task C3: Add front/back detail zoom

**Objective:** Allow close inspection of tape artwork and back-cover information separately from whole-case rotation.

**Files:**
- Modify: `public/vhs-3d.mjs`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Test: `test/server.test.js` static contract plus extracted pure zoom-state test

**Steps:**
1. Extract a bounded zoom state machine with `whole`, `front-focus`, and `back-focus` modes.
2. Add explicit accessible front/back zoom buttons alongside the VHS canvas; do not rely on tiny painted canvas hit targets as the sole control.
3. Keep drag rotation and double-click flip intact; reset detail focus on close.
4. Add keyboard equivalents and clear `aria-label` updates.
5. Test zoom bounds, mode transitions, and reset behavior.

**Acceptance:** A visitor can deliberately zoom the poster/front or provider/credits/back without losing the tape’s overall interaction model.

### Task C4: Add decade-appropriate wall posters behind stands

**Objective:** Give the room depth with contextual background art without obscuring shelves or violating image-use constraints.

**Files:**
- Modify: `public/immersive-shelf.mjs`
- Modify: `public/app.js`
- Modify: `src/tmdb.js` only if image selection needs new normalized fields
- Modify: `docs/` with image/attribution policy
- Test: static asset/URL safety tests

**Steps:**
1. Decide art source before implementation: TMDB-backed title poster images with required attribution/compliance, original Locadora posters, or user-supplied cleared assets.
2. Prefer a small, cached, deterministic set derived from titles near the selected Store Year; do not download arbitrary images directly in browser code.
3. Place posters behind/above stands with depth offsets and low visual dominance.
4. Use the existing validated image proxy for remote imagery and provide graceful blank-frame fallback.
5. Test URL validation and no-image behavior.
6. User playtests for clutter, visual legibility, and TMDB attribution compliance.

**Acceptance:** Posters make the store feel dated to the selected era without becoming clickable content, a rights liability, or a performance bottleneck.

### Task C5: Show selected-service logos on immersive stands

**Objective:** Make active service filters obvious at a glance.

**Files:**
- Modify: `public/immersive-shelf.mjs`
- Modify: `public/app.js`
- Modify: `src/tmdb.js` / `src/providers.js`
- Modify: `docs/` with provider-logo attribution/display requirements
- Test: provider-logo selection/state tests

**Steps:**
1. Use registry-backed provider logo paths; never scrape provider websites or invent logos.
2. Render selected-service logos as a small physical plaque/sign beside the stand label, not on every tape.
3. Render a translated “Any selected service in Brazil” caption for multi-select OR behavior.
4. Hide the plaque when no provider filter is active.
5. Test empty, one-logo, and multi-logo layout state.

**Acceptance:** A visitor can tell which services are filtering the room without reading the header.

---

## Phase D — balcony and selection state

### Task D1: Resolve the semantic difference between pick and counter

**Objective:** Avoid building a balcony around ambiguous state.

**Files:**
- Modify: `PRODUCT_SPEC.md`
- Modify: `TASKS.md`
- Create: a short decision record under `docs/`

**Open questions requiring user decision:**
- Is a “pick” an item deliberately held for later, an inspection history, a favorite, or a pre-counter selection?
- Is it persistent across sessions? If so, how many items are retained?
- Can the same title exist in both the picks area and counter?
- Does removing it from counter return it to picks?

**Acceptance:** The data model and balcony zones have one unambiguous definition before code begins.

### Task D2: Build a non-free-roam balcony view

**Objective:** Add a second visible set beyond the main stands for picks and counter items.

**Files:**
- Modify: `public/immersive-shelf.mjs`
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Test: extracted state/render contract tests

**Steps:**
1. Model balcony contents as two deterministic collections: picks and counter.
2. Add a camera target/zoom route rather than WASD/free-roam navigation.
3. Render counter titles as a distinct checkout-ready display; make item actions explicit and accessible outside canvas-only hit areas.
4. Use placeholders and empty-state signage when either zone has no tapes.
5. Cache/refresh balcony state after pick or counter mutations.
6. User playtests visual scale, navigation cost, and whether the extra depth improves the rental loop.

**Acceptance:** The balcony is useful as a glanceable state landmark, not a second complicated shelf browser.

---

## Phase E — definitive rental time and durable local data model

### Task E1: Write the rental product rules before choosing schema

**Objective:** Define rental time as a meaningful local ritual rather than an arbitrary timer.

**Files:**
- Modify: `PRODUCT_SPEC.md`
- Create: `docs/rental-model.md`

**Questions to decide with the user:**
- When does a rental begin: counter checkout, Stremio handoff, or an explicit “start rental” action?
- What is the duration: hours, one evening, 24/48 hours, or a return-by calendar date?
- Can a visitor renew, return early, mark unwatched, or archive a rental?
- Does expiry only change Locadora’s local state/signage, while leaving Stremio handoff available? Recommended: yes.
- How do series work: one title rental, season, episode, or no special model initially?
- Are rentals only local to one browser/device, or later syncable?

**Acceptance:** The product defines a rental’s lifecycle, user benefit, and limits without implying playback restriction.

### Task E2: Design and validate a local SQLite schema

**Objective:** Replace scattered browser/local JSON persistence only when the rental model requires it.

**Files:**
- Create: `docs/database-schema.md`
- Create: `src/db/` migration and repository modules
- Modify: `server.js`
- Modify: `src/server.js`
- Modify: `src/catalogue.js`
- Modify: `public/app.js`
- Create: database-focused tests under `test/`

**Proposed entity groups:**

```text
settings
- key, value_json, updated_at

catalogue_sources
- id, name, manifest_url, enabled, capabilities_json, created_at, updated_at

titles
- id, type, original_title, release_year, source_id, created_at, updated_at

title_external_ids
- title_id, provider, external_id

title_localizations
- title_id, locale, display_title, overview, tagline, genres_json, logo_path, updated_at

providers
- tmdb_provider_id, canonical_key, display_name, logo_path

provider_offers
- title_id, provider_id, region, offer_type, source_link, observed_at, expires_at

picks
- id, title_id, picked_at, position, note

counter_items
- id, title_id, added_at, position, note

rental_sessions
- id, started_at, due_at, returned_at, status, locale_at_start

rental_items
- id, rental_session_id, title_id, added_at, returned_at

rental_events
- id, rental_session_id, rental_item_id, event_type, occurred_at, payload_json

watch_handoffs
- id, title_id, rental_session_id nullable, handed_off_at, target
```

**Schema rules:**
- Keep secrets out of the database and browser responses.
- Store provider observations with timestamps because availability changes.
- Cache localized TMDB metadata by locale and refresh policy.
- Use migrations and foreign keys from day one.
- Do not model streams, torrents, debrid, Stremio credentials, or playback state.
- Keep a clean future migration path from SQLite to hosted Postgres only if a separately approved public product needs it.

**Validation:**
1. Migration applies to a fresh temporary database.
2. Migration is idempotent/versioned.
3. Rental lifecycle tests cover start, due, return, renew (if approved), and counter removal.
4. Provider availability freshness tests enforce timestamp/expiry rules.
5. `npm run test` remains green.

**Acceptance:** Locadora can preserve its meaningful local history without becoming a streaming backend or account system.

---

## Cross-cutting constraints and risks

- TMDB/provider data is availability metadata, not a playback guarantee; availability is region- and time-dependent.
- TMDB and provider-logo/image use must be rechecked against current attribution, caching, and display obligations before public deployment.
- Brazil service coverage must be validated with representative movie and series fixtures; absent TMDB results must never become a false negative claim about the real service.
- An all-year service query may be expensive against current catalogue sources. Benchmark and cap it before exposing it broadly.
- No browser assets may contain the TMDB key or raw third-party add-on configuration.
- Keep the `Watch Options` link as returned/permitted by TMDB; never manufacture Netflix/Prime deep links.
- Preserve the normal non-immersive shelf loop and keyboard access as the functional fallback for every 3D addition.

## Future verification checklist

- Unit: locale fallback, provider ID matching, OR semantics, ignore-year behavior, genre themes, lighting preference bounds, rental lifecycle.
- API: rejected invalid locale/provider parameters; no credential leakage; provider availability cache freshness.
- Integration: representative BR Netflix, Prime Video, Max, and a no-offer title; both movie and series.
- Manual playtest: Portuguese/English switching, provider plaque legibility, bright/dim lamp settings, front/back zoom, wall-poster clutter, balcony utility, and rental return flow.
- Final: `npm run test`, syntax checks, `git diff --check`, and user-owned browser validation.
