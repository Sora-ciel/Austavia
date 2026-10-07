/**
 * The bin across devices: what a device does about a folder, given what the
 * cloud's index says of it and what the device itself holds.
 *
 * ## What was asked for
 *
 * The bin, "cloud and local" (2026-10-05), and on 2026-10-06, once the local
 * half was in: a folder deleted for ever must not be uploaded back by a device
 * that still had it. The plan is PENDING 0b, parts 2 and 3.
 *
 * ## The three states of an index entry
 *
 * - **live** -- as it always was.
 * - **in the bin** -- `binnedAt`. The folder and its pictures stay in the
 *   cloud, so any device can restore it.
 * - **deleted for ever** -- `deletedAt`, a tombstone. The folder and its
 *   pictures are gone; the entry stays so that a device holding an old copy
 *   learns it was deleted rather than taking it for a folder the cloud lacks.
 *   The database rules refuse a folder written over a tombstone unless it is
 *   newer than the delete, which is what holds against a build that has never
 *   heard of any of this.
 *
 * ## Absolute, not remembered
 *
 * Every pull and every launch asks this of every entry, comparing states
 * rather than replaying what happened. A bin mark that failed to send offline
 * is noticed the next time -- the cloud is live and older than this device's
 * delete -- and sent again. Nothing here needs to have heard an event
 * (CLAUDE.md: anything driven by events needs something that recomputes).
 */

/** How long a tombstone is kept before it is forgotten (by the server). */
export const TOMBSTONE_KEEP_MS = 180 * 24 * 60 * 60 * 1000;

/** 'live', 'binned' or 'deleted'. */
export function remoteState(entry) {
  if (Number(entry?.deletedAt) > 0) return 'deleted';
  if (Number(entry?.binnedAt) > 0) return 'binned';
  return 'live';
}

/** When a folder (or an index entry, or a payload) was last changed. */
export function stampOf(record) {
  return Number(record?.modifiedAt || record?.updatedAt || 0);
}

/**
 * What to do about one folder. `localStamp` is the local folder's stamp, or
 * `null` when there is no local folder of that name; `binEntry` is the newest
 * local bin entry of that name, or `null`.
 *
 * - `'normal'` -- nothing to do with the bin; the ordinary sync decides.
 * - `'none'` -- nothing at all.
 * - `'bin-local'` -- binned elsewhere: move the local folder into the bin.
 * - `'fetch-into-bin'` -- binned elsewhere, nothing here: fetch it into the
 *   bin, so the bin is the same on every device.
 * - `'refresh-bin'` -- binned, and the cloud's copy is newer than the bin's.
 * - `'delete-local'` -- deleted for ever: the local copy is older than the
 *   delete, so it goes.
 * - `'drop-bin-entry'` -- deleted for ever: the bin's copy goes.
 * - `'unbin-local'` -- live and newer than this device's delete: restored
 *   on another device, so it leaves the bin here too.
 * - `'mark-binned'` -- live and older than this device's delete: the delete
 *   never reached the cloud; send it.
 */
export function cloudBinAction({ entry, localStamp = null, binEntry = null } = {}) {
  const state = remoteState(entry);
  const hasLocal = localStamp !== null && localStamp !== undefined;

  if (state === 'deleted') {
    const deletedAt = Number(entry.deletedAt);
    // A folder made or changed after the delete is a different folder.
    if (hasLocal) return Number(localStamp) > deletedAt ? 'normal' : 'delete-local';
    return binEntry ? 'drop-bin-entry' : 'none';
  }

  if (state === 'binned') {
    const binnedAt = Number(entry.binnedAt);
    // Changed here after it was binned elsewhere: the later change wins, and
    // its upload takes the folder out of the bin everywhere.
    if (hasLocal) return Number(localStamp) > binnedAt ? 'normal' : 'bin-local';
    if (binEntry) return stampOf(entry) > stampOf(binEntry.payload) ? 'refresh-bin' : 'none';
    return 'fetch-into-bin';
  }

  if (binEntry && !hasLocal) {
    return stampOf(entry) > Number(binEntry.deletedAt) ? 'unbin-local' : 'mark-binned';
  }
  return 'normal';
}

/** The newest bin entry of a name, or `null`. */
export function newestBinEntry(entries = [], name) {
  return (entries || [])
    .filter(entry => entry?.name === name)
    .sort((a, b) => Number(b.deletedAt) - Number(a.deletedAt))[0] || null;
}

/**
 * What the pull's "has anything changed" check reads: the cloud's stamps and
 * marks, and this device's bin -- a delete that has not reached the cloud yet
 * is a change worth a pass, even with the cloud standing still.
 */
export function syncFingerprint(remoteIndex = {}, binEntries = []) {
  const remote = Object.entries(remoteIndex || {})
    .map(([name, meta]) => `${name}:${stampOf(meta)}:${Number(meta?.binnedAt || 0)}:${Number(meta?.deletedAt || 0)}`)
    .sort();
  const bin = (binEntries || []).map(entry => `bin:${entry.id}`).sort();
  return [...remote, ...bin].join('|');
}
