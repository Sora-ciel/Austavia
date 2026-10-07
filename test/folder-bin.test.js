// Asked for on 2026-10-06: "deleting puts it in a bin client side ... it
// remembers the folder for 15 days minimum and you can take it back, so even
// though cloud side is not added yet, we can go back client side." See
// src/utils/folderBin.js; the cloud half is PENDING 0b.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BIN_DAYS,
  binEntryOf,
  sortBin,
  daysLeft,
  restoreName,
  heldInBin,
  leaveInCloud,
  cloudDeletesAfterEmptying
} from '../src/utils/folderBin.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe('the bin', () => {
  const entry = binEntryOf('Damn', { blocks: [{ id: 'a' }, { id: 'b' }] }, NOW);

  it('keeps a deleted folder whole, with when it was deleted', () => {
    assert.equal(entry.name, 'Damn');
    assert.equal(entry.blockCount, 2);
    assert.equal(entry.deletedAt, NOW);
    assert.equal(entry.payload.blocks.length, 2);
  });

  it('keeps it for 15 days at least, and empties it after', () => {
    assert.equal(BIN_DAYS, 15);
    assert.deepEqual(sortBin([entry], NOW + 14 * DAY).expired, []);
    assert.deepEqual(sortBin([entry], NOW + 15 * DAY - 1).expired, []);
    assert.deepEqual(sortBin([entry], NOW + 15 * DAY).expired.map(e => e.name), ['Damn']);
  });

  it('says how many days are left', () => {
    assert.equal(daysLeft(entry, NOW), 15);
    assert.equal(daysLeft(entry, NOW + 14.5 * DAY), 1);
  });

  it('lists the newest first', () => {
    const older = binEntryOf('Old', { blocks: [] }, NOW - DAY);
    assert.deepEqual(sortBin([older, entry], NOW).kept.map(e => e.name), ['Damn', 'Old']);
  });

  it('restores under its own name, or the next number when it has been taken since', () => {
    assert.equal(restoreName(entry, ['Work']), 'Damn');
    assert.equal(restoreName(entry, ['Damn']), 'Damn 1');
  });
});

describe('the bin and the cloud', () => {
  const entry = binEntryOf('Damn', { blocks: [] }, NOW);

  it('a folder in the bin is not downloaded back from the cloud', () => {
    assert.equal(heldInBin('Damn', [entry], []), true);
    assert.equal(heldInBin('Work', [entry], []), false);
  });

  it('a new folder made under the same name syncs as any other', () => {
    assert.equal(heldInBin('Damn', [entry], ['Damn']), false);
  });

  it('the cloud copy is deleted only once the bin no longer holds it', () => {
    assert.deepEqual(cloudDeletesAfterEmptying([entry], [], []), ['Damn']);
    const again = binEntryOf('Damn', { blocks: [] }, NOW + 1);
    assert.deepEqual(cloudDeletesAfterEmptying([entry], [again], []), [], 'deleted twice, one copy still in the bin');
    assert.deepEqual(cloudDeletesAfterEmptying([entry], [], ['Damn']), [], 'a folder of that name is here now');
  });
});

// Reported on 2026-10-06: deleted folders came back to the device anyway. The
// launch downloaded every cloud folder the device did not have, and only the
// pull had been told about the bin. Every path that downloads asks this.
describe('what is not downloaded back', () => {
  const entry = binEntryOf('Damn', { blocks: [] }, NOW);

  it('a folder in the bin, or an old name a rename left, stays in the cloud', () => {
    assert.equal(leaveInCloud('Damn', { bin: [entry] }), true);
    assert.equal(leaveInCloud('Old name', { owedDeletes: ['Old name'] }), true);
    assert.equal(leaveInCloud('Work', { bin: [entry], owedDeletes: ['Old name'] }), false);
  });

  it('a folder of that name here now syncs as any other', () => {
    assert.equal(leaveInCloud('Damn', { bin: [entry], localFolders: ['Damn'] }), false);
  });
});

