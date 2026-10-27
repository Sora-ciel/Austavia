import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Asked 2026-10-26: "use the least amount of different code when two things
// use the same thing" (CLAUDE.md, "One of everything"). Reordering a list --
// the handle, press-and-hold, the drop line -- exists once, in
// utils/listReorder.js, and every list that can be reordered uses it. Task
// mode had its own copy until the habit tracker needed the same thing.

const REORDERABLE = ['Modes/TaskMode.svelte', 'Modes/HabitTrackerMode.svelte', 'components/TaskBlock.svelte'];
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('every reorderable list uses the one shared drag, not a copy of its own', () => {
  for (const path of REORDERABLE) {
    const source = read(path);
    assert.match(source, /createListReorder\(/, `${path} uses listReorder.js`);
    // The signs of a reorder of its own: finding the item under the pointer,
    // or working out a drop slot or "before/after" itself. (A block may still
    // track the pointer to move the whole block -- that is not reordering.)
    assert.doesNotMatch(source, /elementFromPoint\(|dropSlot\(|dragOverPos|reorderTask\(/, `${path} reorders by itself`);
    assert.doesNotMatch(source, /^\s*\.drop-line\s*\{/m, `${path} draws its own drop line`);
  }
});

test('the drop line is drawn in the text colour of the list it is in', () => {
  const css = read('app.css');
  const rule = css.slice(css.indexOf('.drop-line {'), css.indexOf('}', css.indexOf('.drop-line {')));
  assert.match(rule, /background:\s*currentColor/);
});
