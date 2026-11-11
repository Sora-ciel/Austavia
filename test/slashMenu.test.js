import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slashAt, slashItems, stepChoice, slashSplit } from '../src/utils/slashMenu.js';

// Asked 2026-11-04: "i want the typing to insert a block and the if you want
// to add a block that already exist." -- "/" in the writing on a page opens
// one menu of new blocks and the folder's blocks not on the page yet.

test('typing "/" at the start of a line or after a space opens the menu, and the word after it filters', () => {
  assert.deepEqual(slashAt('/'), { query: '', length: 1 });
  assert.deepEqual(slashAt('Some words /tas'), { query: 'tas', length: 4 });
});

test('a "/" inside a date or a link does not', () => {
  assert.equal(slashAt('le 4/11'), null);
  assert.equal(slashAt('a/b'), null);
  assert.equal(slashAt('/task list'), null);
});

const types = [{ type: 'text', label: 'Text' }, { type: 'task', label: 'Task list' }, { type: 'clock', label: 'Clock' }];
const existing = [{ id: 'c', type: 'task', name: 'Courses' }, { id: 'k', type: 'clock', name: 'Clock, alarm 07:00' }];

test('the menu offers a new block of each kind, then the blocks already in the folder', () => {
  const ids = slashItems({ types, existing }).map(item => item.id);
  assert.deepEqual(ids, ['new:text', 'new:task', 'new:clock', 'block:c', 'block:k']);
});

test('what is typed after "/" matches a kind or a name, so an existing block is found by its name', () => {
  assert.deepEqual(slashItems({ query: 'task', types, existing }).map(i => i.id), ['new:task', 'block:c']);
  assert.deepEqual(slashItems({ query: 'cour', types, existing }).map(i => i.id), ['block:c']);
  assert.deepEqual(slashItems({ query: 'list', types, existing }).map(i => i.id), ['new:task', 'block:c']);
});

test('the arrows go round the menu', () => {
  assert.equal(stepChoice(2, 3, 'ArrowDown'), 0);
  assert.equal(stepChoice(0, 3, 'ArrowUp'), 2);
});

test('the block goes under the writing, over it, or between its two halves', () => {
  assert.equal(slashSplit({ beforeEmpty: false, afterEmpty: true }), 'below');
  assert.equal(slashSplit({ beforeEmpty: true, afterEmpty: false }), 'above');
  assert.equal(slashSplit({ beforeEmpty: false, afterEmpty: false }), 'split');
  // Alone in empty writing, it takes the line: the block above, the writing under it.
  assert.equal(slashSplit({ beforeEmpty: true, afterEmpty: true }), 'above');
});

// Reported 2026-11-11, on a phone: "the search and the block options don't
// put themselves somewhere where you can see them when the keyboard is up. it
// stays behind the keyboard making it impossible to choose".
import { menuPlacement } from '../src/utils/slashMenu.js';

test('with the phone keyboard up, the block menu goes where it can be seen, above the keyboard', () => {
  // A 800px tall window, the keyboard covering everything below 450.
  const view = { top: 0, bottom: 450, left: 0, right: 400 };
  const place = menuPlacement({ x: 20, y: 400, width: 260, height: 300, view });
  assert.ok(place.top + Math.min(300, place.maxHeight) <= 450, 'all of it above the keyboard');
  assert.ok(place.top >= 0);
});

test('with room under the caret it opens under it, as before', () => {
  const view = { top: 0, bottom: 800, left: 0, right: 1200 };
  assert.equal(menuPlacement({ x: 100, y: 200, width: 260, height: 300, view }).top, 206);
});

test('with room on neither side it takes the bigger one and its list scrolls', () => {
  const view = { top: 0, bottom: 300, left: 0, right: 400 };
  const place = menuPlacement({ x: 20, y: 150, width: 260, height: 340, view });
  assert.ok(place.maxHeight < 340);
  assert.ok(place.top >= 0 && place.top + place.maxHeight <= 300);
});
