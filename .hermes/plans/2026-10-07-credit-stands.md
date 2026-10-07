# Credit stands (2D first) — implementation plan

**Goal:** click a person's name on a title (director, writer, actor — later DP, editor, VFX),
open a plain 2D window listing that person's titles, and turn it into a store stand ("estante")
in 2D and 3D.

**Architecture:** the filmography comes from TMDB `/person/{id}/combined_credits` and is a new
*shelf source* on top of the existing shelf pipeline — not a new renderer. The Worker owns all
TMDB access (secret boundary unchanged), the local Node bridge mirrors the endpoints for dev,
and `loadShelf()` gains one branch so pagination, skeletons, stand cache and the 3D tape rack
work unchanged.

**Approved defaults (owner):** credit stands ignore the store year by default (toggle to respect
it); clickable roles = the three already on screen (Direção, Roteiro, Elenco top-10), then
department rows; inspector-first entry (no global person search); an empty credit stand offers
"ver todos os streamings" inline.

**Scope boundary:** metadata only. No player, torrent/debrid, stream resolution, Stremio add-on
or private Stremio data. Website first; the Tauri desktop app is a later migration.

**Repo facts this plan builds on**

- Worker: `workers/locadora-api/src/index.mjs` — `shelf()` (discover-based, `MAX_TITLES = 40`),
  `titleMeta()` (already fetches `append_to_response=credits,...` and keeps only *names*),
  `edgeCached(url, params, policy, ctx, load)`, `browserAndEdgeCache()`, `mapWithConcurrency`,
  `json()`, `isBlocked()`, `cors()`.
- Local bridge: `server.js` → `src/server.js` (`/api/*` routes, validation mirrored from the
  Worker) → `src/catalogue.js` (`CatalogueStore`) → `src/tmdb.js` (TMDB client used today only
  for provider discover + `enrich`).
- Frontend: `public/app.js` (state, `loadShelf()`, `renderShelf()`, `refreshImmersive()`,
  `wireEvents()`, `renderSkeletons()`), `public/index.html` (panel dialogs; catalogue search is
  the pattern to copy), `public/styles.css`, `public/i18n.js` (PT then EN `COPY`),
  `public/vhs-3d.mjs` (tape inspector, credits block at ~line 285), `public/api-config.js`
  (maps `/api/*` → Worker `/v1/*` in production).

---

## Frozen contract (do not invent new shapes; report instead)

### 1. `GET /v1/person?id=<tmdbPersonId>&locale=pt-BR|en-US`

```json
{
  "person": {
    "id": "138",
    "name": "Quentin Tarantino",
    "profile": "https://image.tmdb.org/t/p/w185/1gjcpAa99VA4gXpNbVjF8yd1Ztp.jpg",
    "knownFor": "Directing",
    "roles": [ { "department": "Directing", "job": "Director", "count": 12 } ]
  }
}
```

- `roles` = allowlisted departments/jobs derived from `combined_credits`, `count` = credits for
  that department+job; sorted `count` desc, then `department` asc, then `job` asc.
- Allowlisted departments: `Acting`, `Directing`, `Writing`, `Camera`, `Editing`,
  `Visual Effects`, `Sound`, `Art`, `Production`, `Music`, `Costume & Make-Up`, `Lighting`.
- Empty `profile` when TMDB has none. Invalid `id`/`locale` → 400. `cache-control:
  public, max-age=86400, s-maxage=604800, stale-if-error=604800`, edge key params
  `['id', 'locale', '_policy']`.

### 2. `GET /v1/credit-stand?person&department&job&type&year&ignoreStoreYear&providers&stand&locale`

```json
{
  "person": { "id": "138", "name": "Quentin Tarantino", "department": "Directing",
              "job": "Director", "total": 12, "profile": "..." },
  "titles": [ { "id": "tmdb:680", "imdbId": "tt0110912", "type": "movie", "name": "Pulp Fiction",
                "year": 1994, "poster": "...", "background": "...", "description": "...",
                "imdbRating": "8.5", "genres": ["Crime"], "director": [], "writer": [],
                "cast": [], "source": "tmdb-person",
                "availabilityBR": { "link": "", "providers": [], "subscriptionProviders": [] } } ],
  "hasNextStand": false,
  "person": { "id": "138", "name": "Quentin Tarantino", "department": "Directing", "job": "Director", "total": 12 },
  "year": 1999, "ignoreStoreYear": true, "providers": [], "stand": 0
}
```

Rules:

1. Source: `combined_credits` (movie + tv), cached at the edge per person (7d).
2. Filter `department` exactly; when `job` is non-empty also filter `job` exactly.
   For `department=Acting`, drop credits whose `character` is `Self`, `Himself`, `Herself`, or
   starts with `Self ` / `Self-` (talk shows, documentaries "as himself").
3. Dedupe by `type:tmdbId` keeping the entry with the higher `vote_count`.
4. Sort: `vote_count` desc, `popularity` desc, release date desc, id asc.
5. Page size 40, but the stand examines a **bounded window of credits** per request: 40 candidates
   when each costs one TMDB lookup (IMDb id) and 20 when a provider filter adds a second (BR
   availability) — 41 subrequests total, inside the Workers free-plan cap of 50 that the discover
   shelf already spends 42 of. A provider-filtered stand may therefore return fewer than 40 titles;
   `hasNextStand` = more credits remain beyond the window. (Amendment after Phase A.)
6. `type=movie|series|all` (default `movie`); normalize each title's `type` to `movie`/`series`.
7. Year window only when `ignoreStoreYear=false`, mirroring `shelf()`:
   `(providers.length ? year - 19 : year - 4) … year`.
8. `providers` non-empty → keep only titles with BR `flatrate` availability on ≥1 requested
   provider, and fill `availabilityBR.providers` / `subscriptionProviders` with the matching
   canonical provider names (same as `shelf()`). Availability lookups go through ONE cached
   helper shared with `titleMeta()` (edge TTL 7d, key includes `type`, `tmdbId`, `_policy`).
9. Titles failing `isBlocked()` are dropped; titles without a real `tt` imdb id are dropped
   (same rule as `shelf()`).
10. `total` = filmography size after rules 2-3, before provider/year filtering (caption text).
11. Validation identical in spirit to `validShelf()`; failure → 400
    `{ "error": "Invalid credit stand filters" }`.
12. `cache-control: public, max-age=3600, s-maxage=86400, stale-if-error=604800`; edge key
    params `['person','department','job','type','year','ignoreStoreYear','providers','stand','locale']`.

### 3. `/v1/title` — additive credits with ids (backward compatible)

Keep `director` / `writer` / `cast` (name arrays) exactly as they are; add:

```json
"credits": {
  "director": [ { "id": "138", "name": "Quentin Tarantino" } ],
  "writer":   [ { "id": "138", "name": "Quentin Tarantino" } ],
  "cast":     [ { "id": "2231", "name": "Samuel L. Jackson", "character": "Jules Winnfield" } ],
  "crew":     [ { "id": "1000787", "name": "Sally Menke", "department": "Editing", "job": "Editor" } ]
}
```

`cast` = top 10 by TMDB order (unchanged); `crew` = allowlisted departments, deduped by
`id` + `job`, capped at 24.

### 4. Local dev parity (dev only, documented as such)

`src/tmdb.js` gains `personProfile(id, locale)` and `personCreditStand(options)`.
`src/server.js` adds `GET /api/person` and `GET /api/credit-stand` with the same validation and
payloads, TMDB-backed (no Stremio source intersection — the legacy local catalogue is not
extended). Header comment must say this is public-API dev parity.

---

## Tasks

### Phase A — Worker data layer (owner: subagent A)

**A1. Test-first: person endpoint** — `test/locadora-worker.test.mjs`
- Cases: valid id returns `person.roles` filtered to the allowlist, sorted by count desc; invalid
  id/locale → 400; upstream failure → 502-ish public error; response `cache-control` includes
  `max-age=86400` and `s-maxage=604800`; CORS origin rules still applied.
- Run: `npm test -- test/locadora-worker.test.mjs` (or `node --test test/locadora-worker.test.mjs`). Expect FAIL.

**A2. Implement `person()` + route** — `workers/locadora-api/src/index.mjs`
- `async function person({ id, locale }, env, fetchImpl)` → fetch `/person/{id}?append_to_response=combined_credits`
  once (single TMDB call), build `roles` from `combined_credits.cast/crew`.
- Route `/v1/person` via `edgeCached(url, ['id', 'locale'], ...)`.
- Run A1 again. Expect PASS.

**A3. Test-first: credit stand** — `test/locadora-worker.test.mjs`
- Cases: department filter; `job` refinement; Self-credit exclusion; dedupe; sort order; paging
  (`stand=0` vs `stand=1`, `hasNextStand`); year window on/off; provider intersection keeps only
  available titles and fills provider names; blocked policy title dropped; missing imdb id
  dropped; invalid params → 400.
- Expect FAIL before A4.

**A4. Implement `creditStand()` + route + shared availability helper**
- Extract the BR-flatrate lookup into `brAvailability(tmdbType, tmdbId, env, fetchImpl, ctx)`
  used by both `titleMeta()` and `creditStand()`, edge-cached 7d.
- Route `/v1/credit-stand` with the edge key params from the contract.
- Expect PASS.

**A5. Extend `titleMeta()` with `credits` (ids + crew)** — same file; add tests to
  `test/locadora-worker.test.mjs` (ids present, `cast` length ≤ 10, `crew` allowlisted + capped,
  old name arrays unchanged).

**A6. Local parity** — `src/tmdb.js`, `src/server.js`, tests in `test/catalogue.test.js`
  (or a new `test/local-credit-stand.test.js`): validation + shape for both routes, TMDB client
  stubbed.

### Phase B — Frontend 2D-first (owner: subagent B)

**B1. Test-first: markup + wiring** — extend `test/menu-layout.test.js` (or new
`test/credit-stand.test.js`)
- Assert: `#person-dialog` markup exists with `data-i18n` labels; `app.js` has
  `openPerson(`, `applyCreditStand(`, `backToAisle(`, `state.credit`; `loadShelf` branches on
  `state.credit` and requests `/api/credit-stand`; i18n has the new keys in **both** locales.
- Expect FAIL.

**B2. Person dialog** — `public/index.html` (new `#person-dialog` panel-dialog, modelled on
`#catalog-search-dialog`), `public/styles.css`, `public/app.js`
- Renders profile photo (through `window.locadoraPosterUrl`), name, role chips from
  `person.roles`, filmography list from `/api/credit-stand` (stand 0, `ignoreStoreYear=true`),
  and `Ver como estante` / `Fechar`.

**B3. Clickable credits** — `public/vhs-3d.mjs` (inspector credits block) + the 2D title view
(whichever module renders credits in 2D; add one if missing)
- Each name becomes `button.credit-link[data-person-id][data-department][data-job]`; wire clicks
  to `openPerson()`. If `meta.credits` is absent, render the current plain-text names (graceful
  degrade for cached/older payloads).

**B4. Shelf source** — `public/app.js`
- `state.credit = { id, name, department, job, profile, allProviders } | null`.
- `loadShelf()` builds `{person, department, job, type: state.type, year, ignoreStoreYear, providers, stand}`
  and calls `/api/credit-stand` when `state.credit` is set; everything else (skeletons, stand
  cache, `hasNextStand`, `refreshImmersive`, `hydrateTapeLogos`) unchanged.
- Caption/title: `Estante: <name> · <role label>`; `Voltar ao corredor` clears `state.credit` and
  reloads the genre shelf; the year picker still applies via Ir.

**B5. Empty + i18n** — `public/app.js`, `public/i18n.js`
- Empty credit stand → `creditStandEmpty` copy + `seeAllStreamings` button that flips
  `state.credit.allProviders = true` (sends `providers=` for the credit stand only; never writes
  the saved provider preference) and reloads.
- PT/EN keys: `viewAsStand`, `creditStand`, `backToAisle`, `creditsOf`, `creditStandEmpty`,
  `seeAllStreamings`, and department labels (pt: Direção, Elenco, Roteiro, Fotografia, Montagem,
  Efeitos visuais, Som, Arte, Produção, Música, Figurino e maquiagem, Iluminação).

**B6. 3D pass-through check** — confirm the credit stand shows as tapes in 3D without new code
(loading label + stand label from the shelf label helper); fix only what breaks.

### Phase C — Docs + verification (owner: orchestrator)

**C1.** Short "Credit stands" section in `MVP_PUBLIC_PRODUCT_AND_ARCHITECTURE.md` (source, ids,
caching, boundaries).
**C2.** `npm test` (full suite) + `npm run build:pages`.
**C3.** Local smoke: `npm start` (needs `TMDB_API_KEY` in `.env`) →
`curl -s "http://127.0.0.1:4173/api/person?id=138"` and a credit-stand curl with real titles.
**C4.** Commit only this task's hunks (the tree also holds unrelated TV-pairing WIP in
`public/app.js`, `public/index.html`, `public/styles.css`, `public/vhs-3d.mjs`,
`workers/locadora-api/wrangler.toml` — stage hunks selectively, never the WIP).
**C5.** Worker deploy + live check — **ask the owner first**: `wrangler.toml` has uncommitted
changes, so `npx wrangler deploy` would ship them.

## Addendum: credits live on the tape cover, the panel becomes the deep view

Owner decision (after the first pass): the credit names **on the tape cover** must be clickable,
and the floating credits panel becomes an **on-demand deep listing** opened from a `[mais]`/`[more]`
affordance at the end of the cast row.

- 3D (`public/vhs-3d.mjs`): `drawBack` draws each credit name as its own run (same metrics as today:
  names from x=242, maxWidth 710, lineHeight 27, 2 lines per group, caps 4/4/10) and records a
  texture-space rect per name in a `creditRegions` array plus a rect for the `[mais]` chip after the
  cast row. `clickableActions()` includes those rects (pointer cursor), the click router calls
  `onCreditPerson(entry)` / `onMoreCredits()`, and `doubleClick` treats them as clickable (no flip).
  Clickable names get a 1px cream underline at ~.45 alpha; the chip is yellow. Without `title.credits`
  (cached payload) a group falls back to today's plain joined string with no rects.
- Flat (`public/vhs-flat.mjs`): the DIREÇÃO/ROTEIRO/ELENCO values render as `button.credit-link` chips
  when `title.credits` carries the group, plus a `[mais]` button; same two callbacks.
- Frozen viewer contract: `onCreditPerson({ id, name, department, job })` and `onMoreCredits()` on both
  `createVhsViewer` and `createFlatVhsViewer`; the entry shape is exactly what `openPerson()` consumes.
  Tape rows map to `{department:'Directing', job:'Director'}`, `{department:'Writing', job:'Writer'}`,
  `{department:'Acting', job:'Acting'}`.
- Panel (`public/app.js`): `renderTitleCredits` gains the deep mode — full cast (≤20) plus crew
  department groups from `meta.credits.crew`, labelled with `DEPARTMENT_LABEL_KEYS` — and renders
  hidden; `toggleTitleCreditsPanel()` (wired to `onMoreCredits`) shows/hides it. `syncTitleCredits`
  no longer auto-shows it.
- i18n: `moreCredits` (pt "mais" / en "more") and `creditsPanelTitle` (pt "Ficha técnica" / en
  "Credits") in both locales.
- Tests: 3D per-name rects + callbacks wired; panel hidden by default, toggled by the callback, deep
  groups include crew departments; flat chips + `[mais]`.
- Known limit: `credits.crew` is capped at 24 entries per title by the Worker, so the deep panel is
  truncated for very large crews (v1).

## Addendum 2: sort every stand by year or rating

Owner request: a "sort by" control that applies to every stand — genre aisles and person stands.

- One global preference `state.sort` in `localStorage['locadora.sort']`, values `relevance`
  (default, today's behaviour), `year` (newest first) and `rating` (highest IMDb/TMDB score first),
  echoed in the shelf caption and sent on every shelf request.
- Worker + local bridge: `/v1/shelf` maps `sort` to TMDB `sort_by`
  (`relevance` -> `popularity.desc`, `year` -> `primary_release_date.desc` / `first_air_date.desc`,
  `rating` -> `vote_average.desc` **with a `vote_count.gte` floor** so 10-vote titles do not win);
  `/v1/credit-stand` re-orders the filmography (`relevance` -> today's vote_count/popularity order,
  `year` -> release date desc, `rating` -> vote_average desc) **before** the candidate window is
  sliced, so paging stays monotone. Unknown `sort` -> 400 on the Worker, defaulted locally.
- UI: a `#sort-select` in the 2D browse menu (applied by Ir like genre/year, never on its own) and a
  third field in the 3D plaque editor (`immersive-shelf.mjs` field list + `plaqueOptions.sortChoices`
  + the drawn plaque text), both wired to the same `setSort()`; changing it leaves a credit stand the
  same way genre/year do, and it persists.
- i18n: `sort`, `sortRelevance`, `sortYear`, `sortRating` in both locales.
- Tests: worker (each `sort` maps to the right `sort_by`/order and `rating` sets the vote floor;
  invalid -> 400), local bridge mirror, and UI (control present, `setSort` persists + reloads, the
  credit-stand path sends `sort`).

## Risks / open questions

- Ranking by `vote_count` can surface obscure late work for A-list people; acceptable for v1.
- Provider intersection costs one TMDB call per candidate title (edge-cached 7d, concurrency 4).
  If a stand feels slow on first view, cap the candidate pool at the top 60 by `vote_count`
  before availability checks.
- `type=all` mixes movies and series while the store shelf is movie-only today; default to movie.
- Acting credits include TV guest spots; the Self filter helps, billing order (`order`) is a
  later refinement.
- Crew depth (department rows: Camera, Editing, Visual Effects) is deliberately a second pass —
  the contract already carries `department`/`job`, so it is additive.
