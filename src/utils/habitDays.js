/**
 * Which days a habit shows, and what a day is called.
 *
 * ## What was asked for
 *
 * "For habit tracker I want to make changes for the mobile version: make it so
 * that one habit just takes around the height of two lines, and that the days
 * to press for it to be done are small enough to see **the last 7 days**.
 * Basically the habits shouldn't be as big, and especially for mobile — right
 * now it's not workable."
 *
 * ## The window runs backwards, not forwards
 *
 * It used to count *forward* from today: today and the next thirteen days. So
 * the only days on screen were ones that had not happened yet, and yesterday —
 * the day you most often need, because you forgot to tick it — could not be
 * reached at all. Marking a day you have not lived through is not tracking a
 * habit.
 *
 * So the window ends today and runs back from it. Oldest on the left, today on
 * the right, which is the direction a week is read in and where the eye goes
 * for "now".
 *
 * ## A day is a local day
 *
 * The key used to come from `toISOString().slice(0, 10)`, which is UTC. West of
 * Greenwich that is tomorrow for the last few hours of every evening — at
 * 22:24 in New York it reads 2026-09-19 for a day that is still the 18th. So
 * ticking a habit after dinner wrote it against the wrong day, every day, and
 * the tick appeared on a square that had not arrived yet.
 *
 * A habit is kept in the day *you* are living in, so the key is built from the
 * local parts of the date and never from an instant in UTC.
 */

/** A phone has room for a week; anything wider gets a fortnight. */
export const DAYS_ON_PHONE = 7;
export const DAYS_ON_DESKTOP = 14;

/** The width at or under which a week is all that fits — the app's own breakpoint. */
export const COMPACT_WIDTH = 1024;

/** How many days belong on screen at this width. */
export function daysToShow({ width } = {}) {
  const measured = Number(width);
  if (!Number.isFinite(measured)) return DAYS_ON_DESKTOP;
  return measured <= COMPACT_WIDTH ? DAYS_ON_PHONE : DAYS_ON_DESKTOP;
}

/**
 * A date as the day it is where the person is standing.
 *
 * Deliberately not `toISOString`. See above: that is UTC, and a habit belongs
 * to the local day it was done in.
 */
export function dayKey(date) {
  // Filtered before coercing, not after. `new Date(null)` is not an invalid
  // date, it is the first of January 1970 — so a null would sail through the
  // NaN check below and come back as a real-looking key for a day in 1969.
  // The same trap `clampScale` in typeScale.js carries a scar from.
  if (date === null || date === undefined || date === '') return '';
  const at = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(at.getTime())) return '';
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The window of days to show: `count` of them, ending today.
 *
 * Oldest first, today last. Built by stepping a local date back and forward
 * rather than by subtracting milliseconds, so the clocks going forward or back
 * does not swallow or repeat a day.
 */
export function recentDays({ today = new Date(), count = DAYS_ON_PHONE } = {}) {
  const howMany = Math.max(1, Math.floor(Number(count) || 0));
  const end = today instanceof Date ? today : new Date(today);
  if (Number.isNaN(end.getTime())) return [];

  const days = [];
  for (let back = howMany - 1; back >= 0; back -= 1) {
    // A fresh date each time, moved by whole days. Reusing one and stepping it
    // repeatedly is how a month boundary goes wrong.
    const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - back);
    days.push({ key: dayKey(date), date, isToday: back === 0 });
  }
  return days;
}
