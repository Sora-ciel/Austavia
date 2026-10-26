/**
 * How many days -- or weeks -- in a row a habit has been kept: now, and at
 * its best.
 *
 * ## What was asked for
 *
 * Agreed 2026-10-26, from the habit tracker proposal: "Streaks: '🔥 12 days'
 * next to the name, plus your best streak." Then, the same day: habits that
 * are not every day ("days it isn't due show as rest days, not ✕, and don't
 * break the streak") and a skipped day ("for sick days or travel, so the
 * streak doesn't break"). Both change what counts as missed, so both are
 * decided here, once.
 *
 * ## A day is one of three things
 *
 * - **Counts**: done. A habit done on a rest day counts too.
 * - **Passes**: neither adds nor breaks -- skipped, a rest day with nothing
 *   done, or today while it has no mark yet (the day is not over, and a
 *   streak should not read 0 every morning until the first tick).
 * - **Breaks**: a day it was due that is ✕ or was left empty.
 *
 * A streak is the number of days that count since the last one that broke.
 *
 * ## A habit kept so many times a week is counted in weeks
 *
 * "3 times a week" has no particular day that is missed, so its streak is in
 * weeks, Monday to Sunday. A week is kept when its ✓ reach the number --
 * fewer by each skipped day, since a week with two days skipped has only five
 * to do it in. The week in progress counts once it is kept and passes until
 * then; an earlier week not kept breaks.
 *
 * Always worked out from the days, never kept as a counter: a counter is only
 * as right as the last tap it heard, and two devices ticking the same habit
 * would each add their own (CLAUDE.md, on recomputing).
 */

import { dayKey } from './habitDays.js';
import { dayMark } from './habitStore.js';
import { normalizeSchedule, isDue, weekStart } from './habitSchedule.js';

const COUNTS = 'counts';
const PASSES = 'passes';
const BREAKS = 'breaks';

function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function firstDay(log) {
  const keys = Object.keys(log || {}).filter(key => dayMark(log[key]) !== null).sort();
  if (!keys.length) return null;
  const [y, m, d] = keys[0].split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** What one day does to a streak of a habit kept on days. */
export function dayEffect(log, schedule, date, { isToday = false } = {}) {
  const mark = dayMark(log?.[dayKey(date)]);
  if (mark === 'done') return COUNTS;
  if (mark === 'skipped') return PASSES;
  if (!isDue(schedule, date)) return PASSES;
  if (mark === 'missed') return BREAKS;
  return isToday ? PASSES : BREAKS;
}

/** Each day from the first marked one to today, as counts / passes / breaks. */
function dayEffects(log, schedule, today) {
  const start = firstDay(log);
  if (!start || start > today) return [];
  const effects = [];
  for (let date = start; date <= today; date = addDays(date, 1)) {
    effects.push(dayEffect(log, schedule, date, { isToday: date.getTime() === today.getTime() }));
  }
  return effects;
}

/** Each week from the first marked one to this one, for a habit kept weekly. */
function weekEffects(log, times, today) {
  const start = firstDay(log);
  if (!start || start > today) return [];
  const thisWeek = weekStart(today).getTime();
  const effects = [];
  for (let monday = weekStart(start); monday.getTime() <= thisWeek; monday = addDays(monday, 7)) {
    let done = 0;
    let skipped = 0;
    for (let i = 0; i < 7; i += 1) {
      const mark = dayMark(log?.[dayKey(addDays(monday, i))]);
      if (mark === 'done') done += 1;
      else if (mark === 'skipped') skipped += 1;
    }
    const needed = Math.min(times, 7 - skipped);
    const kept = needed <= 0 ? null : done >= needed;
    if (kept === null) effects.push(PASSES);
    else if (kept) effects.push(COUNTS);
    else effects.push(monday.getTime() === thisWeek ? PASSES : BREAKS);
  }
  return effects;
}

function runs(effects) {
  let best = 0;
  let run = 0;
  for (const effect of effects) {
    if (effect === COUNTS) run += 1;
    else if (effect === BREAKS) run = 0;
    best = Math.max(best, run);
  }
  return { current: run, best };
}

/**
 * A habit's streaks: `{ current, best, unit }`, the unit 'days', or 'weeks'
 * for a habit kept so many times a week.
 */
export function habitStreaks(habit, { today = new Date() } = {}) {
  const day = asDate(today);
  const log = habit?.log || {};
  const schedule = normalizeSchedule(habit?.schedule);
  if (!day) return { current: 0, best: 0, unit: 'days' };
  if (schedule?.kind === 'weekly') {
    return { ...runs(weekEffects(log, schedule.times, day)), unit: 'weeks' };
  }
  return { ...runs(dayEffects(log, schedule, day)), unit: 'days' };
}

/** Days done in a row up to today, for a habit kept every day. */
export function currentStreak(log = {}, options = {}) {
  return habitStreaks({ log }, options).current;
}

/** The longest run of days done, for a habit kept every day. */
export function bestStreak(log = {}, { today } = {}) {
  // Up to the last marked day when no today is given, so a log alone has an
  // answer that does not depend on the clock.
  const keys = Object.keys(log || {}).filter(key => dayMark(log[key]) !== null).sort();
  if (!keys.length) return 0;
  const last = today ?? (() => { const [y, m, d] = keys[keys.length - 1].split('-').map(Number); return new Date(y, m - 1, d); })();
  return habitStreaks({ log }, { today: last }).best;
}
