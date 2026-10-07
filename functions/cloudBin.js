// The server's half of the bin across devices (PENDING 0b; the client's half
// is src/utils/cloudBin.js). Decides; index.js acts.
//
// Asked for on 2026-10-05 ("a bin, cloud and local ... the last 15 days") and
// 2026-10-06. A folder in the bin carries `binnedAt` in its index entry; one
// deleted for ever carries `deletedAt` (a tombstone) and has no folder data.
//
// The daily pass is absolute: it reads each entry's own times and works out
// what should be true now, so it is safe to run late, twice, or after a
// missed day (CLAUDE.md: anything driven by events needs something that
// recomputes).

const DAY_MS = 24 * 60 * 60 * 1000;
const BIN_MS = 15 * DAY_MS;
// Long enough that a device left in a drawer for months still meets the
// tombstone before it could upload the folder back -- and the rules refuse
// that upload anyway while the tombstone stands.
const TOMBSTONE_KEEP_MS = 180 * DAY_MS;

/**
 * What the daily pass does to one account's index: `empty` -- binned past 15
 * days, to be deleted for ever; `forget` -- tombstones old enough to drop.
 */
function sweepIndex(index, now = Date.now()) {
  const empty = [];
  const forget = [];
  for (const [fileId, entry] of Object.entries(index || {})) {
    const deletedAt = Number(entry && entry.deletedAt) || 0;
    const binnedAt = Number(entry && entry.binnedAt) || 0;
    if (deletedAt > 0) {
      if (now - deletedAt >= TOMBSTONE_KEEP_MS) forget.push(fileId);
    } else if (binnedAt > 0 && now - binnedAt >= BIN_MS) {
      empty.push(fileId);
    }
  }
  return { empty, forget };
}

/**
 * What an index write was, for the quota trigger:
 *
 * - `'removed'` -- the entry is gone;
 * - `'tombstone'` -- deleted for ever: the folder holds nothing now;
 * - `'bin-mark'` -- only `binnedAt` changed. Not a write of the folder, and
 *   charging its whole size against today's bandwidth for it would be a
 *   tax on deleting;
 * - `'write'` -- an ordinary save.
 */
function indexWriteKind(before, after) {
  if (!after) return 'removed';
  if (Number(after.deletedAt) > 0) return 'tombstone';
  if (before && Number(after.binnedAt) > 0 && Number(before.updatedAt) === Number(after.updatedAt)) return 'bin-mark';
  return 'write';
}

module.exports = { BIN_MS, TOMBSTONE_KEEP_MS, sweepIndex, indexWriteKind };
