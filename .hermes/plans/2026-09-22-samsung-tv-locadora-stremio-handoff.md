# Samsung TV Locadora: 2D browse and Stremio handoff

## Goal

Make the installed Samsung TV app the main Locadora browsing experience while keeping Stremio responsible for source selection, torrents, subtitles, and playback.

The user browses and rents titles in Locadora, signs in as the real Will or Diadorim account, and launches that title's profile in the already-installed Stremio TV app.

## Scope

### In scope

- Keep the TV app in the performant, remote-friendly 2D mode.
- Improve each shelf so it shows at least two rows of titles in one page.
- Add explicit previous/next shelf controls at the end of each shelf.
- Preserve genre, year, provider, search, and title inspection flows.
- Connect the TV app to the existing authenticated Locadora data Worker.
- Let Will and Diadorim sign in to their real accounts and see their existing account state.
- Keep each user's basket, active rentals, returns, saved collections, and profile data isolated by the server session.
- Add a prominent `Assistir no Stremio` action to title inspection.
- Launch the selected title using its public Stremio detail deep link.
- Restore Locadora's previous shelf and focus after returning from Stremio when the TV runtime allows it.
- Keep the existing normal accessible DOM shelf as the source of truth for TV navigation.

### Explicitly out of scope

- Rebuilding or embedding Stremio playback.
- Implementing torrents, debrid, stream resolution, or a Stremio add-on.
- Reading Stremio private files, sessions, tokens, settings, or account data.
- Recreating Stremio's subtitle or source-selection UI inside Locadora.
- Replacing the installed Stremio TV app.
- Making 3D mode a requirement for the TV experience.
- Changing the public web app or public Worker contract unless a separately approved need appears.

## Current baseline

- The Samsung package is under `tv/samsung/`.
- The TV app already has a 2D shelf, title inspection, local guest rental state, installed-app discovery, and a Stremio launch path.
- The private `locadora-data` Worker already exposes Better Auth sign-in and authenticated state, rental, collection, and return endpoints.
- The public web frontend already contains a bearer-token account client that can guide the TV implementation.
- Stremio handoff currently uses a `stremio:///detail/movie/...` or `stremio:///detail/series/...` URI.
- The TV runtime already attempts to launch the installed Stremio application through Tizen application control.
- The current flat shelf is limited to a smaller page size than the public catalogue and needs a denser two-row layout.
- 3D remains an enhancement/fallback option, not the primary TV workflow.

## Implementation phases

### 1. Confirm the TV information architecture

- Make the 2D shelf the default TV presentation.
- Keep the existing title detail dialog and focus model.
- Define the shelf page as a bounded set of titles, preferably four rows of ten cards when the device can render it reliably, with two rows as the minimum acceptable layout.
- Keep each shelf's navigation controls reachable by the remote without requiring the user to wrap through every card.
- Ensure Samsung Back closes the current dialog or returns to the previous shelf state before exiting the app.

### 2. Improve shelf pagination and navigation

- Increase the TV catalogue page size to fill the intended two-row-or-more layout.
- Keep catalogue requests bounded by the Worker contract.
- Add a final `Prateleira anterior`/`Próxima prateleira` action to every shelf.
- Move focus from the last title to the shelf navigation controls in a predictable order.
- Preserve the current shelf, page, and focused title when opening title inspection or leaving for Stremio.
- Handle empty and partially filled pages without leaving unreachable focus targets.

### 3. Connect the TV app to real Locadora accounts without TV password entry

- Add a short-lived pairing-code handshake for the TV.
- The TV displays a code; a member already signed in to the web Carteirinha authorizes that code.
- The TV stores only a revocable paired-device bearer token, never either user's password.
- On each launch, show the two fixed slots, `Will` and `Diadorim`, and let the user choose one.
- Make switching users require choosing the other stored authorization, not entering a password.
- On account selection, load `/v1/state` and replace the TV's local rental snapshot with the account's server state.
- Send rental and return actions to the authenticated `locadora-data` Worker rather than `guest-rental.mjs`.
- Show the signed-in username in the TV header/menu.
- Keep anonymous catalogue browsing available when nobody is signed in.
- Decide whether the basket is temporary local UI state or synchronized server state; initially keep only the confirmed rental server-owned.
- Add a TV-specific exact CORS origin/handling path if packaged Tizen requests do not present one of the existing allowed origins. Never use wildcard or reflected CORS.
- Keep the existing guest state only as a migration/fallback path until authenticated rental behavior is proven.

### 4. Make Stremio title handoff reliable

- Keep `Assistir no Stremio` as a Locadora action, not an embedded player.
- Before launching, ensure the title has a usable IMDb identifier and the correct `movie` or `series` type.
- If the title is not fully hydrated, load the required metadata before creating the URI.
- Use the existing Samsung runtime application-control path to launch Stremio.
- Report a clear in-app error when the title lacks the required identifier or Stremio cannot be found.
- Do not claim that the title is playable, available through a particular add-on, or included in any subscription merely because the handoff succeeds.
- Preserve the title and shelf context for resume when the TV returns to Locadora.

### 5. Remove confusing TV-only actions

- Keep provider availability filters as discovery filters and informational metadata.
- Avoid presenting provider links as alternative playback paths in the TV title dialog unless separately needed.
- Keep the Stremio action visually primary for this private TV workflow.
- Remove or hide unfinished 3D-only controls from the normal TV path while leaving the underlying web/immersive implementation untouched.

## Likely files

- `tv/samsung/src/app.mjs`
  - 2D page sizing, shelf controls, profile selection, title hydration, and Stremio handoff state.
- `tv/samsung/src/guest-rental.mjs`
  - profile-namespaced local rental state and migration behavior.
- `tv/samsung/src/samsung-runtime.mjs`
  - only if launch/resume behavior needs a focused reliability change.
- `tv/samsung/index.html`
  - profile controls, shelf navigation labels, and title-dialog action labels.
- `tv/samsung/tv.css`
  - two-row-or-more card layout, focus order visibility, and remote-readable controls.
- `test/tv-guest-rental.test.mjs`
  - profile isolation, migration, and persistence cases.
- `test/tv-samsung-runtime.test.mjs`
  - Stremio URI normalization, app discovery, launch fallback, and resume cases.
- TV-specific build/test files only when the implementation changes their contracts.

## Verification

### Static and automated

- Run the relevant TV unit tests.
- Run `npm test`.
- Run `npm run build:pages` for application-level changes.
- Build the Samsung package and verify its size and manifest privileges.
- Check that the TV bundle remains compatible with its current Tizen/Chromium target.
- Verify no public Worker, TMDB secret, Stremio token, or playback implementation is added.

### Manual TV acceptance

- Both profiles can browse without seeing or modifying the other's basket or rentals.
- Each shelf presents at least two usable rows of titles.
- Previous/next shelf controls are reachable and usable with the remote.
- Title inspection opens and closes correctly with Enter and Back.
- Selecting `Assistir no Stremio` opens the matching movie or series profile in the installed Stremio TV app.
- Returning to Locadora restores the previous shelf/title context when supported by the TV runtime.
- A missing IMDb identifier or unavailable Stremio app produces a clear failure state rather than silently doing nothing.
- Local rental state survives app restart.
- 3D performance is no longer required for the core experience.

## Effort assessment

This is a medium-sized integration, not a backend rebuild. The database and authenticated Worker routes already exist; the TV app currently lacks the login UI, bearer-token client, authenticated state hydration, and authenticated rental/return wiring. The main TV-specific risk is remote-friendly login plus exact CORS behavior for a packaged Tizen origin.

The first useful slice is small: pair both TV slots once, choose an account, load its state, display the active rental, and open Stremio for catalogue titles. Rental writes and returns can follow once session persistence is verified.

## Delivery order

1. Add TV authentication and verify Will/Diadorim account state loading.
2. Improve 2D shelf density and end-of-shelf navigation.
3. Wire authenticated rentals and returns, preserving server limits and history.
4. Harden Stremio title hydration, URI creation, launch failure, and resume behavior.
5. Simplify the title dialog around the Locadora-to-Stremio handoff.
6. Build the TV package and perform the focused real-TV acceptance pass.

No Worker deployment, public web change, commit, or push is implied by this plan.
