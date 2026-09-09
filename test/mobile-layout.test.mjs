import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile 2D shelves show poster+logo-backed tape spines with a vertical title', () => {
  const styles = read('public/styles.css');
  assert.match(styles, /@media \(max-width: 760px\), \(max-width: 900px\) and \(pointer: coarse\)/);
  assert.match(styles, /\.shelf \{\s*display: grid;\s*grid-template-columns: repeat\(auto-fit, minmax\(42px, 1fr\)\);/);
  assert.match(styles, /\.case-label strong \{[^}]*rotate\(90deg\)/);
  assert.match(styles, /\.vhs-case \.case-cover \{ position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover; \}/);
  assert.match(styles, /\.vhs-case \.case-logo \{[\s\S]*max-width: 100%;[\s\S]*object-fit: contain;[\s\S]*\}/);
  assert.match(styles, /\.vhs-case\.has-logo \.case-logo \{ display: block; \}/);
  assert.match(styles, /\.case-spine \{[^}]*background: rgba\(8, 5, 4, \.32\);/);
});

test('mobile 3D fallback spine titles read from top to bottom', () => {
  const cases = read('public/vhs-case.mjs');
  assert.match(cases, /drawSpineLabel\(context, title, logoImage\)/);
  assert.match(cases, /context\.rotate\(Math\.PI \/ 2\);[\s\S]*context\.fillStyle = '#fff4d1'/);
  assert.doesNotMatch(cases, /context\.rotate\(-Math\.PI \/ 2\);/);
});

test('mobile immersive shelves rebuild a narrow spine-facing rack for portrait and landscape', () => {
  const immersive = read('public/immersive-shelf.mjs');
  assert.match(immersive, /function layoutKey\(\)/);
  assert.match(immersive, /mobile-landscape/);
  assert.match(immersive, /const compactRack = new THREE\.Group\(\)/);
  assert.match(immersive, /createVhsSpine\(title, \{ \.\.\.imageOptions, logoUrl: title\.logoUrl, fallbackLogoUrl: title\.logoFallbackUrl, width: 0\.4, height: 1\.42, depth: 0\.3 \}\)/);
  assert.match(immersive, /const columns = compact \? \(landscape \? 10 : 8\) : COLUMNS/);
});

test('3D tape artwork queues, retries, and cancels slow cover loads', () => {
  const cases = read('public/vhs-case.mjs');
  const app = read('public/app.js');
  assert.match(cases, /const TEXTURE_LOAD_CONCURRENCY = 6/);
  assert.match(cases, /const TEXTURE_LOAD_ATTEMPTS = 6/);
  assert.match(cases, /const TEXTURE_RETRY_DELAYS = \[1200, 4000, 12000, 30000, 60000\]/);
  assert.match(cases, /function loadTextureWithRetry\(sources, onLoad\)/);
  assert.match(cases, /job\.cancelled = true/);
  assert.match(cases, /loadTextureWithRetry\(\[posterUrl, fallbackPosterUrl\]/);
  assert.match(cases, /dispose\(\) \{ disposed = true; cancelPosterLoad\(\);/);
  assert.match(app, /posterUrl: title\.poster \|\| posterFallback\(title\),[\s\S]*posterFallbackUrl: posterTextureUrl/);
});

test('2D shelf logos retry without hiding the title fallback', () => {
  const app = read('public/app.js');
  assert.match(app, /const LOGO_LOAD_ATTEMPTS = 6/);
  assert.match(app, /const LOGO_RETRY_DELAYS = \[1200, 4000, 12000, 30000, 60000\]/);
  assert.match(app, /function loadTapeLogo\(image, tape, sources\)/);
  assert.match(app, /const handleLoad = \(\) => \{[\s\S]*tape\.classList\.add\('has-logo'\)/);
  assert.match(app, /const handleError = \(\) => \{[\s\S]*tape\.classList\.remove\('has-logo'\);[\s\S]*window\.setTimeout\(tryLoad/);
  assert.doesNotMatch(app, /logo\.src = logoUrl;\s*button\.classList\.add\('has-logo'\)/);
});

test('mobile immersive shelves retain framed wall posters around the compact rack', () => {
  const immersive = read('public/immersive-shelf.mjs');
  assert.match(immersive, /function layoutFeaturedPosters\(key\)/);
  assert.match(immersive, /const mobileX = portrait \? \[-3\.05, 3\.05\] : \[-4\.4, 4\.4\]/);
  assert.match(immersive, /frame\.visible = !mobile \|\| index < 2/);
  assert.match(immersive, /settingWall\.visible = true/);
  assert.match(immersive, /featuredPosterGroup\.visible = true/);
  assert.doesNotMatch(immersive, /featuredPosterGroup\.visible = !compact/);
});

test('mobile immersive shelves keep the desktop stand-number plaque visible in compact framing', () => {
  const immersive = read('public/immersive-shelf.mjs');
  assert.match(immersive, /standMarker\.visible = true/);
  assert.match(immersive, /const markerScale = sw \* 0\.72/);
  assert.match(immersive, /standMarker\.position\.set\(\(sw \* 7\.9\) \/ 2 \+ markerScale \* 1\.1, sign\.position\.y - 0\.42, 0\.18\)/);
  assert.match(immersive, /standMarker\.scale\.set\(1, 1, 1\)/);
});

test('long browsing sessions bound repeated rendering work without changing shared shelf history', () => {
  const app = read('public/app.js');
  const immersive = read('public/immersive-shelf.mjs');
  const featured = read('public/featured-titles.mjs');
  assert.match(app, /metadata: createBoundedCache\(120\)/);
  assert.match(app, /if \(!append\) state\.renderedTitleKeys = new Set\(\)/);
  assert.match(app, /renderShelf\(state\.titles, stand, append\)/);
  assert.doesNotMatch(app, /appendToNormalShelf/);
  assert.match(app, /function replaceShelfContents\([\s\S]*cancelLogoLoad\?\.\(\)/);
  assert.doesNotMatch(immersive, /record\.group\.scale\.lerp\(new THREE\.Vector3/);
  assert.match(immersive, /record\.group\.scale\.setScalar\(THREE\.MathUtils\.lerp/);
  assert.match(immersive, /if \(nextKey === providerLogoKey\) return;/);
  assert.match(immersive, /if \(!disposed && token === featuredRequestToken\) renderFeaturedPosters\(featured\)/);
  assert.match(immersive, /if \(String\(nextYear\) !== featuredYear\) loadFeaturedPosters\(nextYear\)/);
  assert.match(featured, /const FEATURED_YEAR_CACHE_LIMIT = 6/);
  assert.match(featured, /while \(featuredByYear\.size > FEATURED_YEAR_CACHE_LIMIT\)/);
});
