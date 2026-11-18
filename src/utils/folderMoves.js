/**
 * Folder names this device still owes the cloud a delete for.
 *
 * A rename is the folder saved under its new name and the old name taken
 * away -- here at once, and from the cloud when that can safely happen:
 * after the folder has gone up under its new name, so its pictures are in
 * their new place before the old name's are deleted (`cloudFiles.js`), and
 * whenever the device is next online, which may not be now.
 *
 * Until then the old name must not come back: the cloud still lists it and
 * this device no longer has it, which the pull otherwise reads as a folder to
 * download. So a name owed a delete is skipped by the pull.
 *
 * Kept in local storage as a list, so it survives the app being closed
 * before it is paid. Recomputed rather than remembered blindly: a name that
 * is a local folder again (a new folder made with the old name) is owed
 * nothing -- its own upload replaces the cloud copy -- and drops off.
 *
 * Asked for on 2026-10-05: "when you change the name, it should change the
 * folder's name and not make another folder with that name".
 */

import { isSyncableFileId } from './syncRules.js';

export const PENDING_DELETES_KEY = 'austavia.pendingFolderDeletes';

/** The list as stored, whatever was stored. */
export function readPending(raw) {
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.filter(name => typeof name === 'string' && name) : [];
  } catch {
    return [];
  }
}

export function withPending(list, name) {
  return name && !list.includes(name) ? [...list, name] : list;
}

/**
 * Names that are local folders again are owed nothing. Neither is a name the
 * database cannot hold as a key (a "." or a quote in it): it was never in the
 * cloud, so there is nothing to delete, and asking failed on every upload for
 * ever (seen 2026-11-12, a nest renamed from a sentence).
 */
export function settlePending(list, localFolders = []) {
  const local = new Set(localFolders);
  return list.filter(name => !local.has(name) && isSyncableFileId(name));
}

/** Whether the pull should leave this cloud folder alone. */
export function skipDownload(name, list) {
  return list.includes(name);
}

/**
 * What to delete from the cloud now: nothing while an upload is failing, and
 * no old name whose pictures are still being copied to the new one (`waiting`)
 * -- the renamed folder still shows them from the old name's place until then.
 */
export function deletesToRun({ pending = [], localFolders = [], uploadFailed = false, waiting = [] } = {}) {
  if (uploadFailed) return [];
  const held = new Set(waiting);
  return settlePending(pending, localFolders).filter(name => !held.has(name));
}

/**
 * Renames whose pictures are still being copied to the new name, kept on the
 * device ([{ from, to }]) so a copy cut short by the app closing carries on.
 *
 * Asked 2026-11-17: renaming a folder from its page title on the phone "seems
 * to actually work but weirdly it's very slow, it doesn't show when you do
 * it" -- every picture was fetched again before the name changed. Now the
 * name changes at once and the pictures follow (App.svelte).
 */
export const RENAME_COPIES_KEY = 'austavia.renameCopies';

export function readRenameCopies(raw) {
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.filter(item => item && typeof item.from === 'string' && typeof item.to === 'string') : [];
  } catch {
    return [];
  }
}

export function withRenameCopy(list, from, to) {
  return [...list.filter(item => item.from !== from), { from, to }];
}

export function withoutRenameCopy(list, from) {
  return list.filter(item => item.from !== from);
}
