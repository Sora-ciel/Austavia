import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dropSlot, dropLineY, moveToSlot } from '../src/utils/dropPlacement.js';

// Asked 2026-10-26, Task mode: "when you're past the middle height of a note
// it should already register that the task is going to be put below or above
// ... and puts a line ... in the middle of two tasks or below the last task.
// A big line that is right in the middle of them."

// Three tasks, 40px tall with 6px gaps: 0-40, 46-86, 92-132.
const rects = [
  { top: 0, bottom: 40 },
  { top: 46, bottom: 86 },
  { top: 92, bottom: 132 }
];

test('past the middle of a task, the slot is already below it', () => {
  assert.equal(dropSlot(rects, 19), 0);
  assert.equal(dropSlot(rects, 21), 1);
});

test('in the gap between two tasks there is still a slot, not nothing', () => {
  assert.equal(dropSlot(rects, 43), 1);
});

test('below the last task is a slot of its own', () => {
  assert.equal(dropSlot(rects, 500), 3);
  assert.equal(dropSlot(rects, -50), 0);
});

test('the line sits right in the middle of the two tasks it falls between', () => {
  assert.equal(dropLineY(rects, 1, 6), 43);
  assert.equal(dropLineY(rects, 2, 6), 89);
});

test('above the first or below the last, it sits half a gap outside', () => {
  assert.equal(dropLineY(rects, 0, 6), -3);
  assert.equal(dropLineY(rects, 3, 6), 135);
  assert.equal(dropLineY([], 0, 6), null);
});

const list = ['a', 'b', 'c', 'd'].map(id => ({ id }));

test('dropping into a slot moves the task there and nothing else', () => {
  const group = list.filter(t => t.id !== 'a');
  assert.deepEqual(moveToSlot(list, 'a', group, 2).map(t => t.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveToSlot(list, 'a', group, 3).map(t => t.id), ['b', 'c', 'd', 'a']);
  assert.deepEqual(moveToSlot(list, 'd', list.filter(t => t.id !== 'd'), 0).map(t => t.id), ['d', 'a', 'b', 'c']);
});

test('dropping a task back where it was changes nothing', () => {
  const group = list.filter(t => t.id !== 'b');
  assert.equal(moveToSlot(list, 'b', group, 1), list);
});

test('a task only moves among its own kind: done tasks keep their places around it', () => {
  const mixed = [{ id: 'a' }, { id: 'x', done: true }, { id: 'b' }, { id: 'c' }];
  const todo = mixed.filter(t => !t.done && t.id !== 'c');
  assert.deepEqual(moveToSlot(mixed, 'c', todo, 0).map(t => t.id), ['c', 'a', 'x', 'b']);
});
