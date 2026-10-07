const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const page = readFileSync(require.resolve('../public/index.html'), 'utf8');
const app = readFileSync(require.resolve('../public/app.js'), 'utf8');
const css = readFileSync(require.resolve('../public/styles.css'), 'utf8');
const flat = readFileSync(require.resolve('../public/vhs-flat.mjs'), 'utf8');
const { COPY } = require('../public/i18n.js');

function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `expected to find ${signature}`);
  const end = source.indexOf('\n  }', start);
  return source.slice(start, end === -1 ? undefined : end);
}

test('the person window is an accessible native dialog modelled on the catalogue search', () => {
  assert.match(page, /<dialog id="person-dialog" class="panel-dialog person-dialog"/);
  assert.match(page, /id="person-dialog-heading"/);
  assert.match(page, /id="person-photo"/);
  assert.match(page, /id="person-name"/);
  assert.match(page, /id="person-roles"[^>]*data-i18n-aria-label="personRoles"/);
  assert.match(page, /id="person-titles"/);
  assert.match(page, /id="person-status"[^>]*role="status"/);
  assert.match(page, /id="person-view-stand"[^>]*data-i18n="viewAsStand"/);
  assert.match(page, /id="person-dialog"[\s\S]*data-i18n-aria-label="close"/);
});

test('the shelf exposes a credit-stand caption affordance and an all-providers empty action', () => {
  assert.match(page, /id="back-to-aisle"[^>]*data-i18n="backToAisle"/);
  assert.match(page, /id="immersive-back-to-aisle"[^>]*data-i18n="backToAisle"[^>]*hidden/);
  assert.match(page, /id="credit-stand-all-providers"[^>]*data-i18n="seeAllStreamings"[^>]*hidden/);
  assert.match(app, /\$\('#shelf-title'\)\.textContent = `\$\{t\('creditStand'\)\}: \$\{credit\.name\}`;/);
  assert.match(app, /function shelfRoomLabel\(\)/);
  assert.match(app, /immersiveShelf\?\.setLoading\(shelfRoomLabel\(\)/);
});

test('app.js owns the person + credit-stand state flow', () => {
  assert.match(app, /credit: null,/);
  assert.match(app, /function openPerson\(seed\)/);
  assert.match(app, /function applyCreditStand\(\)/);
  assert.match(app, /function backToAisle\(\)/);
  assert.match(app, /state\.credit = \{\s*id:/);
  assert.match(app, /let personState = null;/);
  assert.match(app, /function creditRoleLabel\(credit\)/);
  assert.match(app, /function departmentLabel\(department\)/);
  assert.match(app, /\/api\/person\?/);
  assert.match(app, /const endpoint = useCreditStand \? '\/api\/credit-stand' : '\/api\/shelf';/);
});

test('loadShelf routes to /api/credit-stand when a credit stand is selected', () => {
  const body = functionBody(app, 'async function loadShelf(');
  assert.match(body, /useCreditStand/);
  assert.match(body, /state\.credit\.id/);
  assert.match(body, /department: state\.credit\.department/);
  assert.match(body, /job: state\.credit\.job \|\| ''/);
  assert.match(body, /providers: state\.credit\.allProviders \? '' : state\.providers\.join\(','\)/);
  assert.match(body, /ignoreStoreYear: String\(state\.ignoreStoreYear\)/);
  assert.match(body, /state\.standCache\.set\(stand, \{ titles: state\.titles, hasNextStand: hasAnotherSourcePage \}\);/);
  assert.match(body, /hydrateTapeLogos\(\);/);
  assert.match(body, /refreshImmersive\(transitionDirection\);/);
});

test('credit names render as buttons with person data and degrade to plain text without ids', () => {
  assert.match(app, /function titleCreditGroups\(title\)/);
  assert.match(app, /function titleCreditFallbackGroups\(title\)/);
  assert.match(app, /button\.className = 'credit-link';/);
  assert.match(app, /button\.dataset\.personId = entry\.id;/);
  assert.match(app, /button\.dataset\.department = entry\.department;/);
  assert.match(app, /button\.dataset\.job = entry\.job;/);
  assert.match(app, /className = 'credit-name';/);
  assert.match(app, /state\.credit = /);
});

test('credit stands ignore the store year by default with the all-years control as the toggle', () => {
  const body = functionBody(app, 'function applyCreditStand()');
  assert.match(body, /state\.ignoreStoreYear = true;/);
  assert.match(body, /state\.credit = \{/);
  // The all-years checkbox must stay usable on a credit stand even without saved providers.
  assert.match(app, /\(enabled \|\| credit\) && state\.ignoreStoreYear/);
  assert.match(app, /state\.ignoreStoreYear = \(enabled \|\| credit\)/);
});

test('the empty credit stand offers see-all-streamings without overwriting the saved providers', () => {
  const body = functionBody(app, 'function showAllCreditStreamings()');
  assert.match(body, /state\.credit\.allProviders = true;/);
  assert.doesNotMatch(body, /setProviders\(/);
  assert.doesNotMatch(body, /localStorage/);
  assert.match(app, /\$\('#back-to-aisle'\)\.hidden = !credit;/);
  assert.match(app, /\$\('#credit-stand-all-providers'\)\.hidden = !\(state\.credit && !state\.credit\.allProviders\)/);
});

test('backToAisle clears the credit source and reloads the genre shelf', () => {
  const body = functionBody(app, 'function backToAisle()');
  assert.match(body, /if \(!leaveCreditStand\(\)\) return;/);
  assert.match(body, /loadShelf\(\);/);
  assert.match(functionBody(app, 'function leaveCreditStand()'), /state\.credit = null;/);
});

test('department labels and credit-stand copy exist in both locales', () => {
  const keys = [
    'viewAsStand', 'creditStand', 'backToAisle', 'creditsOf', 'creditStandEmpty', 'seeAllStreamings',
    'personLoading', 'personRoles', 'personNoTitles',
    'departmentDirecting', 'departmentActing', 'departmentWriting', 'departmentCamera', 'departmentEditing',
    'departmentVisualEffects', 'departmentSound', 'departmentArt', 'departmentProduction', 'departmentMusic',
    'departmentCostume', 'departmentLighting',
  ];
  for (const locale of ['pt-BR', 'en-US']) {
    for (const key of keys) {
      assert.equal(typeof COPY[locale][key], 'string', `${locale}.${key} must exist`);
      assert.ok(COPY[locale][key].length > 0, `${locale}.${key} must not be empty`);
    }
  }
  assert.equal(COPY['pt-BR'].departmentDirecting, 'Direção');
  assert.equal(COPY['pt-BR'].departmentActing, 'Elenco');
  assert.equal(COPY['pt-BR'].departmentWriting, 'Roteiro');
});

test('person and credit-stand surfaces reuse the restrained Locadora chrome', () => {
  assert.match(css, /\.person-dialog \{/);
  assert.match(css, /\.person-roles button/);
  assert.match(css, /\.credit-link \{/);
  assert.match(css, /\.back-to-aisle \{/);
});

test('applying the browse menu leaves a credit stand instead of pinning the person', () => {
  assert.match(app, /function leaveCreditStand\(\)/);
  assert.match(functionBody(app, 'function applyNormalMenuFilters()'), /leaveCreditStand\(\);/);
  assert.match(functionBody(app, 'function applyImmersiveFilters()'), /if \(yearChanged \|\| genreChanged\) leaveCreditStand\(\);/);
  // The 3D plaque is the aisle menu there (the DOM panel is clipped to a keyboard fallback).
  assert.match(app, /onConfigure: \(draft\) => \{[\s\S]*?if \(genreChanged \|\| yearChanged \|\| sortChanged\) leaveCreditStand\(\);/);
  assert.match(functionBody(app, 'function backToAisle()'), /if \(!leaveCreditStand\(\)\) return;/);
});

test('the clickable credit index is reachable in both viewers', () => {
  // The 3D inspector draws its credits on the tape texture, so the DOM index must float over the
  // stage instead of landing below a full-height canvas inside an overflow:hidden dialog.
  assert.match(css, /#title-detail > \.title-credits \{[\s\S]*?position: fixed;/);
  assert.match(css, /\.flat-vhs-back \.title-credits \{/);
  assert.match(app, /const host = detail\.querySelector\('\.flat-vhs-back'\) \|\| detail;/);
  assert.match(app, /button\.dataset\.personId = entry\.id;/);
});

test('the deep credits panel is hidden by default and toggled by the [mais] affordance', () => {
  assert.match(app, /function renderTitleCredits\(title, \{ deep = false \} = \{\}\)/);
  assert.match(app, /const groups = deep \? titleCreditDeepGroups\(title\) : titleCreditGroups\(title\);/);
  // Rendered hidden; syncTitleCredits never auto-shows it.
  assert.match(app, /section\.hidden = true;\n    return section;/);
  assert.match(app, /const section = renderTitleCredits\(title, \{ deep: true \}\);\n    section\.hidden = true;/);
  assert.match(app, /function toggleTitleCreditsPanel\(force\)/);
  assert.match(app, /panel\.hidden = nextHidden;/);
  // Both viewers drive the panel and the person window through the frozen contract.
  assert.equal((app.match(/onMoreCredits: \(\) => toggleTitleCreditsPanel\(\)/g) || []).length, 2);
  assert.equal((app.match(/onCreditPerson: \(entry\) => openPerson\(entry\)/g) || []).length, 2);
});

test('the deep credits listing adds crew department groups from meta.credits.crew', () => {
  const body = functionBody(app, 'function titleCreditDeepGroups(title)');
  assert.match(body, /credits\.crew/);
  assert.match(body, /creditEntries\(credits\.cast, 'Acting', ''\)\.slice\(0, 20\)/);
  assert.match(body, /CREDIT_PRIMARY_DEPARTMENTS\.includes\(entry\.department\)/);
  assert.match(body, /departmentLabel\(department\)/);
  assert.match(body, /DEPARTMENT_LABEL_KEYS\[department\]/);
  assert.match(app, /heading\.textContent = t\('creditsPanelTitle'\)/);
});

test('the flat tape back cover renders clickable credit chips plus a [mais] button', () => {
  assert.match(flat, /onCreditPerson, onMoreCredits, copy = \{\}/);
  assert.match(flat, /function creditGroup\(value, fallbackDepartment, fallbackJob\)/);
  assert.match(flat, /const chip = element\('button', 'credit-link', entry\.name\);/);
  assert.match(flat, /chip\.dataset\.personId = entry\.id;/);
  assert.match(flat, /chip\.dataset\.department = entry\.department;/);
  assert.match(flat, /chip\.dataset\.job = entry\.job;/);
  assert.match(flat, /chip\.addEventListener\('click', \(\) => onCreditPerson\?\.\(entry\)\);/);
  assert.match(flat, /creditGroup\(currentTitle\.credits\?\.director, 'Directing', 'Director'\)/);
  assert.match(flat, /creditGroup\(currentTitle\.credits\?\.cast, 'Acting', ''\)/);
  assert.match(flat, /button\(copy\.moreCredits \|\| 'mais', 'credit-link credits-panel-toggle', \(\) => onMoreCredits\(\)\)/);
});

test('moreCredits and creditsPanelTitle exist in both locales', () => {
  assert.equal(COPY['pt-BR'].moreCredits, 'mais');
  assert.equal(COPY['pt-BR'].creditsPanelTitle, 'Ficha técnica');
  assert.equal(COPY['en-US'].moreCredits, 'more');
  assert.equal(COPY['en-US'].creditsPanelTitle, 'Credits');
});

test('the deep credits panel reuses the restrained Locadora chrome', () => {
  assert.match(css, /\.credits-panel-toggle \{/);
  assert.match(css, /\.credits-panel-close \{/);
  assert.match(css, /\.title-credits-title \{/);
  // The floating look is kept for the on-demand deep view; flat chips stay inline.
  assert.match(css, /#title-detail > \.title-credits \{[\s\S]*?position: fixed;/);
  assert.match(css, /\.flat-vhs-back \.title-credits \{/);
});
