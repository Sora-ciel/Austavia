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
