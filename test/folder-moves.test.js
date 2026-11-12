// Renaming a folder: the old name taken out of the cloud, without it coming
// back and without losing the pictures.
//
// Asked for on 2026-10-05: "when you change the name, it should change the
// folder's name and not make another folder with that name". What follows
// was wanted.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { readPending, withPending, settlePending, skipDownload, deletesToRun } from '../src/utils/folderMoves.js';

describe('the old name, after a rename', () => {
  it('is remembered until the cloud has been told, even across a restart', () => {
    const list = withPending(readPending(null), 'Damn');
    assert.deepEqual(readPending(JSON.stringify(list)), ['Damn']);
    assert.deepEqual(withPending(list, 'Damn'), ['Damn'], 'once');
  });

  it('is not downloaded back while it is owed a delete', () => {
    assert.equal(skipDownload('Damn', ['Damn']), true);
    assert.equal(skipDownload('Work', ['Damn']), false);
  });

  it('is deleted from the cloud only when no upload is failing -- the renamed folder has to be up first', () => {
    assert.deepEqual(deletesToRun({ pending: ['Damn'], localFolders: ['Renamed'] }), ['Damn']);
    assert.deepEqual(deletesToRun({ pending: ['Damn'], localFolders: ['Renamed'], uploadFailed: true }), []);
  });

  it('is owed nothing once a folder of that name exists here again', () => {
    assert.deepEqual(settlePending(['Damn'], ['Damn']), []);
    assert.deepEqual(deletesToRun({ pending: ['Damn'], localFolders: ['Damn'] }), []);
  });

  it('copes with nonsense in storage', () => {
    assert.deepEqual(readPending('not json'), []);
    assert.deepEqual(readPending('{"a":1}'), []);
  });
});

describe('an old name that could never be in the cloud', () => {
  it('is owed no delete, instead of failing on every upload', () => {
    const name = 'Polytechnics sir. That is the science of whatever poly means';
    assert.deepEqual(deletesToRun({ pending: [name, 'Damn'], localFolders: ['Renamed'] }), ['Damn']);
  });
});
