# Locadora Cesta, Balcão, Inspection, and Return UX Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make Cesta and Balcão clear, persistent 15-title decision spaces, apply the 1–3 cap only at final rental submission, make title/cover loading unambiguous, repair partial returns, and restore legibility on every yellow surface.

**Architecture:** The current `state.counter` serves two conflicting roles: persistent Cesta and final rental package. Retain its local-storage key for backward compatibility, but treat its contents as Cesta items (maximum 15); keep the Balcão’s review/decision state independently selectable up to the same 15-title limit. Only the final authenticated rental submission is capped at 1–3 titles because the server permits at most three active rentals. Rendering and Three.js asset loading will use a common branded placeholder state before every asynchronous cover request, rather than displaying the prior tape’s texture.

**Tech Stack:** Vanilla JavaScript, native dialogs, CSS, Three.js, Cloudflare Worker/Supabase rental API, Node built-in test runner.

---

## Product decisions locked by this plan

| Concern | Rule |
|---|---|
| Cesta | Up to 15 distinct titles. It persists locally across navigation, refresh, and sign-in changes, except the existing signed-out rental reset behavior. |
| Balcão review | Up to 15 distinct Cesta titles can be reviewed, kept, removed, or searched at the Balcão. It has no three-title selection cap. |
| Final rental submission | The only 1–3 cap. The final “Alugar” request must contain one to three titles because the server permits at most three active rentals. If a 4+ title Balcão review is presented for rent, keep the review intact and explain that the final rental must be narrowed before the request is sent. |
| Balcão entry | Opening the Balcão with an empty Cesta is valid. The user can use **Pesquisar título no Balcão** immediately. |
| Balcão choices | Arriving at the Balcão may show all Cesta titles. The user may keep/review/remove up to 15 there; no UI control disables or refuses a fourth choice. The one-to-three validation happens only when submitting the actual rental. |
| Successful rental | Only the titles actually rented leave Cesta. Other Cesta titles remain for later. The existing server-side maximum of three active rentals remains authoritative and unchanged. |
| Cesta feedback | Adding/removing a tape triggers a short, non-blocking confirmation with the tape title and count; it is announced through an `aria-live` status region. No new sound asset is required in this patch. |
| Cover loading | Every shelf/list/inspection cover starts as a branded Will’s Locadora placeholder. On a title switch, prior title imagery is cleared synchronously before a new asynchronous asset request can draw. |
| Package-confirmation inspection | A rented-item viewer always has a canonical TMDB ID, title/year/type, branded fallback, and a metadata hydration route. It must be inspectable even if a remote cover request fails. |
| Returns | Any checked subset of an active package may be returned: one, two, or three. Each selected item receives one authenticated return request; successful items disappear locally immediately, failed items remain selected for retry. |
| Yellow contrast | Every interactive yellow background uses dark ink text in base, hover, focus-visible, pressed/selected, and disabled states. White text is permitted only on non-yellow backgrounds. |

## Non-goals

- Do not change public API route syntax, Worker authentication, rental identity (`tmdb:<id>`), the three-active-rental server cap, or payment/tip behavior.
- Do not add audio files or promise sound confirmation.
- Do not delete historical rental data or alter Supabase production data as part of this UI patch.
- Do not push/deploy without explicit approval.

## State transition contract

```text
Cesta (0..15 persistent titles)
  ├─ add/remove from shelf, search, or inspection
  └─ open Balcão

Balcão review (0..15 temporary titles)
  ├─ may begin with all Cesta titles and may be changed without a three-title cap
  ├─ add/remove titles sourced from Cesta or Balcão search
  ├─ request rental
  │    ├─ 1..3 reviewed titles: submit to Worker
  │    ├─ 4..15 reviewed titles: retain review and prompt the user to narrow only the final rental
  │    ├─ Worker success: remove exactly submitted canonical keys from Cesta; clear submitted review
  │    └─ Worker failure/session change: retain Cesta and review unchanged
  └─ close/cancel: discard only the temporary review; retain Cesta

Active rental (server-authoritative, 1..3)
  └─ choose any non-empty return subset
       ├─ each successful return leaves active rental immediately
       └─ each failed return remains active and selected for retry
```

## Current-code findings

- `public/app-core.js:123-133` caps `updateRentalBasket()` at three; it must become a Cesta-only cap of 15.
- `public/app-core.js:141-152` currently normalizes both local counter and rented titles to three.
- `public/app.js:114-126` currently copies Cesta into the Balcão decision; that is valid for a 15-item review, but subsequent UI and request paths wrongly treat this review as the three-title rental payload.
- `public/app.js:882-904` clears all Cesta state after rental; it must remove only the successfully rented selection.
- `public/app.js:987-1124` already models individual checked returns, but needs targeted regressions and an end-to-end review to prove subset requests survive UI rerenders and partial outcomes.
- `public/vhs-3d.mjs:595-604` resets only the logo when switching tape; its previous poster/backdrop images remain visible until the next requests finish.
- `public/app.js:1005-1013` renders package-confirmation title rows via `accountTitleItem()`, which currently has no image/placeholder representation.
- `public/styles.css` has several yellow base and selected states. Some are already ink-on-yellow; the patch must audit every such selector rather than changing text colors globally.

---

### Task 1: Add core Cesta/package invariants and prove the current behavior fails

**Objective:** Separate the 15-item Cesta and 15-item Balcão review from the final 1–3 title authenticated rental request without changing Worker request rules.

**Files:**
- Modify: `public/app-core.js:93-194`
- Modify: `test/app-core.test.js:117-210`

**Step 1: Write failing tests**

Replace the old “basket never exceeds three” expectations with explicit tests:

```js
test('Cesta toggles distinct titles up to fifteen and preserves all valid persisted items', () => {
  const titles = Array.from({ length: 16 }, (_, index) => ({
    id: `tmdb:${index + 1}`, type: 'movie', name: `Tape ${index + 1}`,
  }));
  let cesta = [];
  for (const title of titles.slice(0, 15)) cesta = updateRentalBasket(cesta, title).titles;
  assert.equal(cesta.length, 15);
  assert.equal(updateRentalBasket(cesta, titles[15]).reason, 'full');
  assert.equal(updateRentalBasket(cesta, titles[0]).titles.length, 14);
});

test('a Balcão review can retain up to fifteen Cesta titles before a rental is attempted', () => {
  // Assert distinct canonical identity and add/remove behavior through fifteen titles.
});

test('only the final rental payload is restricted to one through three titles', () => {
  // Assert 4+ reviewed titles remain intact and are refused only at submission preparation.
});
```

**Step 2: Run focused test to verify failure**

Run: `node --test test/app-core.test.js`

Expected: FAIL because the old code slices/caps basket state at three.

**Step 3: Implement the minimal state helpers**

- Add named constants, e.g. `MAX_BASKET_TITLES = 15` and `MAX_RENTAL_TITLES = 3`, in `public/app-core.js`.
- Make `updateRentalBasket()` normalize and retain up to 15 Cesta items; preserve the `active_rental`, duplicate-toggle, invalid-title, and `full` result contract.
- Keep the old persisted `counter` key and object shape to avoid silently erasing users’ local Cestas; stop applying the three-title slice to it.
- Let temporary Balcão review state retain up to 15 valid Cesta titles; it must not refuse the fourth selected/reviewed tape.
- Keep only the final request builder/`validateRentalResponse()` at 1–3. A 4+ review must yield a clear pre-request validation result without truncating or mutating the review.

**Step 4: Run focused test to verify pass**

Run: `node --test test/app-core.test.js`

Expected: PASS with old rental serialization/response tests still enforcing one to three.

**Step 5: Commit**

```bash
git add public/app-core.js test/app-core.test.js
git commit -m "separate fifteen-title cesta from rental package"
```

### Task 2: Render a true Cesta and uncapped Balcão review

**Objective:** Make user-visible flow match the state contract: collect and review up to 15 in either Cesta or Balcão; enforce 1–3 only when the user submits the actual rental.

**Files:**
- Modify: `public/app.js:110-140, 831-916, 1057-1124, 1212-1264, 1288-1442`
- Modify: `public/index.html: rental-flow, basket-dialog, balcony-dialog`
- Modify: `test/app-core.test.js`
- Modify: `test/account-ui.test.mjs`
- Modify: `test/menu-layout.test.js` if its source contracts cover the rental controls

**Step 1: Write failing UI/source-contract tests**

Add assertions for:

- Cesta and Balcão review copy/count each present `x de 15` and never claim “Escolha até 3”.
- The Balcão accepts and retains a fourth reviewed title; no choice/review action is disabled because it would be the fourth title.
- An empty Balcão review has a usable search action, not an instruction that requires the user to return to Cesta.
- A 4+ title review reaches the final rental action intact, where it is refused with an explicit “Escolha de 1 a 3 fitas para alugar agora” message and no state loss.
- A 1–3 title final rental serializes the reviewed titles for the Worker request.
- On accepted rental response, the exact submitted canonical keys are removed from Cesta while all non-submitted review/Cesta titles remain.

**Step 2: Run targeted UI tests to verify failure**

Run: `node --test test/account-ui.test.mjs test/menu-layout.test.js test/app-core.test.js`

Expected: FAIL because current UI hard-caps the shared Cesta/Balcão array at three and sends it as the rental payload.

**Step 3: Implement the UI state transition**

- Treat `state.counter` as Cesta only. Keep its localStorage storage key for backward compatibility but rename internal variables/comments where this can be done without widening the patch.
- Let `beginCounterDecision()` copy/retain the Cesta’s up-to-15 title review. Neither entering Balcão nor adding/removing a review title may enforce a three-title cap.
- Render all review titles in the Balcão with clear “manter para alugar” / “tirar desta decisão” controls. The visible review count is `x de 15`, not `x de 3`.
- Keep “Não levar” semantics only for the temporary Balcão review; it must not remove the item from Cesta.
- Update Cesta dialog text, button labels, inspector action, counter badge, immersive badge, Balcão labels, and search result controls to show the 15-title capacity.
- In `rentCounter()`, do not mutate Cesta or the Balcão review before validating the final rental length. If the review has 4–15 titles, leave it intact and show the final-rental constraint. If it has 1–3, capture those exact keys, submit them, and after `validateRentalResponse()` succeeds in the initiating auth session, remove only those keys from Cesta and review.
- Preserve the existing rental identity interruption/resume behavior: after sign-in/profile completion, resume the same up-to-15 review; validate 1–3 only when the user presses the final rental action.

**Step 4: Run targeted tests to verify pass**

Run: `node --test test/app-core.test.js test/account-ui.test.mjs test/menu-layout.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add public/app.js public/index.html public/app-core.js test/app-core.test.js test/account-ui.test.mjs test/menu-layout.test.js
git commit -m "make cesta independent from balcony rental selection"
```

### Task 3: Make Balcão search available with an empty Cesta

**Objective:** Ensure a user can enter the Balcão and search for a title before selecting any shelf tape.

**Files:**
- Modify: `public/index.html: balcony-dialog`
- Modify: `public/app.js:371-410, 1016-1061, 1063-1124, 1325-1340`
- Modify: `public/balcony.mjs:116-135, 167-175`
- Modify: `public/tape-fallback.mjs` if its empty-state action is currently hidden or ambiguous
- Test: `test/menu-layout.test.js`
- Test: `test/account-ui.test.mjs`

**Step 1: Write failing tests**

Assert that the 2D Balcão control includes a consistently named `Pesquisar título no Balcão` action even when `capacity === 0`, and that the 3D Balcão’s CRT/keyboard remain interactive when both Cesta and package are empty.

**Step 2: Run focused tests to verify failure**

Run: `node --test test/menu-layout.test.js test/account-ui.test.mjs`

Expected: FAIL if source contracts still expose only the generic/conditional counter flow.

**Step 3: Implement the entry points**

- Keep the existing search dialog/API route; do not add a new catalogue endpoint.
- Give the empty-review panel a clear search call-to-action before the empty-state copy.
- Give the existing CRT/keyboard an accessible label that names its search capability, including empty-state instructions.
- On adding a search result, add it to Cesta first (subject to 15 cap), then include it in the up-to-15 Balcão review. Do not bypass Cesta, so Cesta remains the single browsing collection; enforce one-to-three only when the rental request is submitted.
- Preserve search results and focus when returning from inspection.

**Step 4: Run focused tests to verify pass**

Run: `node --test test/menu-layout.test.js test/account-ui.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add public/index.html public/app.js public/balcony.mjs public/tape-fallback.mjs test/menu-layout.test.js test/account-ui.test.mjs
git commit -m "keep balcony search available without cesta titles"
```

### Task 4: Add accessible Cesta add/remove confirmation

**Objective:** Make every Cesta mutation obvious without modal interruptions or ambiguous button-label-only feedback.

**Files:**
- Modify: `public/index.html: store shell status region`
- Modify: `public/app.js:831-869, 1127-1209, 1212-1255`
- Modify: `public/styles.css: add dedicated confirmation component styles`
- Test: `test/account-ui.test.mjs`

**Step 1: Write failing tests**

Assert a dedicated polite live region exists, receives an added/removed message containing the title and `x de 15`, and does not announce an addition for a capped or active-rental refusal.

**Step 2: Run focused test to verify failure**

Run: `node --test test/account-ui.test.mjs`

Expected: FAIL because feedback is currently spread between open dialog status paragraphs and does not name the title.

**Step 3: Implement a single confirmation presenter**

- Add one persistent `role="status" aria-live="polite"` element near the application shell, with an ID used by a small `announceBasketChange()` helper.
- On add: show a branded, non-modal toast such as `“The Matrix” entrou na Cesta · 4 de 15`.
- On removal: show `“The Matrix” saiu da Cesta · 3 de 15`.
- On max/active-rental refusal: show the actionable reason but never simulate success.
- Synchronize the title inspector action, header count, open Cesta list, Balcão panel, and immersive scene after the state update. Respect `prefers-reduced-motion` in the CSS animation.

**Step 4: Run focused test to verify pass**

Run: `node --test test/account-ui.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add public/index.html public/app.js public/styles.css test/account-ui.test.mjs
git commit -m "confirm cesta changes clearly"
```

### Task 5: Replace stale cover frames with a Will’s Locadora loading placeholder

**Objective:** Prevent previous tape art from appearing while inspection/shelf/list imagery updates, and provide a recognizable branded fallback when an image never loads.

**Files:**
- Create: `public/images/wills-locadora-cover-placeholder.svg`
- Modify: `public/app.js:514-570, 1127-1209, 1212-1249`
- Modify: `public/vhs-3d.mjs:119-168, 400-428, 595-605`
- Modify: `public/vhs-case.mjs:3-45`
- Modify: `public/tape-fallback.mjs` where it renders title images
- Modify: `public/styles.css: vhs/list placeholder loading treatment`
- Test: `test/account-ui.test.mjs`
- Test: create `test/vhs-placeholder.test.mjs` if the module needs pure/helper-level coverage

**Step 1: Write failing tests**

Cover these cases:

1. A shelf/list image uses the branded SVG as its initial `src`, then replaces it only after the requested cover loads.
2. `createVhsViewer().update()` clears `posterImage`, `backdropImage`, `logoImage`, and provider imagery before it schedules new loads.
3. A late response for tape A cannot repaint tape B after the user changes inspection quickly.
4. A rented title with only canonical TMDB ID/name/year/type produces a branded placeholder plus inspectable tape content, even when metadata or image loading fails.

**Step 2: Run focused tests to verify failure**

Run: `node --test test/account-ui.test.mjs test/vhs-placeholder.test.mjs`

Expected: FAIL because `vhs-3d.mjs` currently retains old poster/backdrop image objects on update.

**Step 3: Implement asset ownership and placeholder rendering**

- Create one local SVG with the exact Will’s Locadora visual identity and no remote dependency.
- Add a `coverRequestVersion`/asset generation value to the 3D viewer. Each update increments it, clears all prior image references synchronously, redraws branded placeholder front/back immediately, and applies a loaded texture only when its generation and URL still match the current tape.
- Do not use an old tape’s `posterImage` as the fallback for a new tape.
- Ensure `loadAsset()` handles an empty URL by explicitly retaining the branded placeholder rather than quietly returning with stale state.
- Use the same placeholder source in shelf cards, Cesta/Balcão rows, search rows, package confirmation rows, 3D case surfaces, and the dependency-free fallback.
- Keep real cover `error` handlers one-shot; a failed remote load must leave the local branded placeholder rather than loop.

**Step 4: Run focused tests to verify pass**

Run: `node --test test/account-ui.test.mjs test/vhs-placeholder.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add public/images/wills-locadora-cover-placeholder.svg public/app.js public/vhs-3d.mjs public/vhs-case.mjs public/tape-fallback.mjs public/styles.css test/account-ui.test.mjs test/vhs-placeholder.test.mjs
git commit -m "show locadora placeholders while covers load"
```

### Task 6: Make package-confirmation rentals inspectable and informative

**Objective:** Fix the “Pacote alugado” list so every title has cover/fallback, metadata path, and a reliable inspector entry point.

**Files:**
- Modify: `public/app.js:141-205, 1005-1013, 1127-1209`
- Modify: `public/vhs-3d.mjs`
- Test: `test/account-ui.test.mjs`
- Test: `test/locadora-data-worker.test.mjs` only if response mapping needs normalization coverage

**Step 1: Write failing tests**

Assert that a `localRentalTitle()` generated from the Worker’s minimal rental item:

- preserves `tmdb:<id>`, type, name, year, and rental item ID;
- renders a package-confirmation card with the branded cover placeholder and an `Inspecionar` action;
- calls `openTitle(memberTitleForViewer(title), true, placeholder-or-proxy-url)`;
- hydrates metadata and refreshes the existing viewer if/when it arrives;
- still exposes title and actions if metadata/image fetch fails.

**Step 2: Run focused tests to verify failure**

Run: `node --test test/account-ui.test.mjs test/locadora-data-worker.test.mjs`

Expected: FAIL because package-confirmation rows currently use a text-only account row and viewer asset replacement can retain/omit imagery.

**Step 3: Implement complete confirmation rows**

- Extend `accountTitleItem()` or add a dedicated package title renderer that includes an image initialized to the common local placeholder, title/year/type, and a clear inspection action.
- Keep Worker responses small and public-data-safe; do not add a user email or external secret to rental rows.
- Route every rented item through `memberTitleForViewer()` and existing metadata hydration; ensure `localRentalTitle()` normalizes snake_case and camelCase runtime shapes.
- Preserve the package-confirmation dialog’s deliberate one-action conclusion; inspection must open a nested title dialog without accidentally dismissing/committing the confirmation.

**Step 4: Run focused tests to verify pass**

Run: `node --test test/account-ui.test.mjs test/locadora-data-worker.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add public/app.js public/vhs-3d.mjs test/account-ui.test.mjs test/locadora-data-worker.test.mjs
git commit -m "make rented confirmation tapes inspectable"
```

### Task 7: Verify and repair partial-return behavior

**Objective:** Guarantee that selecting fewer than all active rental items returns exactly that subset, without clearing unselected tapes.

**Files:**
- Modify if needed: `public/app.js:929-993, 1063-1124`
- Modify if needed: `public/app-core.js:196-222`
- Test: `test/app-core.test.js`
- Test: `test/account-ui.test.mjs`
- Test: `test/locadora-data-worker.test.mjs`
- Test: `test/supabase-schema.test.mjs`
- Potentially create an additive migration only if SQL inspection/reproduction proves the currently deployed `return_rental_item` function is wrong; do not edit historic production migrations to fix live data.

**Step 1: Write explicit regressions before altering code**

Add tests that model a three-item active package and assert:

```js
const result = await submitRentalReturns([
  { itemId: 'item-1', watchedStatus: 'watched' },
], request);
assert.deepEqual(result.succeeded, ['item-1']);
// `item-2` and `item-3` must remain in the local active package.
```

Also test:

- Two selected items submit exactly two requests in display order.
- Checkbox state survives a return-button rerender.
- One success plus one Worker error removes only the success and keeps the failure checked/retryable.
- Worker repository calls `return_rental_item` once with the selected UUID; it neither accepts nor returns a whole package route.
- SQL return function updates one matching `rental_items` row and closes `rentals.returned_at` only when no active rows remain.

**Step 2: Run focused test to verify failure or identify test gap**

Run: `node --test test/app-core.test.js test/account-ui.test.mjs test/locadora-data-worker.test.mjs test/supabase-schema.test.mjs`

Expected: Existing mocks may pass; if so, use the test to document the expected boundary and inspect the live Worker/Supabase logs with one controlled user return attempt before changing SQL. Do not manufacture another migration without evidence.

**Step 3: Apply the narrow repair indicated by evidence**

- If client selection/state is at fault, preserve `pendingReturns` through the render cycle, capture the immutable selected entries at submit time, and maintain current session-version guards.
- If Worker response normalization is at fault, normalize the return RPC row shape at the Worker boundary.
- If the deployed SQL function is at fault, create one new timestamped additive repair migration that updates only `return_rental_item`; test qualified aliases and the one-item state transition. Do not rerun old base migrations.

**Step 4: Run focused tests to verify pass**

Run: `node --test test/app-core.test.js test/account-ui.test.mjs test/locadora-data-worker.test.mjs test/supabase-schema.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add public/app.js public/app-core.js workers/locadora-data/src/index.mjs supabase/migrations test/app-core.test.js test/account-ui.test.mjs test/locadora-data-worker.test.mjs test/supabase-schema.test.mjs
git commit -m "preserve partial rental returns"
```

Only include files actually changed. If a Supabase migration is needed, apply it separately in the Dashboard SQL Editor once and verify a selected one-item return afterward.

### Task 8: Audit yellow interactive states for black/ink text

**Objective:** Make every yellow button/control readable, including hover/focus/selected variants and 3D canvas labels where relevant.

**Files:**
- Modify: `public/styles.css: all yellow-background selectors`
- Modify if needed: `public/vhs-3d.mjs`, `public/balcony.mjs` for canvas-rendered yellow labels
- Test: create `test/color-contrast-contract.test.mjs` or extend `test/account-ui.test.mjs`

**Step 1: Write failing style/source tests**

Create a small source contract that inventories selectors using `var(--yellow)`, `#efcf55`, or equivalent yellow backgrounds and asserts their paired base/interactive text color is `var(--ink)`, `var(--black)`, or an equivalent dark value. Include:

- header Cesta button and count treatment;
- year/immersive Go controls;
- selected immersive controls and provider labels;
- scene inspection controls;
- Balcão/return/search buttons;
- title/Cesta/account actions;
- yellow rental-flow current state;
- mobile overrides.

**Step 2: Run test to verify failure**

Run: `node --test test/color-contrast-contract.test.mjs`

Expected: FAIL for the current selectors where a general `color: inherit` or later state rule leaves white text on a yellow background.

**Step 3: Implement audited CSS/canvas corrections**

- Add shared semantic tokens such as `--action-yellow-bg` and `--action-yellow-fg: var(--ink)` if they reduce repeated declarations.
- Correct only yellow-background surfaces; do not invert red, navy, or cream design elements globally.
- Check specificity/order so hover/focus/pressed styles do not restore white.
- Update canvas `labelTexture` / button calls only where a yellow fill currently pairs with a light label.

**Step 4: Run test to verify pass**

Run: `node --test test/color-contrast-contract.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add public/styles.css public/vhs-3d.mjs public/balcony.mjs test/color-contrast-contract.test.mjs
git commit -m "ensure dark text on yellow locadora controls"
```

### Task 9: Integrate, build, and perform controlled verification

**Objective:** Prove the combined state machine works across normal, immersive, Balcão, account, and fallback surfaces.

**Files:**
- Modify only any test/documentation files needed to cover gaps discovered during integration.
- Optional documentation update: `docs/balcony.md` if it currently claims Cesta is capped at three.

**Step 1: Run focused suites**

```bash
node --test test/app-core.test.js test/account-ui.test.mjs test/menu-layout.test.js test/locadora-data-worker.test.mjs test/supabase-schema.test.mjs test/vhs-placeholder.test.mjs test/color-contrast-contract.test.mjs
```

Expected: all pass.

**Step 2: Run canonical checks**

```bash
npm test
npm run build:pages
node --check public/app.js
node --check public/app-core.js
git diff --check
```

Expected: all pass with no whitespace errors.

**Step 3: Manual playtest checklist (user-owned browser verification)**

1. Add 15 distinct shelf/search titles; verify visible confirmation and `15/15`; attempt a sixteenth and confirm it is refused with no false success.
2. Open Cesta, then Balcão; confirm package begins `0/3` and Cesta items remain.
3. Enter Balcão with an empty Cesta; use **Pesquisar título no Balcão**, add a result to Cesta, then explicitly add it to the package.
4. Select 1–3 package titles from a larger Cesta; rent them; confirm only those titles leave Cesta and active rental contains only that subset.
5. In package confirmation, inspect every rented tape before/after metadata arrives; rapid-switch two tapes and confirm there is never a previous cover flash.
6. Block/lose a cover request and confirm the Will’s Locadora placeholder remains readable.
7. Rent three titles, select only one for return, choose its watched status, submit; verify precisely one title disappears and two stay active. Repeat with two selected titles.
8. Inspect yellow buttons in normal, mobile, immersive, 3D Balcão, dialogs, hover, keyboard focus, and disabled states; text must remain dark on yellow.

**Step 4: Document and commit the integration result**

- Update `docs/balcony.md` if it retains obsolete three-title-Cesta language.
- Remove any temporary debug logging or test-only browser instrumentation before commit.

```bash
git add docs/balcony.md test public workers supabase
git commit -m "verify cesta and balcony experience"
```

Use an exact file list rather than staging unrelated pre-existing changes.

---

## Risks and mitigations

- **Local persistence migration:** Existing users can have up to three old `counter` items. Keeping that key and widening normalization is backward compatible; do not rename/delete stored data in this patch.
- **Auth/session race during checkout/returns:** Preserve the existing `memberSessionVersion` checks before every mutation and before applying successful responses.
- **Stale Three.js asset callback:** Use generation tokens in addition to URL equality; the same URL can be requested in two different title updates and an old callback still must not repaint a newer title.
- **Cesta/Balcão-review drift:** Review state must validate that each title still exists in Cesta. When a Cesta item is removed, remove it from the temporary review too; when the Balcão closes, discard only temporary review state.
- **Return diagnosis uncertainty:** Client code already loops selected items. Do not assume the bug is SQL; reproduce with controlled selection and use Worker/Supabase evidence before shipping another repair migration.
- **Visual test limitations:** Source contracts protect regression-prone selectors, but final color verification needs the user’s manual browser playtest on real viewport/hover/focus states.

## Completion criteria

- Cesta holds up to 15 titles and communicates changes clearly.
- Balcão can search from zero Cesta titles and rents exactly 1–3 deliberately selected titles.
- Successful rental preserves unselected Cesta items.
- No prior tape cover flashes during inspection updates; every loading/error state uses Will’s Locadora placeholder art.
- Package-confirmation tapes are informative and inspectable.
- One- and two-item return subsets succeed without removing unselected rentals.
- Yellow interactive surfaces always use dark text.
- Focused tests, full `npm test`, Pages build, JS checks, and diff check pass.
