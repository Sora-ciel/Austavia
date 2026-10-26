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

/**
 * ## The last objective set, as the starting point for the next
 *
 * Asked 2026-10-26: the goal field should remember "the one you put at last if
 * it's a new task" -- and keep time and count apart, so a task switched to
 * Count does not start with "30m" in it. So the last goal is kept per kind,
 * with the kind and the daily switch last chosen, and a task with no objective
 * yet opens its editor from them. On this device only, like the Done list.
 */
export const LAST_GOAL_KEY = 'austavia.taskMode.lastGoal';

const EMPTY_LAST_GOAL = Object.freeze({ kind: 'time', time: null, count: null, daily: false });

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** `{ kind, time (minutes), count, daily }`, with nulls for anything never set. */
export function readLastGoal(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(LAST_GOAL_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return { ...EMPTY_LAST_GOAL };
    return {
      kind: raw.kind === 'count' ? 'count' : 'time',
      time: positiveInt(raw.time),
      count: positiveInt(raw.count),
      daily: raw.daily === true
    };
  } catch {
    return { ...EMPTY_LAST_GOAL };
  }
}

/** Records a goal just set, leaving the other kind's last value as it was. */
export function writeLastGoal(storage, { kind, target, daily } = {}) {
  if (kind !== 'time' && kind !== 'count') return;
  const last = readLastGoal(storage);
  const next = { ...last, kind, [kind]: positiveInt(target) ?? last[kind], daily: daily === true };
  try {
    storage?.setItem(LAST_GOAL_KEY, JSON.stringify(next));
  } catch {
    // Not remembered; the next editor simply starts empty.
  }
}
