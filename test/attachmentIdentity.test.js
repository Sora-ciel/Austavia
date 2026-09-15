import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dataUrlFingerprint, attachmentKey, SAMPLE } from '../src/utils/attachmentIdentity.js';

// Named after what was found: a picture pasted into a note is held as base64
// inside the writing, and every save while typing decoded all three megabytes
// of it and hashed every character — only to conclude it had already been
// uploaded. Six times in seventy seconds, in a log taken while somebody wrote a
// few sentences.

const picture = (body, type = 'image/png') => `data:${type};base64,${body}`;

test('the same picture is recognised without reading all of it', () => {
  const big = picture('A'.repeat(3_000_000));
  assert.equal(dataUrlFingerprint(big), dataUrlFingerprint(big));
});

test('two pictures of different sizes are never confused', () => {
  const a = picture('A'.repeat(1000));
  const b = picture('A'.repeat(1001));
  assert.notEqual(dataUrlFingerprint(a), dataUrlFingerprint(b));
});

test('two pictures of the same size that differ at the end are told apart', () => {
  // The end is sampled as well as the start precisely for this: base64 headers
  // are near-identical between two photographs of the same kind.
  const a = picture('A'.repeat(1000) + 'X'.repeat(SAMPLE));
  const b = picture('A'.repeat(1000) + 'Y'.repeat(SAMPLE));
  assert.notEqual(dataUrlFingerprint(a), dataUrlFingerprint(b));
});

test('two pictures of the same size that differ at the start are told apart', () => {
  const a = picture('X'.repeat(SAMPLE) + 'A'.repeat(1000), 'image/png');
  const b = picture('Y'.repeat(SAMPLE) + 'A'.repeat(1000), 'image/png');
  assert.notEqual(dataUrlFingerprint(a), dataUrlFingerprint(b));
});

test('a picture and a different kind of file are told apart', () => {
  const a = picture('AAAA', 'image/png');
  const b = picture('AAAA', 'image/gif');
  assert.notEqual(dataUrlFingerprint(a), dataUrlFingerprint(b));
});

test('anything that is not a picture is not keyed at all', () => {
  // The caller falls through to the slow, exact path, which is the safe
  // direction to be wrong in.
  assert.equal(dataUrlFingerprint('https://example.com/cat.png'), null);
  assert.equal(dataUrlFingerprint(''), null);
  assert.equal(dataUrlFingerprint(null), null);
  assert.equal(dataUrlFingerprint(undefined), null);
  assert.equal(dataUrlFingerprint(12345), null);
});

test('a short picture is keyed by the whole of itself', () => {
  // slice(-64) of a short string is the whole string, which is correct rather
  // than a special case: nothing is missed.
  const tiny = picture('AB');
  assert.equal(dataUrlFingerprint(tiny), `${tiny.length}:${tiny}:${tiny}`);
});

test('the same picture in two places is two attachments, as it was before', () => {
  // Uploads are stored per file, per block and per field. Keying the memory the
  // same way keeps this a speed-up rather than a change in what is uploaded
  // where — the same photograph in two notes still gets two objects.
  const same = picture('A'.repeat(500));
  assert.notEqual(
    attachmentKey('users/u/attachments/Arial/block-1/content', same),
    attachmentKey('users/u/attachments/Arial/block-2/content', same)
  );
  assert.equal(
    attachmentKey('users/u/attachments/Arial/block-1/content', same),
    attachmentKey('users/u/attachments/Arial/block-1/content', same)
  );
});

test('a key is refused rather than guessed when there is no picture', () => {
  assert.equal(attachmentKey('somewhere', 'not a data url'), null);
  assert.equal(attachmentKey('somewhere', null), null);
});
