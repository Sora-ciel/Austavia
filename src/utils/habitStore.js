/**
 * Habits, as something a folder owns and two devices can share.
 *
 * ## What was asked for
 *
 * "Let's add a file that will be the habit tracker one for each folder, and it
 * will be one used for sync between devices — make it work like our other
 * syncs." — 2026-09-26.
 *
 * Until now the tracker kept one list in `localStorage`, which made it two
 * things it should not have been: **the same list in every folder**, and a
 * list that existed on one device only. Ticking a habit on the phone was
 * invisible on the computer, and a folder kept for one part of your life
 * showed another part's habits.
 *
 * ## Why there is no new sync path
 *
 * "Like our other syncs" is the whole design. Habits go into the folder's
 * `modeSettings`, which is already uploaded with the folder, already
 * last-writer-wins per folder, and already understood by every device. A
 * second mechanism would be a second set of conflict rules to get wrong; this
 * way habits are correct for exactly the same reasons the column count is.
 *
 * ## What that costs, and what it buys
 *
 * Whole-folder last-writer-wins means two devices ticking different habits in
 * the same folder, both offline, keep only the folder that lands second. That
 * is the app's existing conflict model — see `project-sync-conflict-model` —
 * and habits are no worse served by it than blocks are.
 *
 * What it demands is that a **round trip must not look like an edit**. A
 * folder that comes down from the cloud, is normalised, and is written back
 * differently would have two devices handing it to each other for as long as
 * both are running — the exact fault `syncRules.js` carries a scar from. So
 * everything here is canonical: the same input always produces the same
 * output, byte for byte, including the order of the day keys.
 */

import { normalizeSchedule } from './habitSchedule.js';
import { normalizeGoal } from './taskGoals.js';

/** A day, as `habitDays.js` writes it. Anything else is not a day. */
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Caps, because this is now a payload rather than a private note to self.
 *
 * Not a guess at how many habits anybody wants — it is far past that. It is
 * there so a corrupt or hostile folder cannot put something unbounded into a
 * node every device downloads.
 */
export const MAX_HABITS = 200;
export const MAX_NAME_LENGTH = 120;

/**
 * An id for a habit that arrived without one.
 *
 * Derived rather than generated: `crypto.randomUUID()` here would mean two
 * devices normalising the same folder produce different ids, which is a folder
 * that never stops changing. Dropping the habit instead would be worse — it is
 * somebody's record of months.
 */
function idFor(habit, index) {
  if (typeof habit.id === 'string' && habit.id.trim() !== '') return habit.id.trim();
  const name = typeof habit.name === 'string' ? habit.name.trim() : '';
  return name ? `name:${name}` : `habit:${index}`;
}

/**
 * What a day says: `'done'` (✓), `'missed'` (✕) or `'skipped'` (–). Anything
 * else is no mark.
 *
 * Skipped was added 2026-10-26 ("a third mark for sick days or travel, so the
 * streak doesn't break"): a day that counts neither way -- see habitStreaks.js.
 *
 * The tracker has always had both -- "Tap a day to mark ✓ or ✕" -- but when
 * habits moved into the folder this store kept only "ticked or not", as
 * `true`. The tracker draws ✓ only for 'done', so every tap was saved and drew
 * nothing; the next tap could not take it back; and every ✕ in the lists that
 * moved over became a tick. Reported on 2026-10-05: "clicking on days doesn't
 * do anything when it should mark them as done or not done".
 *
 * `true` is still read, as done: it is what the builds in between wrote, and
 * in them a tap was the only way to make one.
 */
export function dayMark(value) {
  if (value === 'done' || value === true) return 'done';
  if (value === 'missed') return 'missed';
  if (value === 'skipped') return 'skipped';
  return null;
}

/**
 * A mark this build does not know -- written by a newer one -- that is kept
 * rather than dropped. Before skipped existed, a build that met one deleted it
 * on its next save; from here on a later mark survives an older build, drawn
 * as no mark but never thrown away.
 */
const FOREIGN_MARK = /^[a-z][a-z-]{0,23}$/;
// Words that meant "no mark" in earlier builds, which wrote them for a
// cleared day; they are no mark, not a mark from the future.
const NO_MARK = new Set(['none', 'clear', 'cleared', 'empty']);
const keptMark = value => dayMark(value) ??
  (typeof value === 'string' && FOREIGN_MARK.test(value) && !NO_MARK.has(value) ? value : null);

/** The marks, keyed by day, in a fixed order and with nothing else in them. */
function normalizeLog(log) {
  if (!log || typeof log !== 'object') return {};

  const days = Object.keys(log)
    .filter(key => DAY_KEY.test(key) && keptMark(log[key]))
    .sort();

  // Rebuilt rather than filtered in place: an object's key order is part of
  // what JSON.stringify produces, and two devices must serialise the same
  // habits to the same string or each will think the other has edited it.
  const out = {};
  for (const day of days) out[day] = keptMark(log[day]);
  return out;
}

/** What a habit is made of, and nothing a build reads besides. */
const KNOWN_FIELDS = new Set(['id', 'name', 'log', 'schedule', 'goal']);
/** How big a field this build does not know may be, and still be kept. */
const MAX_FOREIGN_FIELD = 4000;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}

/**
 * The fields of a habit this build does not know, kept as they came.
 *
 * Until 2026-10-26 a habit was rebuilt from its id, name and days alone, so
 * any build meeting something newer -- a schedule, a colour -- deleted it on
 * its next save, and a phone not yet updated undid the computer's work. Kept,
 * in a fixed order so two devices still write the same bytes, and only when
 * small: this is a payload every device downloads.
 */
function foreignFields(habit) {
  const out = {};
  for (const key of Object.keys(habit).sort()) {
    if (KNOWN_FIELDS.has(key) || key.startsWith('_')) continue;
    const value = habit[key];
    if (value === undefined || typeof value === 'function') continue;
    let size = 0;
    try { size = JSON.stringify(value)?.length ?? 0; } catch { continue; }
    if (size === 0 || size > MAX_FOREIGN_FIELD) continue;
    out[key] = canonical(value);
  }
  return out;
}

/**
 * A habit list that can be trusted, whatever it arrived as.
 *
 * Runs on the way in *and* on the way out, so a folder written by an older
 * build, a newer one, or a hand-edited database is the same shape by the time
 * anything reads it.
 */
export function normalizeHabits(value) {
  if (!Array.isArray(value)) return [];

  const out = [];
  const seen = new Set();

  value.forEach((habit, index) => {
    if (!habit || typeof habit !== 'object') return;
    if (out.length >= MAX_HABITS) return;

    const name = typeof habit.name === 'string' ? habit.name.trim().slice(0, MAX_NAME_LENGTH) : '';
    if (name === '') return; // a habit with no name is nothing anyone can tick

    const id = idFor(habit, index);
    if (seen.has(id)) return;
    seen.add(id);

    const kept = { id, name, log: normalizeLog(habit.log) };
    const schedule = normalizeSchedule(habit.schedule);
    if (schedule) kept.schedule = schedule;
    // An amount or a time a day: a Task-mode objective, always daily
    // (habitGoals.js).
    const goal = normalizeGoal(habit.goal);
    if (goal) kept.goal = { ...goal, daily: true };
    out.push({ ...kept, ...foreignFields(habit) });
  });

  return out;
}

/**
 * Whether two habit lists are the same, once both are canonical.
 *
 * The guard in front of every save. Without it, opening a folder that came
 * down from the cloud would write it straight back, stamp a new `modifiedAt`,
 * and two devices would hand the folder to each other for as long as both were
 * open. That is not hypothetical — it is written up in `syncRules.js` as the
 * fault that made a folder bounce between instances.
 */
export function habitsEqual(a, b) {
  return JSON.stringify(normalizeHabits(a)) === JSON.stringify(normalizeHabits(b));
}

/**
 * Whether this device's old private list should become the folder's.
 *
 * Returns the list to adopt, or null when there is nothing to do — which is
 * the answer for every folder after the first, and for every device that never
 * used the old tracker.
 *
 * The folder wins whenever it has anything at all. A folder with habits in it
 * has either been used on this device already or has come down from another,
 * and in both cases the local leftover is the older story.
 */
export function habitsToAdopt({ inFolder, onDevice } = {}) {
  if (normalizeHabits(inFolder).length > 0) return null;

  const mine = normalizeHabits(onDevice);
  return mine.length > 0 ? mine : null;
}

/**
 * A tap on a day: nothing, then ✓, then ✕, then skipped (–), then nothing.
 *
 * Skipped joined the cycle on 2026-10-26, agreed as "a third mark" for sick
 * days and travel. It goes after ✕ so the two marks used most stay one and
 * two taps away; clearing a day now takes one tap more.
 */
export function nextMark(current) {
  const mark = dayMark(current);
  if (mark === null) return 'done';
  if (mark === 'done') return 'missed';
  if (mark === 'missed') return 'skipped';
  return null;
}

/** The habits with one habit's schedule set; undefined is every day. */
export function withScheduleSet(habits, habitId, schedule) {
  const list = normalizeHabits(habits);
  const next = normalizeSchedule(schedule);
  return list.map(habit => {
    if (habit.id !== habitId) return habit;
    const { schedule: _old, ...rest } = habit;
    return next ? { ...rest, schedule: next } : rest;
  });
}

/** The habits with one day of one habit moved on by a tap. */
export function withDayTapped(habits, habitId, day) {
  return normalizeHabits(habits).map(habit => {
    if (habit.id !== habitId) return habit;
    const log = { ...habit.log };
    const next = nextMark(log[day]);
    if (next) log[day] = next;
    else delete log[day];
    return { ...habit, log: normalizeLog(log) };
  });
}

const nameKey = name => String(name || '').trim().toLowerCase();

/**
 * This device's list from before habits synced, merged into a folder's.
 *
 * ## What was asked for
 *
 * "Normally we should keep if a habit was already being kept and the day it
 * was before the syncs, instead of wiping it out" -- 2026-10-05.
 *
 * The first version moved the old list into a folder only when the folder had
 * no habits at all; a folder that already had some -- from another device,
 * say -- left this device's whole history behind. And what did move had its ✕
 * days turned into ticks (see dayMark).
 *
 * ## The rules
 *
 * - A habit on the device is the folder's habit with the same id, or failing
 *   that the same name. One the folder does not have is added.
 * - A day the folder has nothing for takes the device's mark.
 * - A day the folder holds as a bare `true` -- the in-between builds' way of
 *   saying "marked, but which?" -- takes the device's mark, which is how a
 *   ✕ comes back.
 * - A day the folder holds as ✓ or ✕ is the folder's: that was written since,
 *   by somebody who could see both.
 * - A folder with habits but none in common with the device's list is not the
 *   folder the list belongs to, and is left alone (`null`).
 * - `intoEmpty`: whether a folder with no habits takes the whole list. True
 *   for a device whose list never moved; false once it has, or every empty
 *   folder would be handed a copy.
 *
 * `inFolder` is the folder's list *as stored*, before normalising, so a bare
 * `true` can still be told from a ✓. Returns null when this is not the
 * list's folder; otherwise `{ habits, added, restored }`, with `habits` null
 * when the folder already has everything -- which still settles where the
 * list belongs, so the device stops looking.
 */
export function mergeDeviceHabits({ inFolder, onDevice, intoEmpty = true } = {}) {
  const device = normalizeHabits(onDevice);
  if (!device.length) return null;

  const folder = normalizeHabits(inFolder);
  if (!folder.length) {
    return intoEmpty ? { habits: device, added: device.length, restored: 0 } : null;
  }

  // The stored logs, by habit id, to tell `true` from 'done'.
  const rawLogs = new Map();
  (Array.isArray(inFolder) ? inFolder : []).forEach((habit, index) => {
    if (habit && typeof habit === 'object') rawLogs.set(idFor(habit, index), habit.log || {});
  });

  const merged = folder.map(habit => ({ ...habit, log: { ...habit.log } }));
  const byId = new Map(merged.map(habit => [habit.id, habit]));
  const byName = new Map(merged.map(habit => [nameKey(habit.name), habit]));

  let shared = 0;
  let added = 0;
  let restored = 0;

  for (const mine of device) {
    const target = byId.get(mine.id) || byName.get(nameKey(mine.name));
    if (!target) {
      merged.push({ ...mine, log: { ...mine.log } });
      added += 1;
      continue;
    }
    shared += 1;
    const raw = rawLogs.get(target.id) || {};
    for (const [day, mark] of Object.entries(mine.log)) {
      const stored = raw[day];
      if (dayMark(stored) === null || (stored === true && mark !== 'done')) {
        if (target.log[day] !== mark) restored += 1;
        target.log[day] = mark;
      }
    }
  }

  if (!shared) return null;

  const habits = normalizeHabits(merged);
  if (habitsEqual(habits, folder)) return { habits: null, added: 0, restored: 0 };
  return { habits, added, restored };
}

/** One line per change, in words, for the sync log. */
export function describeHabitChange(before, after) {
  const was = normalizeHabits(before);
  const now = normalizeHabits(after);
  const lines = [];
  const symbol = mark => (mark === 'done' ? '✓' : mark === 'missed' ? '✕' : mark === 'skipped' ? '–' : '•');

  const wasById = new Map(was.map(habit => [habit.id, habit]));
  const nowById = new Map(now.map(habit => [habit.id, habit]));

  for (const habit of now) {
    const old = wasById.get(habit.id);
    if (!old) {
      lines.push(`added "${habit.name}"`);
      continue;
    }
    if (old.name !== habit.name) lines.push(`renamed "${old.name}" to "${habit.name}"`);
    const days = new Set([...Object.keys(old.log), ...Object.keys(habit.log)]);
    for (const day of [...days].sort()) {
      if (old.log[day] !== habit.log[day]) {
        lines.push(`"${habit.name}" ${day}: ${symbol(old.log[day])} -> ${symbol(habit.log[day])}`);
      }
    }
  }
  for (const habit of was) {
    if (!nowById.has(habit.id)) lines.push(`removed "${habit.name}"`);
  }
  return lines;
}

/** For the diagnostics report: each habit's ✓ and ✕ counts and last mark. */
export function summariseHabits(habits) {
  return normalizeHabits(habits).map(habit => {
    const days = Object.keys(habit.log);
    return {
      name: habit.name,
      done: days.filter(day => habit.log[day] === 'done').length,
      missed: days.filter(day => habit.log[day] === 'missed').length,
      last: days.length ? days[days.length - 1] : null
    };
  });
}

/**
 * A habit with a new name.
 *
 * Asked 2026-10-25: "Make it possible to change name of the habit. On mobile in
 * the long press pop up." Its days stay exactly as they were: a habit is the
 * same habit under a new name, which is the whole difference from deleting it
 * and adding another.
 *
 * The name is held to what normalizeHabits would make of it -- trimmed, cut to
 * MAX_NAME_LENGTH -- and an empty one is refused rather than saved, since a
 * habit with no name is dropped on the next read and would take its history
 * with it. Refused, and unchanged, both return the list it was given, so the
 * caller's equality guard stops the save.
 */
export function withHabitRenamed(habits, habitId, name) {
  const list = Array.isArray(habits) ? habits : [];
  const next = typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '';
  if (!next) return list;
  const index = list.findIndex(habit => habit?.id === habitId);
  if (index < 0 || list[index].name === next) return list;
  const renamed = list.slice();
  renamed[index] = { ...list[index], name: next };
  return renamed;
}
