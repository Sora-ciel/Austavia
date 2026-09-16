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
