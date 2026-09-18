import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  targetSize,
  fitsOnAnIntent,
  MAX_EDGE,
  MAX_DATA_URL_CHARS
} from '../src/utils/coverArtwork.js';

// Named after the report: "I also asked for the cover as background and we
// don't have it. Lark Player and other music players have it."
//
// It was not that the cover was drawn wrong -- it was never arriving. The cover
// travels to the notification as a string on an intent, everything on an intent
// goes through Binder, and Binder's buffer is about a megabyte for the whole
// process. Embedded album art is routinely 500KB to 1.5MB before base64 makes
// it a third larger, and nothing was resizing it.

test('a big cover is cut down to something that can be sent', () => {
  // The case that was failing: a well-tagged album's 1400px sleeve.
  const size = targetSize({ width: 1400, height: 1400 });
  assert.deepEqual(size, { width: MAX_EDGE, height: MAX_EDGE, resized: true });
});

test('a cover that is not square keeps its shape', () => {
  // Some covers are a scan of a sleeve rather than a square. Stretching those
  // is worse than leaving them be.
  const wide = targetSize({ width: 2000, height: 1000 });
  assert.deepEqual(wide, { width: 512, height: 256, resized: true });
  const tall = targetSize({ width: 1000, height: 2000 });
  assert.deepEqual(tall, { width: 256, height: 512, resized: true });
});

test('a small cover is left exactly as it is, never enlarged', () => {
  // Scaling up is the same picture with more bytes, which is the one thing
  // this is trying to avoid.
  assert.deepEqual(targetSize({ width: 300, height: 300 }), {
    width: 300,
    height: 300,
    resized: false
  });
  assert.equal(targetSize({ width: MAX_EDGE, height: MAX_EDGE }).resized, false, 'exactly at the cap');
});

test('a cover with no size to speak of is refused rather than guessed at', () => {
  assert.equal(targetSize({ width: 0, height: 500 }), null);
  assert.equal(targetSize({ width: NaN, height: NaN }), null);
  assert.equal(targetSize({ width: -10, height: -10 }), null);
  assert.equal(targetSize(), null);
});

test('the size limit leaves room for whatever else is in flight', () => {
  // The Binder budget is shared across the process, so the question is not
  // "does this one fit" but "does it fit alongside everything else", which
  // cannot be asked from here. Hence a ceiling well under the real one.
  assert.ok(MAX_DATA_URL_CHARS < 1_000_000, 'well under the Binder ceiling');
  assert.equal(fitsOnAnIntent('data:image/jpeg;base64,' + 'a'.repeat(1000)), true);
  assert.equal(fitsOnAnIntent('a'.repeat(MAX_DATA_URL_CHARS + 1)), false, 'the case that was losing it');
});

test('no cover at all is not something to send', () => {
  assert.equal(fitsOnAnIntent(''), false);
  assert.equal(fitsOnAnIntent(null), false);
  assert.equal(fitsOnAnIntent(undefined), false);
  assert.equal(fitsOnAnIntent({}), false);
});
