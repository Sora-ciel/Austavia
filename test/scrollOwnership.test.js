import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nestedScrollerTakesWheel, canvasMustTakeWheel } from '../src/utils/scrollOwnership.js';

// These tests are named after what was asked for, not after how it is built.
// The rule they cover was requested, shipped on 2026-05-18, and deleted on
// 2026-08-26 because it looked like the cause of a different problem. Nothing
// failed when it went. If you are here because one of these is red, the rule is
// wanted — it is not an accident of the implementation, and it was reasoned away
// once already.

test('a block only takes the scroll while it is focused', () => {
  assert.equal(
    nestedScrollerTakesWheel({ scroller: true, insideBlock: true, blockFocused: true }),
    true
  );
});

test('an unfocused block lets the canvas scroll instead', () => {
  assert.equal(
    nestedScrollerTakesWheel({ scroller: true, insideBlock: true, blockFocused: false }),
    false,
    'otherwise every block is a hole in the canvas and the board cannot be moved'
  );
});

test('a scroller that belongs to no block always keeps the wheel', () => {
  assert.equal(
    nestedScrollerTakesWheel({ scroller: true, insideBlock: false, blockFocused: false }),
    true,
    "a mode's own panel has no block to belong to"
  );
});

test('nothing scrollable under the pointer means the canvas scrolls', () => {
  assert.equal(nestedScrollerTakesWheel({ scroller: false }), false);
  assert.equal(
    nestedScrollerTakesWheel({ scroller: false, insideBlock: true, blockFocused: true }),
    false,
    'a focused block with nothing to scroll must not swallow the gesture'
  );
});

test('called with nothing, the canvas keeps the wheel', () => {
  assert.equal(nestedScrollerTakesWheel(), false);
  assert.equal(nestedScrollerTakesWheel(undefined), false);
});

// Refusing is not the same as being obeyed. The browser's default is to scroll
// whatever is under the pointer, so the canvas has to take the gesture itself
// or the block it just refused gets it anyway — which is how "a block only
// takes the scroll while it is focused" stayed broken with these tests green.

test('a block that was refused the scroll does not get it from the browser', () => {
  assert.equal(
    canvasMustTakeWheel({ scroller: true, insideBlock: true, blockFocused: false }),
    true
  );
});

test('a block that is allowed the scroll is left to scroll itself', () => {
  assert.equal(
    canvasMustTakeWheel({ scroller: true, insideBlock: true, blockFocused: true }),
    false
  );
});

test("a mode's own panel keeps the browser's scrolling, inertia and all", () => {
  assert.equal(canvasMustTakeWheel({ scroller: true, insideBlock: false }), false);
});

test('with nothing scrollable under the pointer the canvas need not step in', () => {
  assert.equal(canvasMustTakeWheel({ scroller: false }), false);
  assert.equal(canvasMustTakeWheel(), false);
});
