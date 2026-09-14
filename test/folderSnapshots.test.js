import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_SNAPSHOTS,
  MAX_SNAPSHOT_BYTES,
  sizeOf,
  characterCountOf,
  worthKeeping,
  sameContent,
  snapshotOf,
  withSnapshot,
  describeSnapshot
} from '../src/utils/folderSnapshots.js';

// Named after the request, which followed a folder reverting to a version from
// half an hour earlier: "before a download overwrites a folder, keep the copy
// it replaced" — so that the answer to a sync going wrong is Restore, rather
// than a message asking whether anything can be done at all.

const folder = (texts, modifiedAt = 1000) => ({
  blocks: texts.map((content, index) => ({ id: `b${index}`, type: 'text', content })),
  modeOrders: {},
  updatedAt: modifiedAt,
  modifiedAt
});

test('a folder about to be replaced from the cloud is kept first', () => {
  const current = folder(['an afternoon of writing']);
  const incoming = folder(['the old version']);
  assert.equal(worthKeeping({ current, incoming }), true);
});

test('a download carrying what is already here keeps nothing', () => {
  // This is the ordinary case. Another device restamps without changing
  // anything and the copy comes back down; snapshotting that would push the
  // copies that matter off the end of the list.
  const current = folder(['the same words']);
  const incoming = folder(['the same words'], 9999);
  assert.equal(worthKeeping({ current, incoming }), false);
});

test('two copies are the same when their blocks are, whatever the stamps say', () => {
  // The stamp is the thing that went wrong in the first place, so it is the
  // one field that must not decide this.
  assert.equal(sameContent(folder(['x'], 1), folder(['x'], 500000)), true);
  assert.equal(sameContent(folder(['x']), folder(['y'])), false);
  assert.equal(sameContent(folder(['x']), folder(['x', 'y'])), false);
});

test('the first download onto an empty device replaces nothing', () => {
  // Signing in on a new machine is not a loss, and a snapshot of nothing would
  // be a confusing thing to be offered.
  assert.equal(worthKeeping({ current: folder([]), incoming: folder(['hello']) }), false);
  assert.equal(worthKeeping({ current: null, incoming: folder(['hello']) }), false);
  assert.equal(worthKeeping({}), false);
  assert.equal(worthKeeping(), false);
});

test('a snapshot says enough to pick it out of a list without opening it', () => {
  const snap = snapshotOf(folder(['twelve chars', 'more here']), { takenAt: 4242 });
  assert.equal(snap.takenAt, 4242);
  assert.equal(snap.blockCount, 2);
  assert.equal(snap.characterCount, 'twelve chars'.length + 'more here'.length);
  assert.ok(snap.bytes > 0);
  assert.equal(snap.modifiedAt, 1000, 'and where the copy came from');
});

test('the newest replaced copy is the first one offered', () => {
  let list = [];
  for (const takenAt of [100, 200, 300]) {
    list = withSnapshot(list, snapshotOf(folder([`v${takenAt}`]), { takenAt }));
  }
  assert.deepEqual(list.map((s) => s.takenAt), [300, 200, 100]);
});

test('only so many are kept, and it is the oldest that goes', () => {
  let list = [];
  for (let i = 1; i <= MAX_SNAPSHOTS + 5; i += 1) {
    list = withSnapshot(list, snapshotOf(folder([`v${i}`]), { takenAt: i * 10 }));
  }
  assert.equal(list.length, MAX_SNAPSHOTS);
  assert.equal(list[0].takenAt, (MAX_SNAPSHOTS + 5) * 10, 'the newest is still there');
  assert.equal(list.at(-1).takenAt, 60, 'and the five oldest are gone');
});

test('a folder full of pictures cannot fill the disk with its own history', () => {
  // Pictures are stored inline, so ten copies of a photo album is tens of
  // megabytes — enough for a browser to start evicting the whole database,
  // which would take the folders themselves with it.
  const heavy = (takenAt) => ({
    takenAt,
    bytes: MAX_SNAPSHOT_BYTES / 3,
    blockCount: 1,
    characterCount: 0,
    payload: {}
  });
  let list = [];
  for (const takenAt of [1, 2, 3, 4, 5]) list = withSnapshot(list, heavy(takenAt));

  assert.ok(list.length < 5, 'the budget bit before the count did');
  const used = list.reduce((total, s) => total + s.bytes, 0);
  assert.ok(used <= MAX_SNAPSHOT_BYTES, `${used} is over the budget`);
  assert.equal(list[0].takenAt, 5, 'and what survives is the newest');
});

test('a folder bigger than the whole budget is still kept once', () => {
  // Otherwise the one folder with the most to lose is the only one with no
  // protection at all.
  const huge = { takenAt: 7, bytes: MAX_SNAPSHOT_BYTES * 4, blockCount: 1, characterCount: 0 };
  const list = withSnapshot([], huge);
  assert.deepEqual(list.map((s) => s.takenAt), [7]);
});

test('something that will not serialise is treated as large, not as free', () => {
  const circular = {};
  circular.self = circular;
  assert.equal(sizeOf(circular), MAX_SNAPSHOT_BYTES);
  assert.equal(sizeOf(undefined), 4, 'and null serialises to four characters');
});

test('the writing in a folder is counted across its blocks', () => {
  assert.equal(characterCountOf(folder(['abc', 'de'])), 5);
  assert.equal(characterCountOf({ blocks: [{ id: 'a' }] }), 0, 'a block with no text counts nothing');
  assert.equal(characterCountOf(null), 0);
});

test('what the list needs is numbers, not a sentence', () => {
  // The wording belongs to whatever is showing it, which is the only thing
  // that knows the language and the width it has.
  const described = describeSnapshot(snapshotOf(folder(['abcd']), { takenAt: 99 }));
  assert.deepEqual(Object.keys(described).sort(), [
    'blockCount',
    'bytes',
    'characterCount',
    'takenAt'
  ]);
  assert.equal(described.characterCount, 4);
});
