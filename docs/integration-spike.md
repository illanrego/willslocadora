# Locadora — Phase 0 Stremio integration spike

**Status:** passed for MVP path on 2026-07-19  
**Environment:** Debian desktop; Stremio Flatpak `com.stremio.Stremio`; Locadora at `127.0.0.1:4173`

## Results

| Question | Evidence | Result |
| --- | --- | --- |
| Movie detail handoff | `gio open stremio:///detail/movie/tt0120660` launched `/app/opt/stremio/stremio` and its local Node engine with that exact URI argument. | Pass |
| Series detail handoff | After closing the test-launched client, `gio open stremio:///detail/series/tt0903747` launched both Stremio processes with that exact URI argument. | Pass |
| Registered handler | `xdg-mime` and `gio mime` both reported `com.stremio.Stremio.desktop` as the `x-scheme-handler/stremio` default. | Pass |
| Playback boundary | Both URIs target `detail`, not a video/stream route. No title was played. | Pass |
| Catalogue metadata | Public Cinemeta manifest and redirected year catalogues returned real Stremio metadata. Locadora's live Horror/1999 check returned HTTP 200 with 17 normalized titles. | Pass |
| Additional add-ons | Sources UI accepts explicit HTTPS `manifest.json` URLs; the bridge stores URLs only in ignored local state and returns sanitized capabilities. | Pass |

## Chosen MVP integration

Locadora uses a deliberately constrained hybrid:

1. Public Cinemeta is the default metadata-discovery source.
2. Users may explicitly add catalogue-capable Stremio add-on manifests.
3. Locadora never reads Stremio private files or account tokens and does not claim to mirror the installed add-on list automatically.
4. Native Stremio remains authoritative for stream availability, stream selection, and playback.

This gives the store a useful catalogue immediately while preserving the security boundary.

## Redirect and network safety

Cinemeta's year catalogue currently responds with a public 307 to `cinemeta-catalogs.strem.io`. The bridge follows up to three redirects and validates HTTPS, credentials, hostname, and DNS addresses at every hop. Localhost and private-network destinations are rejected.

## Browser behavior

The Locadora page emits native detail links in these shapes:

```text
stremio:///detail/movie/<public-id>
stremio:///detail/series/<public-id>
```

The browser/desktop may display an external-application confirmation depending on browser policy. The OS-level handler and exact routes have been proven; no attempt is made to bypass browser consent.

## Remaining playtest

Use the visible **Watch in Stremio** button in the user's preferred browser and confirm its normal external-app confirmation/focus behavior. This is a UX playtest, not an unproven protocol assumption.
