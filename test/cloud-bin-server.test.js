// The server's half of the bin across devices -- see functions/cloudBin.js.
// Asked for on 2026-10-05: folders "deleted in the last 15 days" can be
// taken back, and after that they go -- from the cloud too, with no device
// needing to be open for it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import cloudBin from '../functions/cloudBin.js';

const { sweepIndex, indexWriteKind } = cloudBin;
const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe('the daily pass', () => {
  it('empties a folder 15 days after it went into the bin, not before', () => {
    const index = {
      old: { fileId: 'old', updatedAt: 1, binnedAt: NOW - 15 * DAY },
      recent: { fileId: 'recent', updatedAt: 1, binnedAt: NOW - 14 * DAY },
      live: { fileId: 'live', updatedAt: 1, modifiedAt: 1 }
    };
    assert.deepEqual(sweepIndex(index, NOW).empty, ['old']);
  });

  it('forgets a tombstone only after it has stood long enough', () => {
    const index = {
      ancient: { fileId: 'ancient', updatedAt: 1, deletedAt: NOW - 181 * DAY },
      fresh: { fileId: 'fresh', updatedAt: 1, deletedAt: NOW - 10 * DAY }
    };
    const { empty, forget } = sweepIndex(index, NOW);
    assert.deepEqual(forget, ['ancient']);
    assert.deepEqual(empty, []);
  });
});

describe('what the quota trigger charges', () => {
  it('a bin mark is not a write of the folder', () => {
    assert.equal(indexWriteKind({ updatedAt: 5 }, { updatedAt: 5, binnedAt: 9 }), 'bin-mark');
  });

  it('a tombstone holds nothing, and an ordinary save is a write', () => {
    assert.equal(indexWriteKind({ updatedAt: 5 }, { updatedAt: 9, deletedAt: 9 }), 'tombstone');
    assert.equal(indexWriteKind({ updatedAt: 5 }, { updatedAt: 9 }), 'write');
    assert.equal(indexWriteKind(null, { updatedAt: 9 }), 'write');
    assert.equal(indexWriteKind({ updatedAt: 5 }, null), 'removed');
  });
});
