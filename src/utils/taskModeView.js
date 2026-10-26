/**
 * How Task mode is laid out on this device -- things that are about the screen
 * in front of somebody rather than about the tasks, so they stay on the device
 * and never sync.
 *
 * ## The Done list, open or closed
 *
 * Asked 2026-10-25: "In task mode whether the 'Done' list of the task is open
 * or closed is saved per device. So that it stays between restarts etc."
 *
 * Per device rather than per folder or in the folder's settings: a phone with
 * little room keeps it closed while a desktop keeps it open, and neither
 * should flip the other's. Open by default, as it always was, so nobody's Done
 * list disappears the first time this runs.
 *
 * Storage is passed in, and any failure reading or writing it -- a private
 * window, storage switched off -- falls back to the default rather than
 * stopping the mode from opening.
 */

export const DONE_EXPANDED_KEY = 'austavia.taskMode.doneExpanded';

/** Whether the Done list was left open on this device. */
export function readDoneExpanded(storage) {
  try {
    const value = storage?.getItem(DONE_EXPANDED_KEY);
    if (value === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

/** Remembers it, for the next time the mode opens on this device. */
export function writeDoneExpanded(storage, expanded) {
  try {
    storage?.setItem(DONE_EXPANDED_KEY, expanded ? 'true' : 'false');
  } catch {
    // Not remembered; the mode works the same, it just opens the default way.
  }
}
