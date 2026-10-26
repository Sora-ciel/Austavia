/**
 * When a habit is meant to be done: every day, on some days of the week, or a
 * number of times a week.
 *
 * ## What was asked for
 *
 * Agreed 2026-10-26, from the habit tracker proposal: "Habits that aren't
 * daily: '3 times a week' or 'Mon/Wed/Fri'. Days it isn't due show as rest
 * days, not ✕, and don't break the streak." Built together with a skipped
 * day (habitStore.js), because both change what counts as missed, and that
 * is decided once, in habitStreaks.js.
 *
 * ## Stored
 *
 * Every day is no schedule at all -- the habit simply has none, which is what
 * every habit made before this has, and what an older build sees. Otherwise:
 *
 * - `{ kind: 'days', days: [1, 3, 5] }` -- weekdays as Date.getDay() numbers,
 *   0 Sunday to 6 Saturday, sorted. None, or all seven, is every day.
 * - `{ kind: 'weekly', times: 3 }` -- 1 to 6 times in a week, any days.
 *   Seven is every day.
 *
 * A kind this build does not know, written by a newer one, is kept exactly as
 * it came and treated as every day: guessing at it would mean rewriting
 * somebody's schedule on the strength of a field this build cannot read.
 */

import { canonical, withUnknown } from './keepUnknown.js';

export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** The schedule as stored, or undefined for every day. */
export function normalizeSchedule(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  if (value.kind === 'days') {
    const days = [...new Set((Array.isArray(value.days) ? value.days : [])
      .map(Number)
      .filter(day => Number.isInteger(day) && day >= 0 && day <= 6))]
      .sort((a, b) => a - b);
    if (days.length === 0 || days.length === 7) return undefined;
    return withUnknown({ kind: 'days', days }, value, ['kind', 'days']);
  }
  if (value.kind === 'weekly') {
    const times = Math.round(Number(value.times));
    if (!Number.isFinite(times) || times < 1 || times >= 7) return undefined;
    return withUnknown({ kind: 'weekly', times }, value, ['kind', 'times']);
  }
  if (typeof value.kind === 'string' && value.kind && value.kind !== 'daily') {
    // From a newer build: kept, canonically, and not read.
    return canonical(value);
  }
  return undefined;
}


/** Whether a day is one the habit is meant for. A weekly habit's are all. */
export function isDue(schedule, date) {
  const s = normalizeSchedule(schedule);
  if (!s || s.kind !== 'days') return true;
  return s.days.includes(date.getDay());
}

/** The Monday a day's week starts on. */
export function weekStart(date) {
  const back = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back);
}

/** How a schedule reads, under the habit's name. Empty for every day. */
export function describeSchedule(schedule, { locale } = {}) {
  const s = normalizeSchedule(schedule);
  if (!s) return '';
  if (s.kind === 'weekly') return s.times === 1 ? 'Once a week' : `${s.times}× a week`;
  if (s.kind === 'days') {
    // A known Monday, so the names come out in this person's language.
    const name = day => new Date(2026, 9, 26 + ((day + 6) % 7)).toLocaleDateString(locale, { weekday: 'short' });
    return WEEKDAY_ORDER.filter(day => s.days.includes(day)).map(name).join(', ');
  }
  return '';
}
