import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile 2D shelves show poster+logo-backed tape spines with a vertical title', () => {
  const styles = read('public/styles.css');
  assert.match(styles, /@media \(max-width: 760px\), \(max-width: 900px\) and \(pointer: coarse\)/);
  assert.match(styles, /\.shelf \{\s*display: grid;\s*grid-template-columns: repeat\(8, minmax\(0, 1fr\)\);/);
  assert.match(styles, /\.tape-fallback-grid \{ display: grid; grid-template-columns: repeat\(8, minmax\(0, 1fr\)\);/);
  assert.match(styles, /--mobile-spine-width: 32px/);
  assert.match(styles, /\.case-label strong \{[^}]*rotate\(90deg\)/);
  assert.match(styles, /\.vhs-case \.case-cover \{ position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover; \}/);
  assert.match(styles, /\.vhs-case \.case-logo \{[\s\S]*max-width: 100%;[\s\S]*object-fit: contain;[\s\S]*\}/);
  assert.match(styles, /\.vhs-case\.has-logo \.case-logo \{ display: block; \}/);
  assert.match(styles, /\.case-spine \{[^}]*background: rgba\(8, 5, 4, \.32\);/);
});

test('mobile 3D fallback spine titles read from top to bottom', () => {
  const cases = read('public/vhs-case.mjs');
  assert.match(cases, /drawSpineLabel\(context, title, logoImage, labelScale = 1\)/);
  assert.match(cases, /drawSpineLogo\(context, title, logoImage, labelScale\)/);
  assert.match(cases, /context\.rotate\(Math\.PI \/ 2\);[\s\S]*context\.fillStyle = '#fff4d1'/);
  assert.doesNotMatch(cases, /context\.rotate\(-Math\.PI \/ 2\);/);
});

test('mobile immersive shelves rebuild a narrow spine-facing rack for portrait and landscape', () => {
  const immersive = read('public/immersive-shelf.mjs');
  assert.match(immersive, /function layoutKey\(\)/);
  assert.match(immersive, /mobile-landscape/);
  assert.match(immersive, /const compactRack = new THREE\.Group\(\)/);
  assert.match(immersive, /const columns = compact \? 10 : COLUMNS/);
  assert.match(immersive, /const mobileSpineWidth = \.32/);
  assert.match(immersive, /const mobileSpineGap = landscape \? 0 : \.02/);
  assert.match(immersive, /const mobileRackWidth = landscape \? 4\.44 : 3\.78/);
  assert.match(immersive, /fitCompactRack\(columns, spacingX, mobileSpineWidth, mobileRackWidth\)/);
  assert.match(immersive, /createVhsSpine\(title, \{ \.\.\.imageOptions, logoUrl: title\.logoUrl, fallbackLogoUrl: title\.logoFallbackUrl, width: mobileSpineWidth, height: 1\.42, depth: 0\.3, labelScale: mobileSpineWidth \/ \.4 \}\)/);
  assert.match(immersive, /const compactLips = \[\];[\s\S]*for \(const y of \[-2\.5, -\.75, 1, 2\.75, 4\.5\]\)/);
  assert.match(immersive, /const compactRackCenterY = 1;[\s\S]*new THREE\.BoxGeometry\(7\.1, 7\.4, 0\.35\)[\s\S]*new THREE\.BoxGeometry\(0\.32, 7\.85, 0\.72\)/);
  assert.match(immersive, /const compactRoomOffsetY = -1\.8;[\s\S]*room\.position\.y = compact \? compactRoomOffsetY : 0;/);
  assert.match(immersive, /compactRoomOffsetY \+ 0\.55 \+ mobilePanY/);
  assert.match(immersive, /compactRoomOffsetY \+ 0\.25 \+ mobilePanY/);
  assert.match(immersive, /const compactOverheadLight = new THREE\.PointLight\(0xffedc7, 30, 20\);[\s\S]*compactOverheadLight\.position\.set\(0, 7, 4\.5\)[\s\S]*compactOverheadLight\.visible = compact;/);
});

test('tape inspection pauses the immersive shelf renderer behind its dialog', () => {
  const immersive = read('public/immersive-shelf.mjs');
  const app = read('public/app.js');
  assert.match(immersive, /setActive\(active\)/);
  assert.match(immersive, /if \(disposed \|\| !running\) return/);
  assert.match(app, /if \(state\.mode === 'immersive'\) immersiveShelf\?\.setActive\?\.\(false\)/);
  assert.match(app, /titleDialog\.addEventListener\('close',[\s\S]*immersiveShelf\?\.setActive\?\.\(true\)/);
});

test('3D tape artwork queues, retries, and cancels slow cover loads', () => {
  const cases = read('public/vhs-case.mjs');
  const app = read('public/app.js');
  assert.match(cases, /const TEXTURE_LOAD_CONCURRENCY = 6/);
  assert.match(cases, /const TEXTURE_LOAD_ATTEMPTS = 6/);
  assert.match(cases, /const TEXTURE_RETRY_DELAYS = \[1200, 4000, 12000, 30000, 60000\]/);
  assert.match(cases, /function loadTextureWithRetry\(sources, onLoad, priority = false\)/);
  assert.match(cases, /function queueTextureLoad\(job\) \{\s*if \(job\.priority\) textureLoadQueue\.unshift\(job\)/);
  assert.match(cases, /loadTextureWithRetry\(\[url, fallbackUrl\],[\s\S]*\}, true\);/);
  assert.match(cases, /job\.cancelled = true/);
  assert.match(cases, /loadTextureWithRetry\(\[posterUrl, fallbackPosterUrl\]/);
  assert.match(cases, /dispose\(\) \{ disposed = true; cancelPosterLoad\(\);/);
  assert.match(app, /posterUrl: title\.poster \|\| posterFallback\(title\),[\s\S]*posterFallbackUrl: posterTextureUrl/);
  assert.match(app, /logoUrl: posterTextureUrl\(title\.logo\),\s*logoFallbackUrl: title\.logo \|\| ''/);
  assert.match(app, /immersiveShelf\?\.setLogo\?\.\(title\.id, logoUrl, title\.logo\)/);
});

test('2D shelf logos retry without hiding the title fallback', () => {
  const app = read('public/app.js');
  assert.match(app, /const LOGO_METADATA_ATTEMPTS = 4/);
  assert.match(app, /const LOGO_METADATA_RETRY_DELAYS = \[1500, 5000, 15000\]/);
  assert.match(app, /await Promise\.all\(Array\.from\(\{ length: Math\.min\(CONCURRENCY, pending\.length\) \}, worker\)\)/);
  assert.match(app, /if \(token === logoHydrationToken\) retry\.push\(title\)/);
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
  assert.match(immersive, /standMarker\.position\.set\(\(sw \* 7\.9\) \/ 2 \+ markerScale \* 0\.65, sign\.position\.y - 0\.42, 0\.18\)/);
  assert.match(immersive, /standMarker\.scale\.set\(1, 1, 1\)/);
});

test('mobile immersive drag pans the camera and focus together without translating the shelf room', () => {
  const immersive = read('public/immersive-shelf.mjs');
  assert.match(immersive, /renderer\.domElement\.setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(immersive, /mobilePanX = THREE\.MathUtils\.clamp\(dragPanBaseX - [\s\S]*\* 4, -2\.6, 2\.6\)/);
  assert.match(immersive, /mobilePanY = THREE\.MathUtils\.clamp\(dragPanBaseY \+ [\s\S]*\* 4\.5, -3\.4, 3\.4\)/);
  assert.match(immersive, /mobilePanLookAt\.set\(mobilePanX, 0\.25 \+ mobilePanY, 0\)/);
  assert.doesNotMatch(immersive, /onSwipe\?\./);
  assert.doesNotMatch(immersive, /dragOffsetTarget = THREE\.MathUtils\.clamp/);
  assert.doesNotMatch(immersive, /room\.position\.x \+= \(dragOffsetTarget/);
  assert.doesNotMatch(immersive, /room\.position\.y \+= \(dragOffsetTargetY/);
});

test('long browsing sessions bound repeated rendering work without changing shared shelf history', () => {
  const app = read('public/app.js');
  const immersive = read('public/immersive-shelf.mjs');
  const featured = read('public/featured-titles.mjs');
  assert.match(app, /metadata: createBoundedCache\(120\)/);
  assert.match(app, /const previousStand = state\.stand - 1;[\s\S]*if \(!goToCachedStand\(previousStand, -1\)\) loadShelf\(previousStand, false, -1, true\);/);
  assert.match(app, /async function loadShelf\(stand = 0, append = false, transitionDirection = 0, preserveStandHistory = false\)/);
  assert.match(app, /if \(!append && !preserveStandHistory\) \{[\s\S]*state\.standCache\.clear\(\)/);
  assert.match(app, /const nextTitles = preserveStandHistory \? body\.titles : body\.titles\.filter/);
  assert.match(app, /if \(!append && !preserveStandHistory\) state\.renderedTitleKeys = new Set\(\)/);
  assert.match(app, /if \(!append && !preserveStandHistory\) state\.titles = \[\];/);
  assert.match(app, /if \(state\.mode === 'normal'\) renderShelf\(state\.titles, stand, append\)/);
  assert.match(app, /if \(state\.titles\.length\) renderShelf\(state\.titles, state\.stand, false\)/);
  assert.match(app, /function replaceShelfContents\([\s\S]*cancelLogoLoad\?\.\(\)/);
  assert.doesNotMatch(immersive, /record\.group\.scale\.lerp\(new THREE\.Vector3/);
  assert.match(immersive, /record\.group\.scale\.setScalar\(THREE\.MathUtils\.lerp/);
  assert.match(immersive, /if \(nextKey === providerLogoKey\) return;/);
  assert.match(immersive, /if \(!disposed && token === featuredRequestToken\) renderFeaturedPosters\(featured\)/);
  assert.match(immersive, /if \(String\(nextYear\) !== featuredYear\) loadFeaturedPosters\(nextYear\)/);
  assert.match(featured, /const FEATURED_YEAR_CACHE_LIMIT = 6/);
  assert.match(featured, /while \(featuredByYear\.size > FEATURED_YEAR_CACHE_LIMIT\)/);
});
