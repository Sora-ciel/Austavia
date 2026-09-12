import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SNAP_TOLERANCE, snapToNeutral } from '../src/utils/sliderSnap.js';

// A 0–200 range has 201 values and about 118 pixels to put them in, so roughly
// two in five cannot be reached by dragging — and 100, the neutral, is one.
test('a drag that passes close to the neutral lands on it', () => {
  assert.equal(snapToNeutral(99, 100), 100);
  assert.equal(snapToNeutral(101, 100), 100);
  assert.equal(snapToNeutral(98, 100), 100);
  assert.equal(snapToNeutral(102, 100), 100);
});

test('values beyond the tolerance are left exactly where they are', () => {
  assert.equal(snapToNeutral(97, 100), 97);
  assert.equal(snapToNeutral(103, 100), 103);
  assert.equal(snapToNeutral(0, 100), 0);
  assert.equal(snapToNeutral(200, 100), 200);
});

// The arrow keys always could reach every value; this must not take that away.
test('keyboard input keeps every value, including the ones a drag snaps past', () => {
  for (const v of [98, 99, 101, 102]) {
    assert.equal(snapToNeutral(v, 100, { snapping: false }), v);
  }
});

test('the neutral itself is unchanged either way', () => {
  assert.equal(snapToNeutral(100, 100), 100);
  assert.equal(snapToNeutral(100, 100, { snapping: false }), 100);
});

test('the tolerance is adjustable, and exactly on the edge still snaps', () => {
  assert.equal(snapToNeutral(100 + SNAP_TOLERANCE, 100), 100);
  assert.equal(snapToNeutral(100 + SNAP_TOLERANCE + 1, 100), 100 + SNAP_TOLERANCE + 1);
  assert.equal(snapToNeutral(105, 100, { tolerance: 10 }), 100);
});

test('it works for any neutral, not just 100', () => {
  assert.equal(snapToNeutral(51, 50), 50);
  assert.equal(snapToNeutral(0, 0), 0);
  assert.equal(snapToNeutral(2, 0), 0);
});

test('nonsense is handed back rather than turned into a number', () => {
  assert.equal(snapToNeutral(undefined, 100), undefined);
  assert.equal(snapToNeutral('lots', 100), 'lots');
  assert.equal(snapToNeutral(120, undefined), 120);
});
