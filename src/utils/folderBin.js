/**
 * The bin: deleted folders, kept on this device for 15 days.
 *
 * ## What was asked for
 *
 * "Deleting puts it in a bin client side ... it remembers the folder for 15
 * days minimum and you can take it back -- so even though cloud side is not
 * added yet, we can go back client side" (2026-10-06), the first part of the
 * bin planned in PENDING 0b.
 *
 * ## What it does
 *
 * - Deleting a folder moves it here, whole, with when it was deleted.
 * - Restore puts it back under its own name, or "Damn 1" when a folder has
 *   taken the name since.
 * - Delete for ever, or 15 days passing, empties it -- and only then is the
 *   cloud copy deleted, so the bin is the one way back.
 * - While a folder is in the bin, the cloud copy is not downloaded again.
 *   That is what brought a deleted folder straight back before: the cloud still
 *   had it, this device did not, and a pull reads that as a folder to receive.
 *
 * Emptying is worked out from `deletedAt` whenever the bin is looked at, not
 * scheduled: a timer that never fires would keep a folder for ever, and the
 * recompute is safe to run any number of times (CLAUDE.md).
 *
 * What other devices learn of a delete is part 3 of PENDING 0b, not this.
 */
import { uniqueName } from './folderTransfer.js';

export const BIN_DAYS = 15;
export const BIN_MS = BIN_DAYS * 24 * 60 * 60 * 1000;

/** The record a deleted folder is kept as. */
export function binEntryOf(name, payload, now = Date.now()) {
  const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
  return {
    id: `${now}:${name}`,
    name,
    deletedAt: now,
    blockCount: blocks.length,
    payload
  };
}

/** Whether a folder has been in the bin its full time. */
export function hasExpired(entry, now = Date.now()) {
  return now - Number(entry?.deletedAt || 0) >= BIN_MS;
}

/** The bin as it should be shown: newest first, the expired ones split off. */
export function sortBin(entries = [], now = Date.now()) {
  const list = (entries || []).filter(entry => entry && entry.id && typeof entry.name === 'string');
  list.sort((a, b) => Number(b.deletedAt) - Number(a.deletedAt));
  return {
    kept: list.filter(entry => !hasExpired(entry, now)),
    expired: list.filter(entry => hasExpired(entry, now))
  };
}

/** Whole days left before it is emptied; at least 1 until it is. */
export function daysLeft(entry, now = Date.now()) {
  const left = BIN_MS - (now - Number(entry?.deletedAt || 0));
  return Math.max(0, Math.ceil(left / (24 * 60 * 60 * 1000)));
}

/** The name a restored folder comes back under. */
export function restoreName(entry, existingFolders = []) {
  return uniqueName(entry?.name, existingFolders, 'Restored');
}

/**
 * Whether a pull should leave a cloud folder alone because it is in the bin.
 * A folder made since under the same name is a different folder, and syncs
 * as any other.
 */
export function heldInBin(name, entries = [], localFolders = []) {
  if (localFolders.includes(name)) return false;
  return (entries || []).some(entry => entry?.name === name);
}

/**
 * Whether a cloud folder is one this device does not want back: in the bin,
 * or an old name a rename left behind. Asked on every path that downloads --
 * the launch as much as the pull. Reported on 2026-10-06: deleted folders
 * came back, because the launch fetched every cloud folder this device did not
 * have and only the pull had been taught about the bin.
 */
export function leaveInCloud(name, { bin = [], owedDeletes = [], localFolders = [] } = {}) {
  if (localFolders.includes(name)) return false;
  return owedDeletes.includes(name) || heldInBin(name, bin, localFolders);
}

/**
 * The bin's copy of a folder the cloud has a newer one of -- edited on another
 * device after it was deleted here -- or `null`. The newer copy goes into the
 * bin, not back among the folders: "when they come back they come back in the
 * bin, not outside of it" (2026-10-06). Restore then gives the latest.
 */
export function binCopyBehind(name, entries = [], remoteModifiedAt = 0) {
  const newest = (entries || [])
    .filter(entry => entry?.name === name)
    .sort((a, b) => Number(b.deletedAt) - Number(a.deletedAt))[0];
  if (!newest) return null;
  const kept = Number(newest.payload?.modifiedAt || newest.payload?.updatedAt || 0);
  return Number(remoteModifiedAt) > kept ? newest : null;
}

/**
 * Names whose cloud copy may now be deleted: emptied from the bin, with no
 * other copy of that name still in it and no folder of that name here.
 */
export function cloudDeletesAfterEmptying(emptied = [], remaining = [], localFolders = []) {
  const stillHeld = new Set((remaining || []).map(entry => entry.name));
  const local = new Set(localFolders);
  return [...new Set((emptied || []).map(entry => entry.name))]
    .filter(name => !stillHeld.has(name) && !local.has(name));
}
