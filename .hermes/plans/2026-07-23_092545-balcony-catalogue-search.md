# Balcony Catalogue Search Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Let a visitor search the whole catalogue from a clickable CRT terminal on the Balcão, inspect a result as a normal VHS, and add it to the rental counter through the established flow.

**Architecture:** The Balcão CRT is the physical entry point; it opens a compact, accessible catalogue-terminal dialog instead of adding a second global search bar. A new read-only, bounded `GET /api/search?q=` contract searches only Stremio catalogues that advertise the `search` extra, across movies and series, then deduplicates normalized title records. The GitHub Pages frontend calls the existing configurable API base; the local server and deployed `workers/locadora-api` Worker expose the same response shape.

**Tech Stack:** Vanilla JS and native `<dialog>`, Three.js canvas interaction, existing Stremio catalogue sources, Node test runner, Cloudflare Worker.

---

## Product rules / acceptance criteria

- Search is whole-catalogue: it ignores the active shelf year, genre, type, provider, stand, and source filters.
- It is a title lookup, not a recommendation or playback claim.
- The CRT/keyboard is the only 3D entry point; fallback mode exposes an equivalent explicit “Search catalogue” control.
- Search results are capped (12 UI results; bounded upstream requests) and open the existing VHS title inspection. Adding/removing a result uses the existing counter action from that inspection.
- No account, write API, new dependency, secret, scraping, or Letterboxd/Stremio account integration is introduced.
- Empty, unavailable, and invalid-query states are explicit. A failed search must not clear the current rental counter or browsing state.

## API contract

`GET /api/search?q=<query>&locale=<pt-BR|en-US>`

- `q`: trim before validation; 2–80 Unicode characters after trimming.
- `locale`: optional, defaults to `pt-BR`; only `pt-BR` and `en-US` allowed.
- Success: `200 { "query": "matrix", "titles": [<normalized title>, ...] }`, max 12 unique items.
- Invalid input: `400 { "error": "Invalid catalogue search" }`.
- A healthy request with no matches: `200 { "query": "…", "titles": [] }`.
- If every compatible remote source fails: preserve existing upstream-failure behavior with a safe `502` error response; do not leak remote URLs or error detail.

## Task 1: Add the catalogue search primitive and tests

**Objective:** Search only catalogues that explicitly support Stremio’s `search` extra, normalize and deduplicate the results, and bound all fan-out.

**Files:**
- Modify: `src/catalogue.js:155-166, 267-291`
- Modify: `test/catalogue.test.js`

**Step 1: Write failing catalogue tests**

Add tests covering:

```js
const titles = await store.search({ query: 'matrix' });
assert.deepEqual(titles.map(({ id }) => id), ['tt0133093']);
```

Test fixtures must verify that:
- only `movie`/`series` catalogues whose declared `extras` include `search` are requested;
- the generated catalog URL contains an encoded `search=matrix` extra;
- results from sources/types are normalized through `normalizeTitle` and deduplicated through `deduplicateTitles`;
- a source that rejects does not fail a search if another source returns results;
- no compatible results plus all sources failing rejects with the existing safe upstream error;
- more than 12 normalized hits are sliced to 12.

**Step 2: Run the focused test to confirm it fails**

Run: `node --test test/catalogue.test.js`

Expected: FAIL because `CatalogueStore#search` does not exist.

**Step 3: Implement the minimal reusable helper**

In `src/catalogue.js`, add a narrow `fetchCatalogueSearch({ source, query, fetchImpl })` next to `fetchCatalogPages`:

- inspect `source.catalogs` for `type` `movie` or `series` and `catalog.extras.includes('search')`;
- call the existing `fetchCatalogPages` once per compatible catalogue with `{ search: query }` and `pageCount: 1`;
- normalize each returned meta using the same source ID path as shelf data;
- do not add a new raw fetch path or bypass `safeFetchJson`.

Add `CatalogueStore#search({ query })`:

- trim, validate 2–80 characters;
- use `Promise.allSettled` across the configured sources;
- flatten fulfilled results, `deduplicateTitles`, and return the first 12;
- throw only if there are no titles and at least one compatible remote request rejected.

**Step 4: Re-run focused tests**

Run: `node --test test/catalogue.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/catalogue.js test/catalogue.test.js
git commit -m "add catalogue search"
```

## Task 2: Expose the search endpoint in local Node development

**Objective:** Make local development use the same validated response contract as production.

**Files:**
- Modify: `src/server.js:93-106`
- Modify: `test/server.test.js`

**Step 1: Write failing route tests**

Create a stub `catalogue.search` and assert:

```js
const response = await fetch(`http://127.0.0.1:${port}/api/search?q=matrix&locale=en-US`);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { query: 'matrix', titles: [] });
```

Also assert `400` for one-character, blank, >80-character, and unsupported-locale input, plus `405` for a non-GET request.

**Step 2: Run red**

Run: `node --test test/server.test.js`

Expected: FAIL because `/api/search` is not routed.

**Step 3: Implement route validation**

Add the `GET /api/search` route before static fallback in `src/server.js`:

- trim `q` once;
- apply API-contract validation before calling the catalogue;
- call `catalogue.search({ query, locale })`;
- return only `{ query, titles }` with `sendJson`.

**Step 4: Run green**

Run: `node --test test/server.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/server.js test/server.test.js
git commit -m "serve catalogue search"
```

## Task 3: Mirror the contract in the deployed Worker

**Objective:** Ensure the production static site has the endpoint before the frontend points to it.

**Files:**
- Modify: `workers/locadora-api/src/index.mjs`
- Modify: or create worker tests using the current Worker test convention, after inspecting `workers/locadora-api/package.json` / scripts if present.
- Update: `workers/locadora-api/README.md` only if the route list is documented there.

**Step 1: Inspect the Worker’s existing shelf/title normalization helpers**

Reuse its safe public-fetch, CORS, catalog capability, and normalized-title utilities. Do not duplicate a second unsafe remote-fetch implementation.

**Step 2: Write a failing Worker route test**

Mock catalog manifests and catalog requests. Verify exact production CORS origin handling, query validation, encoded `search` extra, partial-source success, and a 12-result cap.

**Step 3: Implement `/api/search`**

Mirror the local contract exactly. Keep the search fan-out bounded to compatible catalogues and one page each. Preserve exact CORS allowlisting and no-secret/no-log policy.

**Step 4: Verify Worker tests and deployment build**

Run the Worker’s existing test/build commands. Do not deploy in this task.

**Step 5: Commit**

```bash
git add workers/locadora-api
git commit -m "add worker catalogue search"
```

## Task 4: Add the accessible Balcão terminal dialog

**Objective:** Give the physical CRT a keyboard-accessible search interface without changing normal browsing controls.

**Files:**
- Modify: `public/index.html` near the existing Balcão dialog markup
- Modify: `public/styles.css`
- Modify: `public/app.js:593-631`
- Modify: `public/i18n.js`
- Test: `test/menu-layout.test.js` (or a new narrow `test/balcony-search-layout.test.js` if this becomes clearer)

**Step 1: Write static-structure regression coverage**

Assert that the page includes:
- `#balcony-search-dialog` as a native dialog;
- a labelled search form/input with `autocomplete="off"`, minimum query length 2, and an accessible result status region;
- a close button and result container.

Assert that `app.js` owns one Balcão search function and uses the project `api()` helper, rather than direct hard-coded endpoint URLs.

**Step 2: Run red**

Run: `node --test test/menu-layout.test.js`

Expected: FAIL.

**Step 3: Implement minimal dialog behavior**

- Add localized UI strings for Portuguese and English: terminal name, placeholder, search action, initial prompt, searching, no matches, unavailable, and result count.
- Implement `openBalconySearch()` in `public/app.js`; it resets only the temporary query/result/status state and opens the dialog with focus in the input.
- On submit, trim and client-validate before request; call `api('/api/search?...')` using `URLSearchParams` and `AbortController`.
- Debounce input-triggered search by 250 ms only after 2 characters; cancel the previous request and ignore stale response tokens.
- Render at most the server-returned 12 compact result cards. A result click closes the terminal dialog and calls the existing `openTitle(title, true, posterTextureUrl(...))` path.
- Do not change `state.titles`, stand cache, provider filters, current counter, or remembered browse query.

**Step 4: Add terminal styling**

Use the established dark/cream/red/yellow visual language. Keep the dialog compact enough for mobile, with result cards as a scrollable list. The visual must identify itself as a CRT catalogue terminal, but native form controls must remain readable and touch accessible.

**Step 5: Run green**

Run: `node --test test/menu-layout.test.js && node --check public/app.js && git diff --check`

Expected: PASS.

**Step 6: Commit**

```bash
git add public/index.html public/styles.css public/app.js public/i18n.js test/menu-layout.test.js
git commit -m "add balcony search terminal"
```

## Task 5: Wire the physical CRT and fallback equivalent

**Objective:** Let visitors reach the same search dialog in 3D, via keyboard, and when Three.js fails.

**Files:**
- Modify: `public/balcony.mjs:100-111, 122-172`
- Modify: `public/tape-fallback.mjs`
- Modify: `public/app.js:593-628`
- Test: `test/balcony.test.js` if present; otherwise extend the focused Balcão/fallback test file.

**Step 1: Write failing interaction tests**

Cover that `createBalcony` accepts `onSearch`, marks both the CRT and keyboard with one `userData.action = 'search'`, and dispatches that callback from raycast activation. Assert keyboard `s`/`S` invokes the same callback only when the canvas owns focus and no dialog is open.

For fallback, assert an explicit `Search catalogue` control calls the same callback in addition to existing counter controls.

**Step 2: Run red**

Run the focused Balcão/fallback test command.

Expected: FAIL because neither renderer exposes `onSearch`.

**Step 3: Implement one canonical action path**

- Extend `createBalcony` with `onSearch`.
- Add the CRT group and keyboard group to `interactive` and assign the shared `search` action to their roots; keep the current customer-facing CRT orientation unchanged.
- In `activate`, dispatch `search` to `onSearch`.
- In `keyDown`, add `s` only as an additional Balcão shortcut; do not interfere with arrow tape selection, Enter, Escape, zoom, or focused plaques.
- Extend `createTapeFallback` with optional `onSearch`, producing a distinct search control; preserve `onAction` semantics.
- Pass `openBalconySearch` from both `mountBalcony` and `mountBalconyFallback` in `public/app.js`.

**Step 4: Run green**

Run the focused Balcão/fallback tests.

**Step 5: Commit**

```bash
git add public/balcony.mjs public/tape-fallback.mjs public/app.js test
 git commit -m "wire balcony catalogue search"
```

## Task 6: End-to-end verification and manual handoff

**Objective:** Prove no existing browse/rental behavior regressed and prepare production safely.

**Files:**
- Update: `TASKS.md` to list completed public catalogue search under browse foundation / polish.

**Step 1: Automated verification**

```bash
npm run test
npm run build:pages
git diff --check
```

Expected: entire suite and Pages build pass.

**Step 2: Production prerequisite**

Deploy the Worker search route first, then verify its `/api/search?q=matrix` response from the exact production Pages origin/CORS context. Do not point the public frontend at an endpoint that is not live.

**Step 3: User manual playtest**

The user verifies on desktop and mobile:
- enter Balcão → click CRT or keyboard → terminal opens and focus lands in input;
- `S` works when canvas is focused;
- `matrix` returns results without changing the current shelf;
- result → VHS inspection → add to counter → Balcão shows the selected tape;
- no-match, temporarily offline endpoint, dialog close/Escape, and Three.js fallback all behave honestly;
- normal browse filters and current rental state remain unchanged after closing the terminal.

**Step 4: Commit documentation only after test acceptance**

```bash
git add TASKS.md
git commit -m "document balcony search"
```

## Risks and boundaries

- Search availability depends on catalog add-ons advertising the Stremio `search` extra. Do not silently fabricate title matches or scrape IMDb/TMDB/Letterboxd. Sources without search support are skipped.
- Whole-catalogue search may return different coverage from a current shelf; that is intended and must be described only as a catalogue lookup.
- Do not add search history, saved searches, fuzzy reranking, type/provider/year filters within search, AI search, or a global header search in this phase.
- The existing public Worker must receive the endpoint before a frontend deploy. Local Node route parity is not evidence of production availability.
