import { test } from 'node:test';
import assert from 'node:assert/strict';

import { owesUpload, shouldTakeCloudCopy, receivedFromCloud } from '../src/utils/syncOwing.js';

// The refusal itself was asked for and is load-bearing: work done here and not
// yet sent must not be thrown away for a copy that merely carries a later
// stamp. That is how a block moved twice went back to where the first move put
// it. Do not delete these because the guard "looks unnecessary".
//
// The deadlock below is what the guard did when it was only half written.

test('unsent work is not thrown away for a newer cloud copy', () => {
  // The original rule, in the words it was asked in.
  assert.equal(
    shouldTakeCloudCopy({
      hasLocalCopy: true,
      lastSent: 1000,
      localUpdatedAt: 2000, // typed since the last upload
      localModifiedAt: 2000,
      remoteModifiedAt: 5000
    }),
    false
  );
});

test('a folder just taken from the cloud does not look like unsent work', () => {
  // The deadlock. A download changes the local stamp, and when nothing records
  // that the cloud already has that copy, the two numbers disagree for ever:
  // every later copy is refused as unsent work that does not exist, and nothing
  // clears it because there is genuinely nothing to upload.
  //
  // Nine refusals over a hundred seconds, in the log this came from, while the
  // other device carried on writing.
  const downloaded = { updatedAt: 4242 };
  const lastSent = receivedFromCloud(downloaded);

  assert.equal(owesUpload({ lastSent, localUpdatedAt: 4242 }), false);
  assert.equal(
    shouldTakeCloudCopy({
      hasLocalCopy: true,
      lastSent,
      localUpdatedAt: 4242,
      localModifiedAt: 4242,
      remoteModifiedAt: 9999
    }),
    true,
    'and the next copy from the cloud is taken rather than refused for ever'
  );
});

test('typing after a download owes an upload again', () => {
  const lastSent = receivedFromCloud({ updatedAt: 4242 });
  assert.equal(owesUpload({ lastSent, localUpdatedAt: 5000 }), true);
});

test('a device that has never sent or received owes nothing', () => {
  // Blocking here would stop a fresh sign-in ever receiving anything.
  assert.equal(owesUpload({ lastSent: undefined, localUpdatedAt: 5000 }), false);
  assert.equal(owesUpload({ localUpdatedAt: 5000 }), false);
  assert.equal(owesUpload(), false);
});

test('a device with no copy of a folder takes one whatever the stamps say', () => {
  assert.equal(
    shouldTakeCloudCopy({ hasLocalCopy: false, remoteModifiedAt: 1, localModifiedAt: 9999 }),
    true
  );
});

test('an older cloud copy is left alone', () => {
  assert.equal(
    shouldTakeCloudCopy({
      hasLocalCopy: true,
      lastSent: 3000,
      localUpdatedAt: 3000,
      localModifiedAt: 3000,
      remoteModifiedAt: 2000
    }),
    false
  );
});

test('an identical stamp is not newer', () => {
  assert.equal(
    shouldTakeCloudCopy({
      hasLocalCopy: true,
      lastSent: 3000,
      localUpdatedAt: 3000,
      localModifiedAt: 3000,
      remoteModifiedAt: 3000
    }),
    false
  );
});

test('a payload with no stamp records zero rather than NaN', () => {
  // NaN never equals itself, which would put the deadlock straight back.
  assert.equal(receivedFromCloud({}), 0);
  assert.equal(receivedFromCloud(null), 0);
  assert.equal(receivedFromCloud(), 0);
  assert.equal(owesUpload({ lastSent: 0, localUpdatedAt: 0 }), false);
});
