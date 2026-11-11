// Asked 2026-11-11: a phone opened offline, changed, then back online must not
// overwrite what another device changed meanwhile -- "it will see that my
// phone is the latest and won't sync the true better sync?". Decided: keep
// both, as a conflict copy. Change these as decisions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadVerdict, conflictCopyName, deviceKind, readSeen, writeSeen } from '../src/utils/syncConflict.js';

test('a folder changed on another device since this one last saw it is not overwritten', () => {
  // Seen at 100; the computer changed it to 200; the phone, offline, to 300.
  assert.equal(uploadVerdict({ seen: 100, remoteModifiedAt: 200, localModifiedAt: 300 }), 'conflict');
});

test('a folder nobody else changed is uploaded as before', () => {
  assert.equal(uploadVerdict({ seen: 100, remoteModifiedAt: 100, localModifiedAt: 300 }), 'upload');
  assert.equal(uploadVerdict({ seen: null, remoteModifiedAt: 0, localModifiedAt: 300 }), 'upload', 'not in the cloud yet');
  assert.equal(uploadVerdict({ seen: 50, remoteModifiedAt: 300, localModifiedAt: 300 }), 'upload', 'the cloud has exactly this');
});

test('with nothing recorded yet, only a newer cloud copy counts as somebody else\'s work', () => {
  assert.equal(uploadVerdict({ seen: null, remoteModifiedAt: 400, localModifiedAt: 300 }), 'conflict');
  assert.equal(uploadVerdict({ seen: null, remoteModifiedAt: 200, localModifiedAt: 300 }), 'upload');
});

test('this device\'s version is kept as a folder named for where it came from', () => {
  const at = new Date(2026, 10, 11);
  assert.equal(conflictCopyName('Notes', [], { kind: 'phone', at }), 'Notes (from phone, 11 Nov)');
  assert.equal(conflictCopyName('Notes', ['Notes (from phone, 11 Nov)'], { kind: 'phone', at }), 'Notes (from phone, 11 Nov) 2');
  assert.ok(!/[.#$[\]/]/.test(conflictCopyName('Notes', [], { kind: 'computer', at })), 'a name the cloud can store');
  assert.equal(deviceKind({ nativeAndroid: true }), 'phone');
  assert.equal(deviceKind({ desktopApp: true }), 'computer');
});

test('what was seen is kept per account on this device, across restarts', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  writeSeen(storage, 'u1', { Notes: 100 });
  assert.deepEqual(readSeen(storage, 'u1'), { Notes: 100 });
  assert.deepEqual(readSeen(storage, 'u2'), {});
});
