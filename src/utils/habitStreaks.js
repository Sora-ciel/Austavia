/**
 * How many days in a row a habit has been done: now, and at its best.
 *
 * ## What was asked for
 *
 * Agreed 2026-10-26, from the habit tracker proposal: "Streaks: '🔥 12 days'
 * next to the name, plus your best streak."
 *
 * ## The rule
 *
 * A streak is a run of consecutive days marked done. The current one ends
 * today -- or yesterday, while today has no mark yet: the day is not over, and
 * a streak should not read 0 every morning until the first tick. A ✕ today
 * does end it. Any day with no mark breaks a run, the same as a ✕.
 *
 * Always worked out from the log, never kept as a counter: a counter is only
 * as right as the last tap it heard, and two devices ticking the same habit
 * would each add their own (see CLAUDE.md on recomputing). Days not being due,
 * and skipped days, will change what breaks a run -- items 6 and 9 of the
 * plan -- and are meant to change it here, once.
 */

import { dayKey } from './habitDays.js';
import { dayMark } from './habitStore.js';

function dayBefore(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
}

/** Done days in a row, ending today, or yesterday while today is unmarked. */
export function currentStreak(log = {}, { today = new Date() } = {}) {
  const start = today instanceof Date ? today : new Date(today);
  if (Number.isNaN(start.getTime())) return 0;
  let day = start;
  if (dayMark(log?.[dayKey(day)]) === null) day = dayBefore(day);
  let count = 0;
  while (dayMark(log?.[dayKey(day)]) === 'done') {
    count += 1;
    day = dayBefore(day);
  }
  return count;
}

/** The longest run of done days anywhere in the log. */
export function bestStreak(log = {}) {
  const done = Object.keys(log || {})
    .filter(key => dayMark(log[key]) === 'done')
    .sort();
  let best = 0;
  let run = 0;
  let previous = null;
  for (const key of done) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    run = previous && dayKey(dayBefore(date)) === previous ? run + 1 : 1;
    best = Math.max(best, run);
    previous = key;
  }
  return best;
}

/** Both, for a habit: `{ current, best }`. */
export function habitStreaks(habit, options = {}) {
  const log = habit?.log || {};
  const current = currentStreak(log, options);
  return { current, best: Math.max(current, bestStreak(log)) };
}
