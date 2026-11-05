import { test } from 'node:test';
import assert from 'node:assert/strict';

import { saveChangesNothing } from '../src/utils/saveScheduling.js';

// Reported 2026-11-04: "the new file in the controls doesn't seem to work -- I
// tried writing 'aceuil' and pressing OK and it didn't create the file." An
// empty new folder looked the same as the empty answer storage gives for a
// name it has never seen, so its save was skipped as "nothing changed".

test('a new folder is written even though it is empty', () => {
  assert.equal(saveChangesNothing({ stored: false, before: 'empty', after: 'empty' }), false);
});

test('a stored folder saved unchanged is still left alone', () => {
  assert.equal(saveChangesNothing({ stored: true, before: 'same', after: 'same' }), true);
  assert.equal(saveChangesNothing({ stored: true, before: 'a', after: 'b' }), false);
});
