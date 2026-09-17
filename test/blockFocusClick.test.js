import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldPlaceCaret, pointIsInside } from '../src/utils/blockFocusClick.js';

// Named after the request: "before, when we put a block text in focus it also
// put the caret at the same time, but now we need to click two times to get
// those two actions. I want those things to happen in one click, it's more
// natural."

const writing = { left: 100, top: 100, right: 400, bottom: 300 };

test('one click focuses the block and puts the caret in it', () => {
  assert.equal(shouldPlaceCaret({ wasFocused: false, insideWriting: true }), true);
});

test('a block that was already focused is left to the browser', () => {
  // Selections, double-click to select a word, dragging across text — all of it
  // belongs to the browser once the writing is reachable, and putting a caret
  // wherever the last click was would override every one of them.
  assert.equal(shouldPlaceCaret({ wasFocused: true, insideWriting: true }), false);
});

test('picking a block up and putting it down does not start a sentence', () => {
  // A drag is a move, not a place.
  assert.equal(shouldPlaceCaret({ wasFocused: false, insideWriting: true, dragged: true }), false);
});

test('clicking the frame or the header focuses without a caret', () => {
  // Those are chrome: the click is about the block, not about its writing.
  assert.equal(shouldPlaceCaret({ wasFocused: false, insideWriting: false }), false);
  assert.equal(shouldPlaceCaret({}), false);
  assert.equal(shouldPlaceCaret(), false);
});

test('a click lands on the writing when it is inside the writing', () => {
  assert.equal(pointIsInside({ x: 200, y: 200 }, writing), true);
  assert.equal(pointIsInside({ x: 100, y: 100 }, writing), true, 'the edges count');
  assert.equal(pointIsInside({ x: 400, y: 300 }, writing), true);
});

test('a click outside the writing is outside it', () => {
  assert.equal(pointIsInside({ x: 99, y: 200 }, writing), false);
  assert.equal(pointIsInside({ x: 200, y: 99 }, writing), false);
  assert.equal(pointIsInside({ x: 401, y: 200 }, writing), false);
  assert.equal(pointIsInside({ x: 200, y: 301 }, writing), false);
});

test('a point or a box that is not one answers no', () => {
  // A block with no writing in it at all, or a click with no coordinates —
  // neither is a reason to guess.
  assert.equal(pointIsInside(null, writing), false);
  assert.equal(pointIsInside({ x: 200, y: 200 }, null), false);
  assert.equal(pointIsInside({ x: NaN, y: 200 }, writing), false);
  assert.equal(pointIsInside(), false);
});
