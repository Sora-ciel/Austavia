/**
 * The stopwatch page of the clock block.
 *
 * ## What was asked for
 *
 * "Now let's add a chronometer mode that will be on the other corner to click
 * on." — 2026-09-27. The alarm has the top-right corner; the stopwatch has the
 * top-left, and follows the same rule: a corner shows its own page's news, and
 * on its own page it shows the time and leads back to the clock.
 *
 * ## Kept as moments, not counted
 *
 * A running stopwatch is remembered as the moment it was started and what it
 * had already counted before that -- never as a number ticked up by a timer.
 * Elapsed time is worked out from the clock every time it is read. So a phone
 * that slept, a tab in the background, or a reload in the middle of a run all
 * read the right figure when they come back, rather than having lost whatever
 * time nobody was counting.
 *
 * ## On this device only
 *
 * Like the page, a stopwatch is this device's and is not synced: it is a thing
 * somebody is using right now, not part of the note, and syncing every start
 * and lap would put a save in the folder for each press.
 */

/** Laps kept -- enough for any real use, and a bound on what local storage holds. */
export const MAX_LAPS = 99;

const pad = (value, size = 2) => String(value).padStart(size, '0');

const count = input => (Number.isFinite(Number(input)) && Number(input) > 0 ? Number(input) : 0);

/** A stopwatch as it was stored, whatever was stored. */
export function readStopwatch(value) {
  const stored = value && typeof value === 'object' ? value : {};
  const laps = Array.isArray(stored.laps) ? stored.laps.map(count).filter(Boolean) : [];
  return {
    // When the current run began; 0 when it is not running.
    runningSince: count(stored.runningSince),
    // What earlier runs counted, before the last pause.
    banked: count(stored.banked),
    // Each lap as the total at the moment it was taken, oldest first.
    laps: laps.slice(-MAX_LAPS)
  };
}

export function isRunning(stopwatch) {
  return readStopwatch(stopwatch).runningSince > 0;
}

/** How much time it has counted, at `now`. */
export function elapsed(stopwatch, now = Date.now()) {
  const state = readStopwatch(stopwatch);
  const running = state.runningSince > 0 ? Math.max(0, now - state.runningSince) : 0;
  return state.banked + running;
}

export function started(stopwatch, now = Date.now()) {
  const state = readStopwatch(stopwatch);
  if (state.runningSince) return state;
  return { ...state, runningSince: now };
}

export function paused(stopwatch, now = Date.now()) {
  const state = readStopwatch(stopwatch);
  if (!state.runningSince) return state;
  return { ...state, banked: elapsed(state, now), runningSince: 0 };
}

/** Takes a lap -- only while running, since a lap of a stopped watch is the same lap again. */
export function lapped(stopwatch, now = Date.now()) {
  const state = readStopwatch(stopwatch);
  if (!state.runningSince) return state;
  return { ...state, laps: [...state.laps, elapsed(state, now)].slice(-MAX_LAPS) };
}

export function reset() {
  return readStopwatch(null);
}

/**
 * The laps newest first, each with its own length and the total at the time.
 * `number` counts from the first lap ever kept, so lap 12 stays lap 12.
 */
export function lapRows(stopwatch) {
  const { laps } = readStopwatch(stopwatch);
  return laps
    .map((total, index) => ({
      number: index + 1,
      split: total - (index ? laps[index - 1] : 0),
      total
    }))
    .reverse();
}

/**
 * The full reading, to the hundredth: `00:05.37`, and `1:02:03.45` past an
 * hour. Hundredths are cut, not rounded, so the figure never reads a moment
 * that has not happened yet.
 */
export function stopwatchReading(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const hundredths = Math.floor((total % 1000) / 10);
  const seconds = Math.floor(total / 1000) % 60;
  const minutes = Math.floor(total / 60000) % 60;
  const hours = Math.floor(total / 3600000);
  const rest = `${pad(seconds)}.${pad(hundredths)}`;
  return hours ? `${hours}:${pad(minutes)}:${rest}` : `${pad(minutes)}:${rest}`;
}

/** The short reading for a corner, to the second: `0:05`, `12:34`, `1:02:03`. */
export function stopwatchShort(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const seconds = Math.floor(total / 1000) % 60;
  const minutes = Math.floor(total / 60000) % 60;
  const hours = Math.floor(total / 3600000);
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * How long until what is shown next changes.
 *
 * `fine` is the stopwatch page itself, which shows hundredths and so redraws
 * about thirty times a second. Anywhere else only the corner shows it, to the
 * second, and it wakes once a second -- aimed at the stopwatch's own second,
 * not the wall clock's. A stopwatch that is not running never changes: null.
 */
export function msUntilStopwatchChange(stopwatch, { now = Date.now(), fine = false } = {}) {
  if (!isRunning(stopwatch)) return null;
  if (fine) return 33;
  return 1000 - (elapsed(stopwatch, now) % 1000) + 5;
}

/**
 * What the top-left corner shows.
 *
 * On the stopwatch page it is the time, and leads back to the clock. Anywhere
 * else it is the stopwatch: its running figure when it has one, and the icon
 * alone when it has not -- the corner is still the way in.
 *
 * `kind` is 'time', 'stopwatch' or 'icon'; `running` says whether it is moving.
 */
export function stopwatchCorner({ page = 'clock', stopwatch = null, now = Date.now(), clockTime = '' } = {}) {
  if (page === 'stopwatch') return { kind: 'time', text: clockTime, running: false };
  const counted = elapsed(stopwatch, now);
  if (isRunning(stopwatch) || counted > 0) {
    return { kind: 'stopwatch', text: stopwatchShort(counted), running: isRunning(stopwatch) };
  }
  return { kind: 'icon', text: '', running: false };
}
