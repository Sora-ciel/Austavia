import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canvasExtent } from '../src/utils/canvasFit.js';
import { draggedPosition } from '../src/utils/blockGeometry.js';

// Reported 2026-10-26, Canvas mode: "a block shouldn't be able to go farther
// than the screen's left. It shouldn't be able to go out of the canvas, like
// it does when you put it on top -- it doesn't go further."

const block = (x, y = 0, width = 200, height = 100) => ({ position: { x, y }, size: { width, height } });
const opts = { marginLeft: 5, marginRight: 5, marginBottom: 20, minWidth: 0, minHeight: 0 };

test('a block cannot go past the left edge, as it cannot go past the top', () => {
  // The furthest left a drag can put a block is x = 0; on screen that is the
  // margin, never less -- whatever else is on the board.
  const { x } = draggedPosition({ x: -300, y: 50 }, { x: 0, y: 0 });
  assert.equal(x, 0);
  for (const others of [[], [block(40)], [block(400), block(900)]]) {
    const { offsetX } = canvasExtent([block(x), ...others], opts);
    assert.ok(x + offsetX >= 0, `drawn at ${x + offsetX}`);
  }
});

test('the board is not slid left to hide empty space, as it is not slid up', () => {
  // The old rule moved the board 35px left here, putting x = 0 off screen.
  assert.equal(canvasExtent([block(40)], opts).offsetX, 5);
  assert.equal(canvasExtent([block(0, 300)], opts).height, 420);
});

test('a block an older build left at a negative x is moved back into reach', () => {
  const { offsetX, width } = canvasExtent([block(-60), block(100)], opts);
  assert.equal(offsetX, 65);
  assert.equal(width, 100 + 200 + 65 + 5);
});

test('an empty board is the minimum size, unshifted', () => {
  assert.deepEqual(canvasExtent([], { minWidth: 1080, minHeight: 320 }), { width: 1080, height: 320, offsetX: 0 });
});
