import { uniqueName } from './folderTransfer.js';

// When a typing save should actually be written.
//
// The old rule was a 300ms throttle wearing a debounce's name: the first
// keystroke armed a timer and every keystroke after it returned early without
// restarting one, so continuous typing wrote the entire note to disk every
// 300ms for as long as it went on. A sync log of someone writing a paragraph
// is hundreds of full-folder saves, each one restamping modifiedAt and each one
// counted against the daily bandwidth ceiling.
//
// What is wanted instead is a save shortly after someone stops, and a
// guarantee that a long unbroken burst still gets written now and then.

// Long enough that a normal pause between words does not trigger a write, short
// enough that stopping to think feels like it saved instantly.
export const SAVE_QUIET_MS = 1000;

// The ceiling on how long typing can hold a save off. Without it, someone who
// types without pausing for two minutes has two minutes of work held in memory
// and nothing on disk — the debounce would keep politely deferring to the next
// keystroke. This is the answer to "how much could a crash cost", and it is why
// the deadline is measured from the first queued change and never moves.
export const SAVE_MAX_WAIT_MS = 5000;

/**
 * Milliseconds to wait before writing, given when this burst of changes began.
 *
 * Each keystroke pushes the quiet window forward, but never past the deadline
 * the first change set. Returns 0 when the deadline has already passed, which
 * means write now.
 */
export function nextSaveDelay({
  now,
  firstQueuedAt,
  quietMs = SAVE_QUIET_MS,
  maxWaitMs = SAVE_MAX_WAIT_MS
}) {
  // No burst recorded yet: treat this change as the start of one.
  const startedAt = Number(firstQueuedAt) || now;

  const quietTarget = now + quietMs;
  const deadline = startedAt + maxWaitMs;

  return Math.max(0, Math.min(quietTarget, deadline) - now);
}

/**
 * What to do with a save that wants to run right now.
 *
 * ## What this is for
 *
 * A folder arriving from the cloud is written to storage, and the app's
 * in-memory blocks only catch up when the remount that follows has finished —
 * several `await`s later. In that gap the two disagree, and the in-memory copy
 * is the *old* one.
 *
 * A save firing in that gap compares the old blocks against the copy that has
 * just landed, correctly concludes they differ, and writes the old content back
 * with a fresh `modifiedAt`. Old content wearing a new stamp then wins
 * everywhere, because a later stamp is how the cloud decides.
 *
 * That is the shape of the incident that started all of this: a folder that
 * reverted to a version from half an hour earlier.
 *
 * ## Discarded, not queued — and this is the part that matters
 *
 * The obvious fix is to hold the save and run it after. That puts the bug
 * straight back: the held payload is the blocks as they were *before* the cloud
 * copy landed, so replaying it writes exactly the stale content the wait was
 * supposed to prevent, just a moment later.
 *
 * Once a cloud copy has landed, a save captured before it is void. Nothing is
 * lost by dropping it — the copy on screen is about to be replaced by the one
 * from the cloud, and anything genuinely unsent was already protected by the
 * guard in `syncOwing.js`, which refuses the download in the first place.
 *
 * Queuing behind another save in flight is different and stays: that payload is
 * newer than the one being written, not older.
 */
export function saveVerdict({ applyingRemoteCopy = false, saveInFlight = false } = {}) {
  if (applyingRemoteCopy) return 'discard';
  if (saveInFlight) return 'queue';
  return 'write';
}

/**
 * Whether a save can be taken at all, and which folder it belongs to.
 *
 * ## What happened
 *
 * Reported on 2026-10-05, in a phone's sync log: `save [default] blocks.length:
 * 1 -> 0`, two seconds before that folder had finished opening. Opening a
 * folder starts by clearing the one that was open -- no name, no blocks -- and
 * reads the new one from storage after an `await`. A save in that gap found no
 * folder name, fell back to "default" (the name a fresh install starts with),
 * and wrote an empty list of blocks over it. The folder's one block was gone,
 * and the empty copy was queued for upload.
 *
 * And a save always wrote to whichever folder was open *when it ran*, not
 * when it was made. An edit still waiting out its debounce when you switched
 * folders would have been written into the next one.
 *
 * ## So
 *
 * - Nothing is taken while a folder is opening: what is on screen then is
 *   neither folder. Dropped rather than held, for the reason `saveVerdict`
 *   gives -- it is about to be replaced.
 * - A save carries the folder it was made in, and is written there whenever
 *   it runs.
 */
export function mayTakeSave({ folderOpening = false } = {}) {
  return !folderOpening;
}

/** The folder a save is written to: the one it was made in. */
export function saveTarget(payload, currentFolder = '') {
  return (payload && typeof payload.folder === 'string' && payload.folder) || currentFolder;
}

/**
 * The name an edit is saved under when no folder is open.
 *
 * Reported on 2026-10-06: deleting the open folder emptied the screen and left
 * no name, the save that followed adopted "default", and a real folder called
 * "default" -- four blocks, nothing to do with the one deleted -- was written
 * over with nothing. The same shape as the folder-opening case above, by
 * another door.
 *
 * So a save with no folder takes a name no folder has: "default" while it is
 * free, "default 1" when it is not. It can make a new folder; it can never
 * land on one somebody already has.
 */
export function nameForUnnamedSave(existingFolders = []) {
  return uniqueName('default', existingFolders);
}
