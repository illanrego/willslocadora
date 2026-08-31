# Locadora — Final Sprint UX and Interaction Plan

Status: planning approved for implementation
Scope: final polish of the public browse/rental experience
Date: 2026-08-30

## Product decisions locked

1. Cesta is a larger candidate collection: up to 15 distinct canonical titles.
2. Active rentals remain capped at 3 titles at once. A visitor must return an active title before renting another.
3. The final rental request is the only place where the 1–3 title constraint is enforced.
4. Assistir depois and Favoritos are independent durable memberships. One title may belong to both.
5. The saved-title architecture must support future dedicated immersive stands without duplicating title identity or mixing collection semantics.
6. The existing 3D environment is preserved: stands, banners, posters, lighting, props, counter objects, and physical scene composition are not removed or replaced.
7. The immersive redesign targets menus and buttons only: quieter controls, less visual obstruction, clearer hierarchy, and a persistent floating basket icon.
8. Title inspection returns to its origin. Cesta returns to Cesta, Assistir depois to Assistir depois, Favoritos to Favoritos, Balcão to Balcão, account/history to account, and direct immersive-shelf inspection to the immersive shelf.
9. The originating list's scroll position and initiating control focus are restored where the browser permits it.
10. Normal 2D browsing remains the proven default and is not visually rebuilt as part of the 3D polish.

## Current evidence and constraints

- `public/app.js` owns the shared browse, Cesta, Balcão, account, watchlist, inspection, and mode-transition paths.
- `public/app-core.js` already normalizes Cesta to 15 and active rental state to 3, but the product/UI state needs a final audit for accidental coupling.
- `public/vhs-3d.mjs` owns the reusable physical VHS inspector and currently reuses the renderer when changing titles.
- `public/immersive-shelf.mjs` and `public/balcony.mjs` own the existing 3D scenes. Their scene geometry is explicitly out of scope for removal.
- `public/tape-fallback.mjs` is the dependency-free fallback and must expose the same actions as the WebGL path.
- `public/index.html` contains the immersive HUD, Cesta/Balcão dialogs, title dialog, account dialog, and current single watchlist dialog.
- `public/styles.css` contains several successive immersive-HUD rule layers. The final rules produce the dense top control slab that is the main visual complaint.
- The current title source paths are not covered by a real browser interaction test. Existing tests are primarily source contracts and pure state tests.
- The current private data model has `watchlist_items` with one active watchlist concept. It does not yet model independent Favorites.
- `npm test` currently passes 149 tests. This is baseline evidence only; it does not prove the reported browser inspection problem is fixed.
- The current working tree has pre-existing favicon/index changes. They are unrelated to this sprint and must not be staged with the implementation.

## Finished-product interaction model

### Normal browse

```text
Browse shelf
  → inspect tape
  → optionally toggle + Assistir depois or ★ Favorito
  → optionally add to Cesta
  → close inspection and return to the shelf

Browse shelf
  → open Cesta
  → review candidate titles
  → Levar ao Balcão
  → review the temporary rental decision
  → Alugar pacote (1–3 only)
```

### Immersive shelf

The scene remains the catalogue. The control hierarchy becomes:

- Persistent floating basket icon with count. This is the primary transaction entry point.
- One compact menu toggle for secondary controls.
- Secondary menu contains filters, lighting/audio settings, account, and return-to-normal controls behind an accessible reveal panel.
- A clearly labelled Balcão destination remains available, but it must not compete visually with the basket or be buried in the settings menu.
- The Cesta dialog remains the review stop before entering Balcão. The basket must never jump directly to rental controls.

```text
floating Cesta icon
  → Cesta dialog
  → Levar ao Balcão
  → 3D Balcão
  → Abrir controles / review decision
  → Alugar pacote
```

The floating basket is an icon-first control with a visible count and accessible name, not a permanent text-heavy toast or another wide toolbar. It must remain reachable after the HUD is collapsed.

### Balcão

The Balcão scene remains intact. Its overlay controls become a small action rail rather than a large top dashboard:

- context label: `Balcão`;
- primary action: `Abrir controles do balcão` or the current decision action;
- secondary action: return to immersive shelf;
- compact zoom controls;
- account/list access only where needed, with icon buttons and accessible labels.

The native Balcão dialog remains the authoritative review and transaction surface. The physical 3D plaque continues to open that surface; it never silently rents.

### Saved-title destinations

`Minha lista` is replaced by a clear personal-shelf entry point with two sections or tabs:

- `Assistir depois` — plus icon, watch-later membership;
- `Favoritos` — star icon, favorite membership.

The two collections are independent. A title may appear in both. Empty states must name the collection, not say only “Minha lista”. Future immersive stands can consume the same collection identifiers without changing title identity.

## Architecture plan

### 1. Canonical title model

Create one normalized viewer title shape for every source:

- canonical `tmdb:<id>` identity;
- `type` (`movie` or `series`);
- name and year snapshot;
- optional artwork/metadata;
- optional rental item ID and rental timestamps;
- saved memberships as independent collection values;
- source metadata only where needed for return/focus restoration.

Do not make the inspector infer identity from a database row UUID, title text, or an incomplete list card. The existing `localRentalTitle()`/`memberTitleForViewer()` seam should be replaced or tightened so Cesta, Balcão, saved collections, active rentals, and history all enter the viewer through the same normalization path.

### 2. Saved-title persistence

Use collection membership rather than a single boolean watchlist concept. The preferred shape is one membership per user, canonical title, and collection:

```text
saved title membership
- user_id
- canonical_key
- tmdb_id
- title_type
- title_snapshot
- release_year_snapshot
- collection: watch_later | favorite
- source
- source_note
- added_at
- completed_at (meaningful only for watch_later)
```

A title in both collections has two memberships but one canonical title identity. This is deliberate: it supports future dedicated stands, separate sorting/counts, and independent removal without duplicating catalogue records.

Migration rules:

- Add a forward-only migration; do not rewrite historical migrations.
- Preserve current active watchlist rows as `watch_later` memberships.
- Replace the old uniqueness rule with uniqueness across `(user_id, canonical_key, collection)`.
- Keep watched-return completion scoped to `watch_later`; a watched return must not remove a favorite.
- Keep the 3-active-rental database invariant unchanged.
- Keep private data behind the existing authenticated `locadora-data` Worker and Supabase service-role boundary.

API shape:

- State response returns normalized saved titles with collection membership information, suitable for rendering both collections and future stands.
- Add explicit collection-aware save/remove operations. Do not make the client send an eligibility or completion flag as authority.
- Keep public catalogue reads and the public read-only Worker unchanged.
- Preserve or deliberately deprecate the current watchlist route only after checking all client and test usages; do not leave a misleading half-supported route.

### 3. Cesta/Balcão state

Keep the domains separate:

```text
Cesta: persisted local candidate collection, 0–15
Balcão decision: temporary review subset, 0–15
Active rental: server-owned accepted titles, 0–3 available slots
History: server-owned returned records
```

Rules:

- Cesta mutations can come from shelf, search, inspection, and saved-title lists.
- Entering Balcão copies Cesta into temporary review state.
- Removing a title from the temporary Balcão decision does not delete it from Cesta.
- Renting validates 1–3 only at final submission and leaves a 4–15 decision intact with an actionable message.
- On rental success, remove exactly the submitted canonical keys from Cesta according to the established product rule; do not accidentally clear unrelated saved collections or active rentals.
- A current active rental consumes server capacity, not Cesta capacity.
- 3D shelf, 3D Balcão, 2D dialogs, and fallback renderers must all visualize the declared domain rather than guessing from whichever array is convenient.

### 4. Inspection origin and return controller

Replace the current search-specific boolean return path with a general inspection-origin record:

```text
inspection origin
- source: shelf | cesta | balcony | watch_later | favorite | account_active | history | search
- origin dialog or mode
- title canonical key
- initiating control identity
- scroll position where applicable
- prior immersive mode where applicable
```

Opening a title should:

1. capture the origin before changing dialogs or viewer state;
2. normalize the title and render the branded placeholder immediately;
3. hydrate metadata/artwork without delaying a usable inspector unnecessarily;
4. reuse the single VHS renderer safely when switching titles;
5. keep the basket/save/review actions bound to the current canonical title;
6. restore the origin after close, including focus and scroll where possible.

For list/dialog origins, close the source surface before opening the title dialog if necessary to avoid native modal stacking problems, then reopen it on inspector close with a captured restore state. For direct immersive-shelf inspection, leave the scene mounted and simply close the title dialog back to that scene.

The origin controller must also cover:

- rapid switching between two list titles;
- opening an account/history title after an earlier shelf inspection;
- locale changes while metadata is loading;
- closing via visible close control, Escape, and the viewer's empty-space gesture;
- WebGL failure and DOM fallback.

### 5. Tape actions

On the title inspection surface, add a minimal semantic action pair beside the physical VHS:

- `＋` = Assistir depois;
- `★` = Favorito.

Each control must:

- have a localized accessible name;
- show active/inactive state with `aria-pressed`;
- update immediately after a successful mutation;
- use one canonical save/remove handler;
- remain separate from the transactional `Botar na cesta` action;
- remain visible in the fallback inspector.

For list rows in Cesta, Balcão, Assistir depois, Favoritos, account, and history, use compact icon buttons or icon-plus-label controls as space allows. Every row must retain a clear `Inspecionar`/`Ver fita` action. Saving a title must not implicitly rent it, mark it watched, or remove it from another collection.

## Implementation order

### Phase 0 — Reproduce and lock the baseline

Before editing:

- Re-run `git status --short --branch`.
- Preserve the favicon/index work.
- Exercise the current browser paths for inspection from Cesta, current watchlist, Balcão, account, and history.
- Record the first actual failure for each path: dialog visibility, stale viewer state, wrong title identity, focus loss, or return routing.
- Check whether local account configuration is available. If the authenticated live boundary is unavailable, test the static/local paths and document the limitation rather than weakening production auth.

### Phase 1 — State and persistence contract

Use strict RED → GREEN → REFACTOR cycles.

Tests first:

- Cesta accepts 15 and final rental preparation accepts only 1–3.
- Saved memberships allow one title in both collections.
- Removing a favorite leaves Assistir depois intact, and vice versa.
- Watched return completes/removes only Assistir depois, never Favoritos.
- State responses normalize legacy watchlist rows into Assistir depois.
- Collection-aware Worker routes reject invalid collection values and malformed canonical titles before database calls.
- RLS/service-role boundaries remain unchanged.

Then implement the forward migration, Worker repository mapping, response normalization, and client state shape.

### Phase 2 — One canonical inspect/restore path

Tests first:

- Each source maps to the same canonical title shape.
- Cesta-origin inspection restores Cesta and focus.
- Assistir depois/Favoritos restore the correct personal section.
- Balcão inspection restores the Balcão decision dialog without deleting the temporary selection.
- Account/history inspection restores account state.
- Search-origin inspection preserves query/results.
- Direct immersive-shelf inspection returns to the mounted shelf.
- A late metadata/image response cannot repaint a newer title.
- Placeholder remains visible when metadata/artwork fails.

Then implement the origin record, shared open/close helpers, list card renderer, and viewer hydration seam. Keep the existing one-renderer lifecycle and dispose behavior.

### Phase 3 — Minimal saved actions across all surfaces

Tests first:

- Title inspector renders plus/star controls with correct `aria-pressed` state.
- A successful toggle updates inspector, header/list counts, personal sections, and future immersive data without a reload race.
- A failed toggle does not show false success or change local state.
- Cesta/Balcão/account/history rows expose the same two collection actions where appropriate.
- DOM fallback exposes the same saved actions as WebGL inspection.

Then implement the controls, localized copy, collection sections, row actions, and sync behavior.

### Phase 4 — Immersive control redesign

Do not remove scene objects or rewrite scene geometry.

Tests/source contracts first:

- Floating basket control remains present and points to `basket-dialog`.
- Its count reflects the canonical Cesta state in normal and immersive modes.
- It remains visible when the secondary menu is collapsed.
- Secondary menu is one deliberate accessible reveal with `hidden`, `aria-controls`, and `aria-expanded`.
- Filters, settings, account, return, and Balcão actions remain reachable behind the compact control system.
- Balcão CTA routes through Cesta rather than silently opening rental submission.
- 3D Balcão retains its physical search, decision plaque, return, tip jar, and scene inspection behavior.
- Yellow interactive states retain dark readable text.

Then consolidate the duplicate immersive CSS layers and update only DOM overlays, labels, icon buttons, spacing, z-index, hover/focus/pressed states, and narrow-screen rules. Preserve the stand, banners, posters, lighting, props, and WebGL fallback.

### Phase 5 — 2D/list visual finish

Keep normal 2D composition intact. Change only what is needed for:

- unambiguous Assistir depois/Favoritos naming;
- compact plus/star row actions;
- clear `Inspecionar` action placement;
- Cesta → Balcão step language;
- consistent counts and empty states;
- mobile wrapping without hiding high-frequency actions.

Do not turn the normal shelf into another dashboard or add a persistent oversized cart panel.

### Phase 6 — Integration and release gates

Run focused suites after each vertical slice, then:

```bash
npm test
npm run build:pages
node --check public/app.js
node --check public/app-core.js
node --check public/vhs-3d.mjs
node --check public/immersive-shelf.mjs
node --check public/balcony.mjs
git diff --check
```

If Worker/database code changed:

- run Worker tests and migration/source-contract tests;
- bundle-check the Worker;
- deploy the private Worker and apply the forward migration only with explicit release approval;
- verify the exact public endpoint from an allowed origin;
- deploy the static frontend separately;
- perform a real signed-in browser playtest before calling the saved collections or rental loop live.

No push, Worker deployment, database migration, or production data change is implied by this plan.

## Manual acceptance checklist

### Browse and inspection

- Open a shelf tape, inspect it, close it, and remain on the shelf.
- Add it to Cesta; inspect from Cesta; close and return to Cesta.
- Open it from Assistir depois; close and return to Assistir depois.
- Open it from Favoritos; close and return to Favoritos.
- Open it from Balcão; close and return to Balcão with the decision intact.
- Open it from account active rentals and history; close and return to account.
- Rapidly switch between two titles and confirm no previous cover/logo/backdrop flashes onto the current tape.
- Block or fail artwork/metadata and confirm the branded placeholder remains usable.

### Saved collections

- Toggle Assistir depois on/off.
- Toggle Favorito on/off.
- Confirm both can be active on one title.
- Remove one membership and confirm the other remains.
- Refresh/reopen the personal shelf and confirm both memberships persist.
- Return a rented title as watched and confirm only Assistir depois completes/removes; Favorito remains.

### Cesta and rental loop

- Add candidates up to 15.
- Refuse the sixteenth without false success.
- Open Cesta and confirm it is clearly a review stop.
- Use `Levar ao Balcão` and confirm the Balcão decision is the next step.
- Narrow a large decision to 1–3 before `Alugar pacote`.
- Confirm a 4+ decision is preserved and explains why it cannot yet be rented.
- Rent 1–3 titles and confirm active rentals never exceed 3.
- Confirm a new rental is blocked until an active title is returned.

### Immersive shelf and Balcão

- Enter immersive mode and confirm the stand/banners/props are unchanged.
- Confirm the old wide top menu is gone as a visual obstruction, while every capability remains discoverable.
- Confirm the floating basket icon is visible, recognizable, keyboard accessible, and count-bearing.
- Collapse/reopen the compact secondary menu.
- Open Cesta from the icon, then enter Balcão through its CTA.
- Enter 3D Balcão and confirm its top overlay no longer dominates the scene.
- Confirm physical CRT search, decision plaque, return area, tip jar, and 3D tape inspection remain available.
- Verify the DOM fallback presents the same basket, saved actions, inspection, search, and Balcão actions.

### Responsive and accessibility

- Test desktop, tablet, and narrow phone widths.
- Confirm no high-frequency icon control is hidden by a broad mobile utility rule.
- Confirm visible focus, `aria-label`, `aria-pressed`, `aria-expanded`, and dialog focus restoration.
- Verify yellow backgrounds always use dark readable text in default, hover, focus, selected, pressed, and disabled states.
- Verify reduced-motion mode preserves state/content while removing decorative movement.

## Completion criteria

The sprint is complete only when:

- Cesta, Balcão, and active rental are visibly distinct and the next action is obvious.
- Immersive HUD/menu controls no longer dominate the scene, while no existing 3D scene content is removed.
- A floating basket icon is always available in immersive browsing.
- Assistir depois and Favoritos are independent, durable, visible, and future-stand-compatible.
- Every title source opens the same usable inspector and returns to its origin.
- Cesta/Balcão/account/history/fallback inspection works with minimal title data and failed artwork.
- The 3-active-rental invariant and server-side auth/data boundaries remain intact.
- Focused regressions, all 149+ existing tests, build, syntax checks, and diff checks pass.
- Manual browser acceptance is completed for both normal and immersive modes.
- Any Worker/database/static deployment is verified independently and reported separately.
