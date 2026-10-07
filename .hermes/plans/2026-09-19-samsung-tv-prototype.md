# Samsung TV Locadora Prototype

## Summary

Build a dedicated Samsung Tizen 5.5 `.wgt` from the existing vanilla-JS Locadora—no React rewrite. It will target the current UN40T5300 on firmware 2740.1 and provide:

- Live public catalogue, search, year/genre/provider filters.
- 3D shelf and VHS inspection, with the existing 2D fallback.
- Remote-control navigation throughout.
- Anonymous Cesta → Balcão → rental → return ritual stored locally.
- Netflix, Prime Video, and Stremio handoff: exact title first, provider home fallback.
- Compact, opt-in audio: ambience plus `night-drive`.
- No login, account, saved lists, review writing, admin, or donation UI.

## Implementation Changes

### Tizen packaging and compatibility

- Add a dedicated Samsung TV project and `build:tv` pipeline producing an ignored `dist-tv/` directory and signed `.wgt`.
- Target Chromium 69 through an esbuild compatibility bundle and polyfills for unsupported APIs such as `replaceChildren`, `queueMicrotask`, and `AbortSignal.timeout`.
- Keep web Three.js unchanged. Bundle an exact TV-only `three@0.162.0`, preserving WebGL 1 fallback; Three.js releases after r162 require WebGL 2. [Three.js migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide/fdd462714b9bfe03722078bd769654dcfc979e26)
- Provide TV-specific CSS for 1920×1080, ten-foot text, visible focus rings, and replacements for unsupported selectors such as `:has()`.
- Configure Tizen 5.5 fullscreen mode, internet access, application discovery/launch privileges, and exact network access to the public Locadora Worker. Certificates and Samsung credentials stay outside Git.

### Runtime and state interfaces

- Introduce `window.LocadoraRuntime`, defaulting to web behavior when absent. The TV implementation exposes:
  - `target: "samsung-tv"`
  - capability flags disabling authentication, saved collections, admin, reviews, and donations;
  - remote Back handling;
  - installed-app discovery;
  - `openProvider({ providerId, exactUrl, stremioUri })`.
- Provider launch returns one of `exact`, `app_home`, `browser`, or `unavailable`, allowing the UI to report the actual outcome.
- Store guest state under a versioned `locadora.tv.guestRental.v1` key:
  - Cesta: up to 15 distinct titles.
  - Balcão decision: up to 3 titles.
  - One active local rental.
  - Returned titles with `watched`, `not_watched`, or `unknown`.
- Persist the current shelf, focused tape, open inspector, and rental state before leaving for another app; restore them when Locadora resumes.

### TV interaction and 3D behavior

- Start directly in immersive mode after a short loading state.
- Use arrows for spatial movement, Enter for activation, and Samsung Back/keycode `10009` as a real navigation stack:
  - close panel;
  - close title inspection;
  - leave Balcão;
  - return from 2D to 3D;
  - exit only from the root shelf.
- Connect shelf boundary movement to the TV action rail and stand navigation instead of trapping focus at the first or last tape.
- Search uses Samsung’s on-screen keyboard. Filters and audio controls remain ordinary focusable DOM overlays above the 3D scene.
- Preserve the existing procedural room and VHS models with an adaptive profile:
  1. Start at pixel ratio 1, limited antialiasing, and reduced shadows.
  2. Keep all 40 tapes if sustained performance remains at least 24 fps.
  3. If performance falls below that threshold, remove shadows/poster decoration and split the stand into two accessible 20-tape pages.
  4. On renderer/context failure, enter the existing remote-navigable 2D shelf and flat front/back inspector.
- Audio remains silent by default and activates only after a remote interaction.

### Catalogue and provider handoff

- First test the packaged app against `/v1/health`; Samsung requires internet privilege and explicit external-server access. [Samsung network configuration](https://developer.samsung.com/smarttv/develop/faq/networking-and-connectivity.html)
- If Tizen sends no `Origin`, use the Worker unchanged. If it sends opaque `Origin: null`, add a route-limited `/v1/tv/*` read-only facade that returns the fixed `Access-Control-Allow-Origin: null`; it must expose only the existing public GET catalogue/image/watch-link operations, retain rate limits, and never reach private/admin routes.
- Discover installed applications using Tizen APIs, supplemented by the already observed Netflix and Stremio IDs; discover Prime rather than guessing its ID.
- Handoff order:
  1. Try `launchAppControl` with the exact provider URL or existing Stremio detail URI.
  2. If rejected, launch the installed provider app home.
  3. If no provider app exists and an HTTPS URL exists, use the system browser resolver.
  4. Otherwise remain in Locadora and show a clear unavailable message.
- Never imply that an accepted launch means the title is playable or included in the user’s subscription. [Samsung Application API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/application-api.html)

## Test and Device Plan

- Automated checks:
  - Existing `npm test` and `npm run build:pages`.
  - TV build and Chrome-69 syntax/compatibility checks.
  - Manifest privilege/access validation.
  - Guest rental persistence and capacity tests.
  - Mocked Tizen tests for exact launch, app-home fallback, browser fallback, missing app, Back navigation, and resume restoration.
  - Package asset budget below 20 MiB, excluding generated signing metadata.
- Device setup:
  - Keep firmware 2740.1 as selected.
  - Enable Developer Mode from Samsung Apps using `12345`, enter the computer’s current LAN IP, and reboot.
  - Install Tizen Studio, TV Extension 5.5, Samsung Certificate Extension, and connect on port `26101`. [Samsung device setup](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html)
- Real-TV acceptance:
  - Cold launch reaches an interactive shelf without JS errors.
  - Catalogue, search, filters, two shelf stands, 3D selection, front/back inspection, and forced 2D fallback work entirely by remote.
  - Scene sustains at least 24 fps after warm-up and survives a ten-minute browse without WebGL context loss.
  - Cesta/rental/return survives app exit and relaunch.
  - Netflix, Prime, and Stremio each produce an observed exact-title launch or the defined app-home fallback.
  - Back returns from provider apps and restores the previous tape and focus.
  - Network loss shows a retryable error without destroying local rental state.
- Developer-installed apps may require reinstalling after the TV is powered off or disconnected; persistent store distribution is explicitly deferred. [Samsung testing FAQ](https://developer.samsung.com/smarttv/develop/faq/application-testing.html)

## Assumptions

- This prototype targets the current Samsung TV first while remaining compatible with other Tizen 5.5+ TVs.
- The public website retains its current behavior and current Three.js version.
- Existing uncommitted hover changes in `public/styles.css` and `test/menu-layout.test.js` remain separate and are not overwritten or staged with TV work.
- Worker deployment happens only if the actual device proves the route-limited TV CORS facade necessary.
- No commit, push, firmware update, Worker deployment, or Samsung store submission occurs without the corresponding implementation authorization.
