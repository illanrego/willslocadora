# Will’s Locadora Public Edition — Discovery and Streaming Availability Plan

> **For Hermes:** Implement only after the user chooses a metadata and availability-data provider. Keep the personal/local Stremio bridge separate from this edition.

**Goal:** Ship a public, Brazil-first discovery edition of Will’s Locadora that displays film/series metadata, posters, and current regional availability, then sends the visitor to a legitimate external service rather than playing anything itself.

**Architecture:** GitHub Pages hosts the static UI. A small Cloudflare Worker becomes the public API boundary for allowlisted metadata and availability providers, response normalization, cache control, quota protection, and keeping provider credentials out of browser assets. The local Node/Stremio bridge remains a separate personal-mode runtime.

**Tech stack:** Existing vanilla JS and Three.js frontend; GitHub Pages; Cloudflare Worker; Cloudflare Cache API/KV only if cache persistence proves necessary; one licensed metadata provider and one licensed streaming-availability provider.

---

## Product decision

The public product is a **discovery and outbound-link layer**, not a streaming service, player, torrent/debrid client, or Stremio add-on.

For every selected title, the public detail view should show:

- title, poster, year, synopsis, genres, cast/crew where licensed;
- the selected viewer country (Brazil first);
- a timestamped `Where to watch` list such as Netflix, Prime Video, Disney+, MUBI, rent, buy, free-with-ads, or unavailable;
- an explicit external CTA per offer, e.g. `Check on Prime Video`;
- an honest disclaimer: availability changes by country and provider; Locadora does not guarantee playback.

Keep the existing `Watch in Stremio` action only in the **local/personal edition**. Do not imply public visitors have Stremio installed or that a title is playable there.

## JustWatch decision

Do **not** build against JustWatch’s website traffic, undocumented GraphQL calls, or scraped search pages. That is fragile and may breach terms/licensing.

A public, self-service developer API for arbitrary applications was not verified during this planning session. Treat JustWatch data/API access as a commercial partnership/licensing conversation that must provide, in writing:

1. permitted display and caching terms;
2. supported countries, especially Brazil;
3. provider logos and attribution requirements;
4. legally usable outbound/deep links;
5. quotas, pricing, and availability-update expectations.

Use one of these paths only after legal/product confirmation:

- **Preferred if approved:** a licensed JustWatch data/API agreement.
- **MVP alternative:** TMDB metadata plus its documented watch-provider data, subject to its API key, attribution, country coverage, caching, and outbound-link terms.
- **Alternative vendor:** a commercial streaming-availability API with explicit Brazil coverage and commercial display/link rights.

Do not select a vendor merely because an unofficial endpoint currently works.

## Canonical public data model

Normalize all providers at the Worker boundary. Browser UI must not know a vendor’s response shape.

```js
{
  id: 'tmdb:123',
  imdbId: 'tt1234567',
  type: 'movie',
  name: 'Example title',
  releaseYear: 1997,
  posterUrl: 'https://…',
  synopsis: '…',
  genres: ['Comedy'],
  credits: { directors: ['…'], cast: ['…'] },
  availability: {
    country: 'BR',
    checkedAt: '2026-07-20T16:00:00Z',
    offers: [
      {
        provider: 'Prime Video',
        providerId: 'prime-video',
        logoUrl: 'https://…',
        monetization: 'subscription',
        url: 'https://provider-or-licensed-partner-link.example',
      },
    ],
  },
}
```

Use stable external IDs (`tmdb`, `imdb`) for matching. Never match titles by name alone except as a visibly fallible search fallback.

---

## Phases

### Phase 0: Data-rights and product-spike decision

**Objective:** Choose legal, reliable sources before public implementation.

**Files:**
- Create: `docs/public-data-sources.md`
- Modify: `PRODUCT_SPEC.md`
- Modify: `ARCHITECTURE.md`

**Steps:**
1. Define the launch market as Brazil (`BR`) only; defer multi-country launch.
2. Contact JustWatch/data vendors and evaluate TMDB’s documented provider offering.
3. Record, per candidate: data fields, Brazil coverage, attribution, caching limits, direct-link policy, rate limits, price, reliability, and shutdown/migration risk.
4. Decide one metadata source and one availability source. They may be the same provider only if their terms allow both use cases.
5. Set the public CTA rule: use licensed provider links when supplied; otherwise link to a title search/result page that the data supplier explicitly permits.
6. Update `PRODUCT_SPEC.md` to add a separate `Public edition` scope and retain the local Stremio edition as personal software.

**Acceptance criteria:** A documented provider decision exists before any public API key, Worker, or UI code is added.

### Phase 1: Separate public-edition contract

**Objective:** Prevent the public product from depending on the local Node/Stremio bridge.

**Files:**
- Create: `public/app-config.js`
- Create: `src/public-model.js` or a Worker-shared equivalent
- Modify: `public/app.js`
- Test: `test/public-model.test.js`

**Steps:**
1. Add an explicit runtime mode: `local-stremio` versus `public-discovery`.
2. Define a provider-neutral title/availability normalizer and test missing poster, missing IDs, unavailable offers, and malformed links.
3. In public mode, hide/remove local source-management controls and Stremio-only copy.
4. Replace the local-only `Watch in Stremio` primary action with an availability-aware detail action placeholder; do not implement external calls yet.
5. Keep the current local flow unchanged and covered by existing tests.

**Acceptance criteria:** The browser can render the same title model in either mode without exposing source configuration or assuming Stremio is installed.

### Phase 2: Public Worker foundation

**Objective:** Add a minimal public API without deploying the current Node server.

**Files:**
- Create: `worker/src/index.js`
- Create: `worker/src/providers/metadata.js`
- Create: `worker/src/providers/availability.js`
- Create: `worker/wrangler.toml`
- Create: `worker/.dev.vars.example`
- Create: `test/worker.test.js`
- Modify: `.gitignore`
- Modify: `package.json`

**Steps:**
1. Add Worker routes: `GET /api/shelf`, `GET /api/title`, and `GET /api/title/:id/availability?country=BR`.
2. Allow only known provider base URLs and known country codes; do not accept arbitrary manifest URLs or arbitrary remote image URLs.
3. Store provider API keys only as Worker secrets; never expose them in GitHub Pages assets, repository files, browser console output, or test fixtures.
4. Normalize provider responses into the canonical public model.
5. Add short edge caching: metadata roughly one day; availability a much shorter provider-approved TTL (start with six hours only if the agreement permits it).
6. Apply request validation, rate limiting, CORS restricted to the Pages origin, timeout handling, and generic client-safe errors.
7. Add Worker unit tests with fixtures for a successful result, country unavailable, vendor timeout, malformed provider data, and disallowed country.

**Acceptance criteria:** A deployed Worker can serve a normalized, non-secret fixture-backed title and availability response to the Pages origin only.

### Phase 3: Public catalogue and title detail

**Objective:** Make discovery useful before adding complex purchase/subscription links.

**Files:**
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/vhs-3d.mjs`
- Modify: `test/server.test.js` or replace public-runtime assertions with Worker tests

**Steps:**
1. Point public mode shelf requests to the Worker’s allowlisted catalogue route.
2. Use provider image URLs or a Worker image route only if the data licence and browser CSP allow it; do not retain the current arbitrary poster proxy in the public edition.
3. Render title metadata from the public model.
4. Preserve the store-year mechanic as a release-date discovery filter; do not present it as historical provider availability.
5. Add clear loading, no-results, and source-unavailable states.

**Acceptance criteria:** A public visitor can browse genre/year shelves and open a complete title detail without any Stremio dependency.

### Phase 4: `Where to watch` and provider handoff

**Objective:** Turn discovery into a trustworthy outbound conversion loop.

**Files:**
- Create: `public/availability.js`
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Create: `docs/public-availability-policy.md`
- Test: `test/availability.test.js`

**Steps:**
1. Render offers grouped by subscription, rent, buy, free, and ads where the licensed provider supplies those labels.
2. Display the active country and `Checked <time>` timestamp.
3. Render only provider names/logos and URLs supplied/permitted by the chosen data contract.
4. Make outbound navigation user-initiated and use `rel="noopener noreferrer"`.
5. Provide an `Unavailable in Brazil` state with a permitted fallback search link or no link—never invent a provider link.
6. Add no-playback and availability-change disclaimers.
7. Test sort order, duplicate provider merging, invalid URL suppression, unavailable state, and timestamp rendering.

**Acceptance criteria:** Every provider CTA is validated, country-scoped, user-initiated, and explicitly non-guaranteed.

### Phase 5: Public deployment, privacy, and quality gates

**Objective:** Publish a maintainable, low-cost public beta.

**Files:**
- Create: `docs/public-deployment.md`
- Create: `docs/privacy-public.md`
- Modify: `README.md`
- Modify: `package.json`

**Steps:**
1. Deploy static frontend to GitHub Pages and Worker to Cloudflare.
2. Configure the Worker Pages-origin allowlist and production secrets.
3. Add provider-attribution text/logos exactly as contractually required.
4. Add basic privacy copy: no account required, no Stremio configuration collected, no watch history sent by default.
5. Monitor only aggregate operational errors/rate-limit events if analytics is approved; otherwise keep observability operational and privacy-minimal.
6. Add end-to-end non-UI checks for public API errors, cache headers, CORS, and outbound-link validation.
7. Manually test Brazil availability for a small fixed set of well-known titles before inviting users.

**Acceptance criteria:** Public Pages cannot access secrets, Worker blocks unapproved origins/provider URLs, and every displayed provider claim can be traced to the selected licensed source.

---

## Explicitly deferred

- Direct playback, embeds, torrent/debrid, subtitle handling, or stream resolution.
- User accounts and subscriptions.
- Personal Stremio add-on configuration on the public site.
- Scraping JustWatch or any provider website.
- A global multi-country rollout before Brazil availability and link quality are validated.
- Affiliate/revenue logic until data-provider and streaming-provider terms are agreed.

## Risks and guardrails

- **Availability data changes frequently:** cache briefly and show a timestamp.
- **Country mismatch:** use explicit country selection; default to `BR` only after product approval, not silent IP geolocation.
- **Provider mismatch:** title IDs are mandatory for matching; fall back to no offer instead of guessing.
- **Licensing:** source logos, provider names, deep links, storage, and attribution must follow the signed/source-specific agreement.
- **Cost/rate limits:** worker caching, allowlists, response-size limits, timeouts, and rate limits are required from the first public beta.
- **Product clarity:** “available on” is discovery information; it is never a playback guarantee.

## Verification checklist

- `npm run test` remains green for local mode.
- Worker unit tests cover provider adapters and public response normalization.
- A curl/API test confirms browser CORS is restricted to the public frontend origin.
- A secret scan confirms no provider key or personal Stremio URL appears in `public/`, git diff, test fixtures, or docs.
- Manual Brazil playtest verifies a sample of metadata, poster attribution, availability badges, and outbound links.
