import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const viewer = readFileSync(new URL('../public/vhs-3d.mjs', import.meta.url), 'utf8');

function includes(snippet, label = snippet) {
  assert.ok(viewer.includes(snippet), `expected vhs-3d.mjs to contain: ${label}`);
}

test('the 3D back cover maps each credit group to the person-entry shape', () => {
  includes('const CREDIT_GROUPS = [');
  includes("{ key: 'director', label: 'directedBy', fallbackKey: 'director', department: 'Directing', job: 'Director', limit: 4 }");
  includes("{ key: 'writer', label: 'writtenBy', fallbackKey: 'writer', department: 'Writing', job: 'Writer', limit: 4 }");
  includes("{ key: 'cast', label: 'starring', fallbackKey: 'cast', department: 'Acting', job: 'Acting', limit: 10 }");
  includes('id: String(entry.id),');
  includes('department: group.department,');
  includes('job: group.job,');
});

test('credit names are drawn as individual runs that record a texture-space rect each', () => {
  includes('function drawCreditRuns(');
  includes('regions.push({ x: cursorX, y: cursorY - 20, width: nameWidth, height: lineHeight, entry });');
  // Same visual metrics as the legacy joined string: x=242, maxWidth 710, lineHeight 27, 2 lines.
  includes('drawCreditRuns(context, entries, 242, y, 710, 27, 2, creditLayout.regions)');
});

test('every clickable name carries a 1px cream underline at ~.45 alpha', () => {
  includes('context.globalAlpha = 0.45;');
  includes('context.lineWidth = 1;');
  includes('context.moveTo(cursorX, cursorY + 4);');
  includes('context.lineTo(cursorX + nameWidth, cursorY + 4);');
});

test('a yellow [mais] chip is drawn at the end of the cast row and recorded', () => {
  includes('const chipLabel = ');
  includes("copy.moreCredits || 'mais'");
  includes("if (group.key === 'cast') {");
  includes('context.fillText(chipLabel, chipX, end.y);');
  includes('creditLayout.moreCredits = {');
});

test('the per-render creditRegions and moreCreditsRect feed the pointer-cursor hit test', () => {
  includes('let creditRegions = [];');
  includes('let moreCreditsRect = null;');
  includes('creditRegions = layout.regions;');
  includes('moreCreditsRect = layout.moreCredits;');
  includes('applyCreditLayout(drawBack(');
  includes('return creditLayout;');
  includes('for (const region of creditRegions) actions.push(region);');
  includes('if (moreCreditsRect) actions.push(moreCreditsRect);');
});

test('the click router dispatches credit names to onCreditPerson and the chip to onMoreCredits', () => {
  includes('onCreditPerson, onMoreCredits,');
  includes('const credit = creditRegions.find((region) => inside(region, x, y));');
  includes('if (credit) return onCreditPerson?.(credit.entry);');
  includes('if (moreCreditsRect && inside(moreCreditsRect, x, y)) return onMoreCredits?.();');
});

test('double-click treats credit rects as clickable instead of flipping the tape', () => {
  // doubleClick delegates to clickableActions(), which now includes the credit rects.
  includes('if (clickableActions().some((rect) => inside(rect, x, y))) return;');
});

test('groups without hydrated ids fall back to the legacy joined string with no chip', () => {
  includes('function creditEntries(');
  includes('if (!Array.isArray(source) || !source.length) return [];');
  includes('if (!source.every((entry) => entry && entry.id)) return [];');

  const branchStart = viewer.indexOf('if (entries.length) {');
  assert.notEqual(branchStart, -1, 'expected the per-group entries branch');
  const elseMarker = viewer.indexOf('} else {', branchStart);
  assert.notEqual(elseMarker, -1, 'expected the per-group fallback branch');

  const clickableBranch = viewer.slice(branchStart, elseMarker);
  assert.ok(clickableBranch.includes('creditLayout.moreCredits = {'), 'the chip belongs to the id-backed branch');

  const fallbackBranch = viewer.slice(elseMarker, elseMarker + 400);
  includes('y = wrappedText(context, names(title[group.fallbackKey], group.limit, copy.notListed), 242, y, 710, 27, 2) + 12;');
  assert.ok(fallbackBranch.includes('wrappedText(context, names('), 'the fallback keeps the joined-string draw');
  assert.ok(!fallbackBranch.includes('moreCredits ='), 'the fallback must not record a chip rect');
});
