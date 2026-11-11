// Asked 2026-11-11: "in canvas and other places where there's no need for a
// double click need a double click to open the lightbox, for consistency of
// ux". A picture opens in the viewer on a double-click, or a double tap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDoubleTap, DOUBLE_TAP_MS } from '../src/utils/doubleTap.js';

test('a picture opens on the second of two quick taps, not on one', () => {
  const taps = new Map();
  assert.equal(isDoubleTap(taps, 'a', 1000), false, 'one tap only selects it');
  assert.equal(isDoubleTap(taps, 'a', 1000 + DOUBLE_TAP_MS - 1), true);
  assert.equal(isDoubleTap(taps, 'a', 1000 + DOUBLE_TAP_MS + 50), false, 'a third tap starts again');
});

test('two taps too far apart, or on two pictures, are two single taps', () => {
  const taps = new Map();
  isDoubleTap(taps, 'a', 0);
  assert.equal(isDoubleTap(taps, 'a', DOUBLE_TAP_MS + 1), false);
  isDoubleTap(taps, 'b', 5000);
  assert.equal(isDoubleTap(taps, 'c', 5100), false);
});
