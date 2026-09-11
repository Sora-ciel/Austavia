import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STALL_LIMIT_MS, stalledLocks, anyHeld } from '../src/utils/syncLocks.js';

const NOW = 1_000_000_000_000;
const agoMs = (ms) => NOW - ms;

test('a lock nobody holds is never stale', () => {
  assert.deepEqual(stalledLocks({ upload: null, download: undefined }, NOW), []);
});

test('a lock that just reported progress is left alone', () => {
  assert.deepEqual(stalledLocks({ upload: agoMs(1000) }, NOW), []);
});

// The whole point: a long upload that keeps moving must not be interrupted.
test('an upload that keeps reporting progress is never taken away from', () => {
  // held for an hour, but it said something a second ago
  assert.deepEqual(stalledLocks({ upload: agoMs(1000) }, NOW), [], 'still working');
});

test('a lock that stopped moving past the limit is released', () => {
  assert.deepEqual(stalledLocks({ upload: agoMs(STALL_LIMIT_MS) }, NOW), ['upload']);
  assert.deepEqual(stalledLocks({ upload: agoMs(STALL_LIMIT_MS + 60_000) }, NOW), ['upload']);
});

test('just under the limit is still given the benefit of the doubt', () => {
  assert.deepEqual(stalledLocks({ upload: agoMs(STALL_LIMIT_MS - 1) }, NOW), []);
});

test('each lock is judged on its own', () => {
  const stalled = stalledLocks(
    { upload: agoMs(STALL_LIMIT_MS + 1), download: agoMs(500), bootstrap: null },
    NOW
  );
  assert.deepEqual(stalled, ['upload']);
});

// A phone whose clock jumped is not evidence that sync is stuck.
test('a timestamp in the future is not treated as stale', () => {
  assert.deepEqual(stalledLocks({ upload: NOW + 60_000 }, NOW), []);
});

test('nonsense timestamps are ignored rather than acted on', () => {
  assert.deepEqual(stalledLocks({ upload: NaN, download: 'soon' }, NOW), []);
});

test('nothing throws on an empty or missing map', () => {
  assert.deepEqual(stalledLocks(), []);
  assert.deepEqual(stalledLocks(null, NOW), []);
  assert.deepEqual(stalledLocks({}, NOW), []);
});

test('anyHeld reports whether sync is busy at all', () => {
  assert.equal(anyHeld({ upload: null, download: null }), false);
  assert.equal(anyHeld({ upload: NOW }), true);
  assert.equal(anyHeld({}), false);
  assert.equal(anyHeld(), false);
});
