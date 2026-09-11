import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nestedScrollerTakesWheel } from '../src/utils/scrollOwnership.js';

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
