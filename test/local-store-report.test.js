// What the diagnostics say about the local database.
//
// Written after a packaged desktop build came back with every imported track
// gone while the notes and the sign-in were still there. That symptom has
// three quite different causes and they are indistinguishable from outside the
// machine, which is the whole reason this exists:
//
//   - the database would not open, so *nothing* local is readable and the
//     notes only look fine because they came back from the cloud;
//   - the index went but the audio did not, which is recoverable;
//   - the store is genuinely empty, which is not.
//
// Music is the only thing in that database that is never uploaded, so losing
// everything local looks exactly like losing only the music. That is the trap
// these lines are here to spring.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { describeLocalStore } from '../src/utils/diagnostics.js';

const healthy = {
  name: 'codex-db',
  expectedVersion: 8,
  versionOnDisk: 8,
  stores: ['blocks', 'block-files', 'music-library', 'folder-snapshots'],
  counts: { blocks: 12, 'block-files': 40, 'music-library': 260, 'folder-snapshots': 3 },
  audioKeys: 129,
  coverKeys: 130,
  hasLibraryIndex: true,
  error: null
};

const joined = store => describeLocalStore(store).join('\n');

describe('describeLocalStore', () => {
  it('says nothing at all when there is nothing to report', () => {
    assert.deepEqual(describeLocalStore(null), []);
  });

  it('reports what each store holds', () => {
    const text = joined(healthy);

    assert.match(text, /codex-db v8 \(build expects v8\)/);
    assert.match(text, /blocks 12/);
    assert.match(text, /music-library 260/);
    assert.match(text, /129 audio, 130 cover\(s\), index present/);
  });

  // The recoverable case, and the reason to count keys rather than trust the
  // library's own list of itself.
  it('says so when the audio is still there and only the list is gone', () => {
    const text = joined({ ...healthy, hasLibraryIndex: false });

    assert.match(text, /NO index/);
    assert.match(text, /still here and only the list of it is missing — recoverable/);
  });

  it('distinguishes a list with no files behind it', () => {
    const text = joined({ ...healthy, audioKeys: 0, coverKeys: 0 });

    assert.match(text, /the list is here and the audio is not/);
    assert.ok(!/recoverable/.test(text), 'that one is not recoverable and must not say it is');
  });

  it('claims nothing either way when the store is simply empty', () => {
    const text = joined({ ...healthy, audioKeys: 0, coverKeys: 0, hasLibraryIndex: false });

    assert.ok(!/recoverable/.test(text));
    assert.ok(!/audio is not/.test(text));
  });

  // The important one. If the database will not open, everything below it is
  // meaningless and the notes on screen are the cloud's, not the disk's.
  it('says plainly when the database would not open', () => {
    const text = joined({
      ...healthy,
      error: 'VersionError: The requested version (8) is less than the existing version (9).',
      versionOnDisk: 9
    });

    assert.match(text, /WOULD NOT OPEN/);
    assert.match(text, /VersionError/);
    assert.match(text, /nothing local is readable/);
  });

  // Self-inflicted and otherwise invisible: a newer build raised the version
  // and this older one cannot open a database from the future. Worth naming
  // outright rather than leaving in two numbers to be compared.
  it('names an older build meeting a newer database', () => {
    const text = joined({ ...healthy, error: 'VersionError: nope', versionOnDisk: 9 });
    assert.match(text, /a newer build of the app has run on this machine/);
  });

  it('does not accuse a newer build when the versions match', () => {
    const text = joined({ ...healthy, error: 'InvalidStateError: closing', versionOnDisk: 8 });
    assert.ok(!/newer build/.test(text));
  });

  // The read happens before the open, so zero means the database was not there
  // at all -- which, for "did something wipe it", is the answer rather than a
  // detail.
  it('says outright when the database was not there before this launch', () => {
    const text = joined({ ...healthy, versionOnDisk: 0 });

    assert.match(text, /was not there at all before this launch/);
    assert.match(text, /Anything it held before is gone/);
    assert.ok(!/v0/.test(text), 'zero is an absence, not a version');
  });

  // Firefox has no indexedDB.databases(). Not knowing the version is not a
  // failure and must not read like one.
  it('copes with a browser that will not say what version is on disk', () => {
    const text = joined({ ...healthy, versionOnDisk: null });
    assert.match(text, /codex-db v\? \(build expects v8\)/);
  });
});
