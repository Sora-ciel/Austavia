// Asked 2026-11-17: "the pictures that aren't used anymore should be cleaned
// up, no? why would we keep them?" (src/utils/pictureCleanup.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { picturesToDelete, PICTURE_GRACE_MS } from '../src/utils/pictureCleanup.js';

const NOW = Date.UTC(2026, 10, 17);
const OLD = NOW - 3 * PICTURE_GRACE_MS;

test('a picture nothing uses any more is deleted', () => {
  assert.deepEqual(picturesToDelete({ stored: [{ hash: 'gone', at: OLD }], inUse: new Set(), now: NOW }), ['gone']);
});

test('a picture still used anywhere -- a folder, the bin, a kept copy, the undo history -- stays', () => {
  assert.deepEqual(picturesToDelete({ stored: [{ hash: 'used', at: OLD }], inUse: new Set(['used']), now: NOW }), []);
});

test('a picture stored in the last day is left alone, in case it is being pasted or uploaded', () => {
  assert.deepEqual(picturesToDelete({ stored: [{ hash: 'new', at: NOW - 1000 }], inUse: new Set(), now: NOW }), []);
});

test('a picture whose storing time is unknown counts as old', () => {
  assert.deepEqual(picturesToDelete({ stored: [{ hash: 'legacy', at: 0 }], inUse: new Set(), now: NOW }), ['legacy']);
});
