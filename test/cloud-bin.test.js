// The bin across devices -- asked for on 2026-10-05 ("a bin, cloud and
// local") and on 2026-10-06, once a folder deleted for ever was seen coming
// back from a device that still had it. See src/utils/cloudBin.js and
// PENDING 0b. These are the cases of two devices disagreeing.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { remoteState, cloudBinAction, newestBinEntry, syncFingerprint } from '../src/utils/cloudBin.js';

const T = 1_800_000_000_000;
const live = (modifiedAt) => ({ fileId: 'Damn', updatedAt: modifiedAt, modifiedAt });
const binned = (modifiedAt, binnedAt) => ({ ...live(modifiedAt), binnedAt });
const tomb = (deletedAt) => ({ fileId: 'Damn', updatedAt: deletedAt, deletedAt });
const binEntry = (deletedAt, modifiedAt = deletedAt - 10) => ({ id: `${deletedAt}:Damn`, name: 'Damn', deletedAt, payload: { blocks: [], modifiedAt } });

describe('what the cloud says', () => {
  it('reads an entry as live, in the bin, or deleted for ever', () => {
    assert.equal(remoteState(live(T)), 'live');
    assert.equal(remoteState(binned(T, T + 1)), 'binned');
    assert.equal(remoteState(tomb(T)), 'deleted');
  });
});

describe('deleted on one device, for ever', () => {
  it('another device that still has it deletes its copy instead of uploading it back', () => {
    assert.equal(cloudBinAction({ entry: tomb(T), localStamp: T - 1000 }), 'delete-local');
  });

  it('a folder made later under the same name is a different folder, and syncs', () => {
    assert.equal(cloudBinAction({ entry: tomb(T), localStamp: T + 1000 }), 'normal');
  });

  it('a copy sitting in another device’s bin goes too', () => {
    assert.equal(cloudBinAction({ entry: tomb(T), binEntry: binEntry(T - 500) }), 'drop-bin-entry');
    assert.equal(cloudBinAction({ entry: tomb(T) }), 'none');
  });
});

// Said on 2026-10-06: "it's not bad that bin folders come back -- it's just
// that when they come back, they come back in the bin, not outside of it."
describe('moved to the bin on one device', () => {
  it('another device moves its copy into its own bin', () => {
    assert.equal(cloudBinAction({ entry: binned(T - 100, T), localStamp: T - 100 }), 'bin-local');
  });

  it('a device without it fetches it into its bin, so the bin is the same everywhere', () => {
    assert.equal(cloudBinAction({ entry: binned(T - 100, T) }), 'fetch-into-bin');
  });

  it('a device that changed it after it was binned keeps it, and that change takes it out of the bin', () => {
    assert.equal(cloudBinAction({ entry: binned(T - 100, T), localStamp: T + 50 }), 'normal');
  });

  it('a bin already holding it is refreshed only by a newer copy', () => {
    assert.equal(cloudBinAction({ entry: binned(T - 100, T), binEntry: binEntry(T, T - 100) }), 'none');
    assert.equal(cloudBinAction({ entry: binned(T + 10, T + 20), binEntry: binEntry(T, T - 100) }), 'refresh-bin');
  });
});

describe('restored, or deleted while offline', () => {
  it('restored on another device, it leaves the bin here too', () => {
    assert.equal(cloudBinAction({ entry: live(T + 5000), binEntry: binEntry(T) }), 'unbin-local');
  });

  it('deleted here while offline, the cloud is told when it can be', () => {
    assert.equal(cloudBinAction({ entry: live(T - 5000), binEntry: binEntry(T) }), 'mark-binned');
  });

  it('a live folder with nothing in the bin is the ordinary sync’s business', () => {
    assert.equal(cloudBinAction({ entry: live(T), localStamp: T }), 'normal');
    assert.equal(cloudBinAction({ entry: live(T) }), 'normal');
  });
});

describe('noticing', () => {
  it('a bin mark or a tombstone is a change, even with the stamp unchanged', () => {
    const before = syncFingerprint({ Damn: live(T) });
    assert.notEqual(syncFingerprint({ Damn: binned(T, T + 1) }), before);
    assert.notEqual(syncFingerprint({ Damn: tomb(T + 1) }), before);
  });

  it('a delete here that has not reached the cloud is a change too', () => {
    assert.notEqual(syncFingerprint({ Damn: live(T) }, [binEntry(T)]), syncFingerprint({ Damn: live(T) }));
  });

  it('picks the newest bin entry of a name', () => {
    assert.equal(newestBinEntry([binEntry(T), binEntry(T + 9)], 'Damn').deletedAt, T + 9);
    assert.equal(newestBinEntry([binEntry(T)], 'Work'), null);
  });
});
