import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Reported 2026-10-28: "in Single Note mode the checkmark squares don't work."
// They worked; they could not be seen. Checkboxes were drawn in the scrollbar's
// colour (--sb-thumb), and Single Note fades its scrollbar out by setting that
// to transparent whenever nobody is scrolling. A checkbox is a mark beside
// writing, so it takes the writing's colour -- CLAUDE.md's pairing -- and never
// a variable something else is allowed to fade.

const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
const checkboxRules = [...css.matchAll(/input\[type="checkbox"\][^{]*\{[^}]*\}/g)].map(m => m[0]);

test('a checkbox in a note can always be seen: it does not borrow the scrollbar\'s fading colour', () => {
  assert.ok(checkboxRules.length >= 3);
  for (const rule of checkboxRules) assert.doesNotMatch(rule, /--sb-thumb|--sb-track/, rule.split('{')[0]);
});

test('a checkbox is drawn in the colour of the writing beside it', () => {
  const box = checkboxRules.find(rule => /appearance:\s*none/.test(rule));
  assert.match(box, /border:[^;]*currentColor/);
});
