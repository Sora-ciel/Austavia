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

/** The ticks, keyed by day, in a fixed order and with nothing else in them. */
function normalizeLog(log) {
  if (!log || typeof log !== 'object') return {};

  const days = Object.keys(log)
    .filter(key => DAY_KEY.test(key) && log[key])
    .sort();

  // Rebuilt rather than filtered in place: an object's key order is part of
  // what JSON.stringify produces, and two devices must serialise the same
  // habits to the same string or each will think the other has edited it.
  const out = {};
  for (const day of days) out[day] = true;
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

    out.push({ id, name, log: normalizeLog(habit.log) });
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
