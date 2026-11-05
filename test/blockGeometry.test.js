import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_WIDTH,
  MIN_HEIGHT,
  canvasPoint,
  grabOffset,
  draggedPosition,
  resizedSize
} from '../src/utils/blockGeometry.js';

const mouse = (x, y) => ({ clientX: x, clientY: y });
const touch = (x, y) => ({ touches: [{ clientX: x, clientY: y }] });

test('a mouse event reads straight through at 100%', () => {
  assert.deepEqual(canvasPoint(mouse(200, 120), 1), { x: 200, y: 120 });
});

test('a touch is read from the first finger', () => {
  assert.deepEqual(canvasPoint(touch(200, 120), 1), { x: 200, y: 120 });
});

test('zoom is divided out, so the block stays under the pointer', () => {
  assert.deepEqual(canvasPoint(mouse(200, 120), 2), { x: 100, y: 60 });
});

test('a nonsense scale falls back to 1 rather than flinging the block away', () => {
  for (const bad of [0, -1, NaN, undefined, null, 'wide']) {
    assert.deepEqual(canvasPoint(mouse(200, 120), bad), { x: 200, y: 120 }, `scale ${bad}`);
  }
});

test('the block is held where it was grabbed, not by its corner', () => {
  const position = { x: 100, y: 100 };
  const offset = grabOffset(canvasPoint(mouse(130, 110), 1), position);
  assert.deepEqual(offset, { x: 30, y: 10 });

  // the pointer moves 50 right and 40 down; so does the block
  const moved = draggedPosition(canvasPoint(mouse(180, 150), 1), offset);
  assert.deepEqual(moved, { x: 150, y: 140 });
});

test('a block cannot be dragged off the top or left edge', () => {
  const moved = draggedPosition({ x: -80, y: -20 }, { x: 0, y: 0 });
  assert.deepEqual(moved, { x: 0, y: 0 });
});

test('resizing measures from where it began, not from the last frame', () => {
  const start = { x: 300, y: 200, width: 300, height: 200 };
  assert.deepEqual(resizedSize({ x: 400, y: 260 }, start), { width: 400, height: 260 });
  // jumping straight to the far corner gives the same answer as creeping there
  assert.deepEqual(resizedSize({ x: 500, y: 300 }, start), { width: 500, height: 300 });
});

test('a block cannot be shrunk past being usable', () => {
  const start = { x: 300, y: 200, width: 300, height: 200 };
  const tiny = resizedSize({ x: -500, y: -500 }, start);
  assert.deepEqual(tiny, { width: MIN_WIDTH, height: MIN_HEIGHT });
});

test('a block type may ask for a larger floor of its own', () => {
  const start = { x: 0, y: 0, width: 300, height: 200 };
  const out = resizedSize({ x: -900, y: -900 }, start, { minWidth: 240, minHeight: 160 });
  assert.deepEqual(out, { width: 240, height: 160 });
});

import { aspectSize } from '../src/utils/blockGeometry.js';

test('a picture block keeps the picture\'s shape as it is resized, with the header on top', () => {
  assert.deepEqual(aspectSize(400, 2, 30), { width: 400, height: 230 });
  assert.equal(aspectSize(30, 4, 30), null);
});
