/**
 * What a habit's page shows: how often it was kept this week, month and year,
 * and a year of days to look back over.
 *
 * ## What was asked for
 *
 * Agreed 2026-10-26, item 11 of the habit tracker plan: "A page for each
 * habit: a year grid like GitHub's, your completion rate for the week, month
 * and year, current and best streak." Streaks are habitStreaks.js; this is
 * the rest.
 *
 * ## What a rate is
 *
 * Of the days the habit was meant for, how many were done -- so it reads the
 * same way the streak does (habitStreaks.js): a rest day is not owed, a
 * skipped day is not owed, and today is not owed until it is done, because
 * the day is not over. A habit done on a rest day is a day done, but the rate
 * never goes past 100%.
 *
 * A habit kept so many times a week is rated in weeks: of the weeks in the
 * period that are over, or kept already, how many were kept.
 *
 * Nothing is owed before the habit's first marked day. Habits carry no date
 * they were made, and without this a habit started last week read "1% this
 * year" -- every day since January counted against it (seen 2026-10-26).
 */

import { dayKey } from './habitDays.js';
import { dayMark } from './habitStore.js';
import { normalizeSchedule, isDue, weekStart } from './habitSchedule.js';

function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function midnight(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The first day of each period ending today: this week, month and year. */
export function periodStarts(today = new Date()) {
  const day = midnight(today);
  return {
    week: weekStart(day),
    month: new Date(day.getFullYear(), day.getMonth(), 1),
    year: new Date(day.getFullYear(), 0, 1)
  };
}

function weekKept(log, times, monday) {
  let done = 0;
  let skipped = 0;
  for (let i = 0; i < 7; i += 1) {
    const mark = dayMark(log?.[dayKey(addDays(monday, i))]);
    if (mark === 'done') done += 1;
    else if (mark === 'skipped') skipped += 1;
  }
  const needed = Math.min(times, 7 - skipped);
  return needed <= 0 ? null : done >= needed;
}

/**
 * How the habit did from `from` to today: `{ done, owed, rate, unit }`, rate
 * 0 to 1, or null when nothing was owed yet.
 */
function firstMarked(log) {
  const keys = Object.keys(log || {}).filter(key => dayMark(log[key]) !== null).sort();
  if (!keys.length) return null;
  const [y, m, d] = keys[0].split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function periodRate(habit, { from, today = new Date() } = {}) {
  const end = midnight(today);
  const log = habit?.log || {};
  const begun = firstMarked(log);
  if (!begun) return { done: 0, owed: 0, rate: null, unit: normalizeSchedule(habit?.schedule)?.kind === 'weekly' ? 'weeks' : 'days' };
  const asked = midnight(from ?? end);
  const start = begun > asked ? begun : asked;
  const schedule = normalizeSchedule(habit?.schedule);

  if (schedule?.kind === 'weekly') {
    let done = 0;
    let owed = 0;
    const thisWeek = weekStart(end).getTime();
    for (let monday = weekStart(start); monday <= end; monday = addDays(monday, 7)) {
      const kept = weekKept(log, schedule.times, monday);
      if (kept === null) continue;
      if (kept) { done += 1; owed += 1; }
      else if (monday.getTime() !== thisWeek) owed += 1;
    }
    return { done, owed, rate: owed ? done / owed : null, unit: 'weeks' };
  }

  let done = 0;
  let owed = 0;
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const mark = dayMark(log[dayKey(day)]);
    const isToday = day.getTime() === end.getTime();
    if (mark === 'done') {
      done += 1;
      if (isDue(schedule, day)) owed += 1;
      continue;
    }
    if (mark === 'skipped' || !isDue(schedule, day) || isToday) continue;
    owed += 1;
  }
  return { done, owed, rate: owed ? Math.min(1, done / owed) : null, unit: 'days' };
}

/** The three rates the page shows. */
export function habitRates(habit, { today = new Date() } = {}) {
  const starts = periodStarts(today);
  return {
    week: periodRate(habit, { from: starts.week, today }),
    month: periodRate(habit, { from: starts.month, today }),
    year: periodRate(habit, { from: starts.year, today })
  };
}

/**
 * A year of days, as columns of weeks Monday to Sunday, the last column the
 * week of today: `[{ start, days: [{ key, date, mark, rest, future, isToday }] }]`.
 */
export function yearGrid(habit, { today = new Date(), weeks = 53 } = {}) {
  const end = midnight(today);
  const schedule = normalizeSchedule(habit?.schedule);
  const log = habit?.log || {};
  const first = addDays(weekStart(end), -7 * (weeks - 1));
  const columns = [];
  for (let w = 0; w < weeks; w += 1) {
    const start = addDays(first, 7 * w);
    const days = [];
    for (let d = 0; d < 7; d += 1) {
      const date = addDays(start, d);
      const key = dayKey(date);
      days.push({
        key,
        date,
        mark: dayMark(log[key]),
        rest: !isDue(schedule, date),
        future: date > end,
        isToday: date.getTime() === end.getTime()
      });
    }
    columns.push({ start, days });
  }
  return columns;
}
