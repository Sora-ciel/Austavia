/**
 * Two devices that changed the same folder: keep both, never overwrite.
 *
 * ## What was asked for
 *
 * 2026-11-11, on a phone opened offline: "you're sure it won't make a window
 * when ... I can still make a change on the phone before it tries syncing and
 * when it will try syncing it will see that my phone is the latest and won't
 * sync the true better sync?" It did: a folder is synced whole, the copy with
 * the later stamp won, and the other device's change -- in any note of that
 * folder -- was overwritten, kept only as a copy on that device nobody was
 * told about. Decided: a conflict copy, as Dropbox and Drive do.
 *
 * ## How
 *
 * Each device remembers, per folder, the cloud's stamp the last time it saw
 * the cloud's copy -- after downloading it or uploading its own (`seen`, kept
 * across restarts, App.svelte). Before uploading, the cloud's stamp now is
 * read. If it has moved on since then, somebody else changed the folder while
 * this device had changes of its own: a conflict. This device's version goes
 * into a new folder named for it -- "Notes (from phone, 11 Nov)" -- which
 * syncs like any other, and the folder takes the cloud's version. Nothing is
 * overwritten and both are in front of the person.
 *
 * Since 2026-11-12 a conflict is first merged block by block
 * (utils/folderMerge.js); keeping both whole is what is left for when that
 * cannot be done, and the copy is made only where both changed the same block.
 */

/**
 * Whether this device may upload its copy of a folder, or has met a conflict.
 *
 * `seen`: the cloud stamp this device last saw for it, or null if it has
 * never recorded one. `remoteModifiedAt`: the cloud's stamp now, 0 when the
 * cloud has no copy. `localModifiedAt`: this device's.
 */
export function uploadVerdict({ seen = null, remoteModifiedAt = 0, localModifiedAt = 0 } = {}) {
  const remote = Number(remoteModifiedAt) || 0;
  const local = Number(localModifiedAt) || 0;
  // Nothing up there, or exactly what is here.
  if (!remote || remote === local) return 'upload';
  if (seen === null || seen === undefined) {
    // Never recorded (the first sync after updating to this version): a cloud
    // copy newer than this one is somebody else's work, so it is not
    // overwritten; an older one is this device's to replace.
    return remote > local ? 'conflict' : 'upload';
  }
  // The cloud moved on since this device last saw it.
  return remote > Number(seen) ? 'conflict' : 'upload';
}

/** What kind of device this is, for naming its copy where the other device will see it. */
export function deviceKind({ nativeAndroid = false, desktopApp = false } = {}) {
  if (nativeAndroid) return 'phone';
  if (desktopApp) return 'computer';
  return 'browser';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The name of this device's version of a folder in conflict: "Notes (from
 * phone, 11 Nov)", or with " 2", " 3" when that is taken. Only characters a
 * folder name may hold in the cloud (no . # $ [ ] /).
 */
export function conflictCopyName(name, taken = [], { kind = 'browser', at = new Date() } = {}) {
  const when = `${at.getDate()} ${MONTHS[at.getMonth()]}`;
  const base = `${name} (from ${kind}, ${when})`;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Where the stamps seen are kept on this device, per account. */
export const SEEN_KEY_PREFIX = 'austavia.cloudSeen.';

export function readSeen(storage, uid) {
  try {
    const raw = JSON.parse(storage?.getItem(SEEN_KEY_PREFIX + uid) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function writeSeen(storage, uid, seen) {
  try { storage?.setItem(SEEN_KEY_PREFIX + uid, JSON.stringify(seen || {})); } catch { /* recorded next time */ }
}

/**
 * What to count as "last seen" for a folder: the cloud stamp recorded, or,
 * where none is yet, when this device last synced it (kept by every version,
 * across updates). Without the second, a device on its first run of this
 * version -- opened offline, so nothing was recorded before it was edited --
 * had nothing to compare with, and its later stamp overwrote the other
 * device's work: the rehearsal on staging, 2026-11-11.
 */
export function seenFor({ seen = null, lastSynced = null } = {}) {
  if (seen !== null && seen !== undefined && Number(seen) > 0) return Number(seen);
  if (lastSynced !== null && lastSynced !== undefined && Number(lastSynced) > 0) return Number(lastSynced);
  return null;
}
