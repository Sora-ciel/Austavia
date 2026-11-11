// Measured 2026-11-11: the thirty-second backstop -- every open device reading
// the whole index -- was about nine tenths of the database's downloads. Asked
// the same day to make it cheap before anything else. It must still find what
// the live subscription misses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backstopNeedsFullRead, FULL_READ_EVERY_MS } from '../src/utils/syncBackstop.js';

test('a quiet cloud costs one small number every thirty seconds, not the whole index', () => {
  assert.equal(backstopNeedsFullRead({ stamp: 100, lastStamp: 100, lastFullReadAt: 0, now: 60_000 }), false);
});

test('a change anywhere in the index -- the stamp moved -- is read in full at once', () => {
  assert.equal(backstopNeedsFullRead({ stamp: 200, lastStamp: 100, lastFullReadAt: 0, now: 60_000 }), true);
});

test('a stamp that is missing or was never written is no reason to stop looking', () => {
  assert.equal(backstopNeedsFullRead({ stamp: null, lastStamp: null, lastFullReadAt: 0, now: 60_000 }), true);
});

test('and the whole index is read every ten minutes regardless, in case a stamp was lost', () => {
  assert.equal(backstopNeedsFullRead({ stamp: 100, lastStamp: 100, lastFullReadAt: 0, now: FULL_READ_EVERY_MS }), true);
});
