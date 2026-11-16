/**
 * The calendar: time blocks on days, and the rules for putting them there.
 *
 * ## What was asked for
 *
 * 2026-11-10: "Add a calendar mode and block where you can put time blocks
 * easily of what you will do at a certain hour ... with different time maybe
 * you want to do something for 12min till the next hour. maybe it's a clean
 * 1h block. or maybe 30. be able to have the day blocked. I think we'll focus
 * on the day by day way of showing the calendar for now. and you will be
 * able to see the calendar on other modes, the ones that share all the other
 * blocks already."
 *
 * ## The shape
 *
 * A `calendar` block holds `events`: `{ id, date: 'YYYY-MM-DD', start, end,
 * title, allDay }`, start and end in minutes from midnight, so 10:48 to 11:00
 * is 648 to 660. A day blocked is `allDay: true`. The date is the day as
 * written, not an instant: 9:00 stays 9:00 on a phone in another time zone,
 * as an agenda is read. Fields a newer build adds are kept (keepUnknown).
 *
 * ## The rules (here, so they can be tested)
 *
 * - Dragging snaps to 5 minutes, so 10:48 is reachable by dragging and any
 *   minute by typing the time (`parseTime`).
 * - A click on an empty hour makes a block of an hour, from the quarter hour
 *   clicked.
 * - Blocks at the same time sit side by side (`layoutDay`).
 */

import { withUnknown } from './keepUnknown.js';

export const DAY_MINUTES = 24 * 60;
export const SNAP = 5;
export const MIN_LENGTH = 5;
export const CLICK_LENGTH = 60;

const clampMinutes = value => Math.max(0, Math.min(DAY_MINUTES, Math.round(Number(value) || 0)));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A minute snapped to the nearest step. */
export function snap(minutes, step = SNAP) {
  return clampMinutes(Math.round(minutes / step) * step);
}

/** One event, cleaned: a real date, times within the day, at least 5 minutes long, unknown fields kept. */
export function normalizeEvent(event) {
  if (!event || typeof event !== 'object' || !event.id || !DATE_RE.test(String(event.date || ''))) return null;
  let start = clampMinutes(event.start);
  let end = clampMinutes(event.end);
  if (end - start < MIN_LENGTH) {
    end = Math.min(DAY_MINUTES, start + MIN_LENGTH);
    start = Math.min(start, end - MIN_LENGTH);
  }
  const known = {
    id: String(event.id),
    date: event.date,
    start,
    end,
    title: String(event.title ?? ''),
    allDay: event.allDay === true,
    // Its colour (asked 2026-11-10), any CSS colour; '' for the writing's.
    color: typeof event.color === 'string' ? event.color : ''
  };
  // Repeating (asked 2026-11-16), only when it is one this build can read: a
  // repeat it cannot is left as the newer build wrote it (withUnknown) and the
  // event shows on its own day, rather than on days somebody did not choose.
  const repeat = normalizeRepeat(event.repeat);
  if (repeat) {
    known.repeat = repeat;
    known.skip = Array.isArray(event.skip) ? event.skip.filter(key => DATE_RE.test(String(key))) : [];
  }
  return withUnknown(known, event, Object.keys(known));
}

export function normalizeEvents(events) {
  return (Array.isArray(events) ? events : []).map(normalizeEvent).filter(Boolean);
}

/**
 * A typed time, in minutes, or null: "9", "9:12", "9h12", "912", "21:05",
 * "9pm", "12am", "9.30".
 */
export function parseTime(text) {
  const raw = String(text ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\d{1,2})(?:[:h.]?(\d{2}))?(am|pm|a|p)?$/.exec(raw) || /^(\d{1,2})(\d{2})(am|pm|a|p)?$/.exec(raw);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const half = m[3]?.[0];
  if (minutes > 59) return null;
  if (half) {
    if (hours < 1 || hours > 12) return null;
    hours = hours % 12 + (half === 'p' ? 12 : 0);
  }
  if (hours > 24 || (hours === 24 && minutes)) return null;
  return hours * 60 + minutes;
}

/** Minutes as a time to read: "10:48", or "10:48 am" on a 12-hour clock. */
export function formatTime(minutes, hour12 = false) {
  const value = clampMinutes(minutes);
  const h = Math.floor(value / 60) % 24;
  const m = String(value % 60).padStart(2, '0');
  if (!hour12) return `${value === DAY_MINUTES ? 24 : h}:${m}`;
  const shown = h % 12 || 12;
  return `${shown}:${m} ${h < 12 || value === DAY_MINUTES ? 'am' : 'pm'}`;
}

/** How long, to read: "12 min", "1 h", "1 h 30". */
export function formatLength(minutes) {
  const value = Math.max(0, Math.round(minutes));
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** The day as 'YYYY-MM-DD', in this device's own calendar. */
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** A day key moved by whole days. */
export function addDays(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}

/** The day to read: "Tuesday 10 November", the year added when it is not this one. */
export function dayLabel(key, { today = dateKey(), locale } = {}) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  if (String(y) !== today.slice(0, 4)) options.year = 'numeric';
  return date.toLocaleDateString(locale, options);
}

// ── Repeating ──────────────────────────────────────────────────────────
//
// Asked 2026-11-16: "make it so that we can make a task repeat. every day,
// every two days, every week at that day etc". A repeating event is stored
// once, with its rule: `repeat: { every, unit }` (unit 'day', 'week' or
// 'month'), from its own `date` on, and `skip`, the days taken out one by one
// ("delete this day"). Each day works out whether it happens then -- nothing
// is copied, so changing its name or time changes every day of it.

export const REPEAT_UNITS = ['day', 'week', 'month'];

/** A repeat rule this build can read, cleaned, or null. */
export function normalizeRepeat(repeat) {
  if (!repeat || typeof repeat !== 'object' || !REPEAT_UNITS.includes(repeat.unit)) return null;
  const every = Math.max(1, Math.min(365, Math.floor(Number(repeat.every) || 1)));
  const out = { ...repeat, every, unit: repeat.unit };
  if (out.until !== undefined && !DATE_RE.test(String(out.until))) delete out.until;
  return out;
}

const daysBetween = (fromKey, toKey) => {
  const [a, b, c] = fromKey.split('-').map(Number);
  const [d, e, f] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(d, e - 1, f) - Date.UTC(a, b - 1, c)) / 86400000);
};

/** Whether an event happens on a day: its own day, or a day its rule falls on. */
export function occursOn(event, key) {
  if (!event || !DATE_RE.test(String(key))) return false;
  if (event.date === key) return !(event.repeat && event.skip?.includes(key));
  const repeat = event.repeat;
  if (!repeat || key < event.date) return false;
  if (repeat.until && key > repeat.until) return false;
  if (event.skip?.includes(key)) return false;
  const days = daysBetween(event.date, key);
  if (repeat.unit === 'day') return days % repeat.every === 0;
  if (repeat.unit === 'week') return days % (7 * repeat.every) === 0;
  // Monthly: the same date, every `every` months. A month without that date
  // (the 31st in April) is passed over rather than moved.
  const [y1, m1, d1] = event.date.split('-').map(Number);
  const [y2, m2, d2] = key.split('-').map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1);
  return d1 === d2 && months % repeat.every === 0;
}

/** How a repeat reads: "Every day", "Every 2 days", "Every week on Monday". */
export function describeRepeat(repeat, dateKeyOf, { locale } = {}) {
  const r = normalizeRepeat(repeat);
  if (!r) return 'Never';
  const n = r.every;
  if (r.unit === 'day') return n === 1 ? 'Every day' : `Every ${n} days`;
  if (r.unit === 'week') {
    const [y, m, d] = String(dateKeyOf).split('-').map(Number);
    const weekday = new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'long' });
    return n === 1 ? `Every week on ${weekday}` : `Every ${n} weeks on ${weekday}`;
  }
  return n === 1 ? 'Every month' : `Every ${n} months`;
}

/** A repeating event with one day taken out ("delete this day"). */
export function withDaySkipped(event, key) {
  return { ...event, skip: [...new Set([...(event.skip || []), key])] };
}

/**
 * An event dragged from one of its days to another: the whole of it moves by
 * as many days, so a weekly one dragged from Monday to Tuesday is on Tuesdays.
 */
export function shiftedBy(event, fromKey, toKey) {
  if (fromKey === toKey) return event;
  return { ...event, date: addDays(event.date, daysBetween(fromKey, toKey)) };
}

/** A day's events: the whole-day ones, and the timed ones in order. A
 * repeating event appears on each of its days with that day as its `date`;
 * its own first day stays in `seriesDate`. */
export function eventsOn(events, key) {
  const day = normalizeEvents(events)
    .filter(event => occursOn(event, key))
    .map(event => (event.date === key ? event : { ...event, date: key, seriesDate: event.date }));
  return {
    allDay: day.filter(event => event.allDay),
    timed: day.filter(event => !event.allDay).sort((a, b) => a.start - b.start || b.end - a.end)
  };
}

/**
 * The timed events of a day laid out: each gets `column` and `columns`, so
 * events at the same time sit side by side and share the width. Events that
 * overlap, directly or through others, form a group sharing one number of
 * columns; each takes the first column free when it starts.
 */
export function layoutDay(timed) {
  const out = [];
  let group = [];
  let groupEnd = -1;
  const close = () => {
    const columns = Math.max(1, ...group.map(item => item.column + 1));
    for (const item of group) out.push({ ...item, columns });
    group = [];
  };
  for (const event of [...timed].sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (group.length && event.start >= groupEnd) close();
    const busy = new Set(group.filter(item => item.event.end > event.start).map(item => item.column));
    let column = 0;
    while (busy.has(column)) column++;
    group.push({ event, column });
    groupEnd = Math.max(groupEnd, event.end);
  }
  if (group.length) close();
  return out;
}

/** The block a click on an empty spot makes: an hour, from the quarter hour clicked, kept within the day. */
export function clickedSlot(minutes) {
  const start = Math.min(Math.floor(clampMinutes(minutes) / 15) * 15, DAY_MINUTES - CLICK_LENGTH);
  return { start, end: start + CLICK_LENGTH };
}

/** The block a drag across the day makes, from where it started to where it is, snapped, either way round. */
export function draggedSlot(fromMinutes, toMinutes) {
  const a = snap(fromMinutes);
  const b = snap(toMinutes);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  return end - start < MIN_LENGTH ? null : { start, end };
}

/** An event moved by a number of minutes, snapped, kept within the day, its length unchanged. */
export function movedBy(event, minutes) {
  const length = event.end - event.start;
  const start = Math.max(0, Math.min(DAY_MINUTES - length, snap(event.start + minutes)));
  return { ...event, start, end: start + length };
}

/** An event with one edge dragged to a minute, snapped, never shorter than 5 minutes. */
export function resizedTo(event, edge, minutes) {
  const at = snap(minutes);
  if (edge === 'start') return { ...event, start: Math.min(at, event.end - MIN_LENGTH) };
  return { ...event, end: Math.max(at, event.start + MIN_LENGTH) };
}

/** An event with a typed time put in, or null when the time cannot be read. Typed times are not snapped. */
export function withTypedTime(event, edge, text) {
  const at = parseTime(text);
  if (at === null) return null;
  if (edge === 'start') {
    const length = event.end - event.start;
    const start = Math.min(at, DAY_MINUTES - MIN_LENGTH);
    return { ...event, start, end: Math.min(DAY_MINUTES, Math.max(start + MIN_LENGTH, start + length)) };
  }
  if (at <= event.start) return null;
  return { ...event, end: at };
}

/**
 * The seven days of the week holding `key`, Monday first: the 7-day view
 * (asked 2026-11-10, "For the calendar add a 7 day layout").
 */
export function weekOf(key) {
  const [y, m, d] = key.split('-').map(Number);
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7; // Monday 0
  return Array.from({ length: 7 }, (_, i) => addDays(key, i - weekday));
}

/** A day's name in the 7-day view: "Tue 10". */
export function shortDayLabel(key, { locale } = {}) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${date.toLocaleDateString(locale, { weekday: 'short' })} ${d}`;
}

/** The week, to read: "9 – 15 November". */
export function weekLabel(days, { locale } = {}) {
  const [first, last] = [days[0], days[days.length - 1]].map(key => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  });
  const sameMonth = first.getMonth() === last.getMonth();
  const start = first.toLocaleDateString(locale, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  const end = last.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  return `${start} – ${end}`;
}

/** An event moved to another day, its times unchanged. */
export function onDay(event, key) {
  return { ...event, date: key };
}

/**
 * The starts to remind of, from `from` for `days` days: one per timed event
 * on each day it happens, repeats included, soonest first. Whole-day blocks
 * have no start and are left out. `at` is the local wall-clock moment.
 */
export function upcomingStarts(events, { from = new Date(), days = 14 } = {}) {
  const list = normalizeEvents(events);
  const out = [];
  const firstKey = dateKey(from);
  for (let i = 0; i < days; i += 1) {
    const key = addDays(firstKey, i);
    const [y, m, d] = key.split('-').map(Number);
    for (const event of list) {
      if (event.allDay || !occursOn(event, key)) continue;
      const at = new Date(y, m - 1, d, Math.floor(event.start / 60), event.start % 60).getTime();
      if (at < from.getTime()) continue;
      out.push({ key: `${event.id}@${key}`, at, title: event.title, start: event.start, end: event.end });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
