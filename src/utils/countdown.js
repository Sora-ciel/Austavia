/**
 * The timer page of the clock block -- a countdown that rings when it runs out.
 *
 * ## What was asked for
 *
 * "And now the timer, let's add a timer, on the bottom left corner probably."
 * — 2026-09-27. The third page, after the alarm (top right) and the stopwatch
 * (top left), with the same corner rule: the corner shows the timer from the
 * other pages, and on the timer's own page shows the time and leads back to
 * the clock.
 *
 * ## Kept as moments, like the stopwatch
 *
 * A running timer is the moment it ends, never a number counted down by a
 * timer. What is left is worked out from the clock on every read, so a phone
 * that slept or a reload mid-run is right on return -- and a timer that ran
 * out while nobody was looking is found run out, and rings.
 *
 * ## On this device only
 *
 * Like the stopwatch and the page. It is something being used now, not part of
 * the note, and syncing it would ring it on every device that has the folder
 * open. The alarm is the one that syncs: it is a time of day, which means the
 * same thing everywhere. A countdown started here means "from now, here".
 *
 * ## Ringing, and not ringing late
 *
 * Out of time, it rings until somebody stops it, for as long as an alarm would
 * (the same ten minutes). After that it goes quiet and says it is done, rather than
 * go off whenever the app is next opened -- the alarm's rule, for the same
 * reason.
 */
/**
 * How long a run-out timer rings before it gives up -- the alarm's window.
 * Its own constant rather than imported, because alarm.js reads timers from
 * this module and the two would otherwise import each other.
 */
export const RING_WINDOW_MS = 10 * 60 * 1000;

/** What a new timer is set to. */
export const DEFAULT_DURATION_MS = 5 * 60 * 1000;

/** The longest a timer can be set to: what the reading can show. */
export const MAX_DURATION_MS = (99 * 3600 + 59 * 60 + 59) * 1000;

const count = input => (Number.isFinite(Number(input)) && Number(input) > 0 ? Number(input) : 0);
const pad = value => String(value).padStart(2, '0');

function clampDuration(ms) {
  const whole = Math.round(count(ms) / 1000) * 1000;
  if (!whole) return 0;
  return Math.min(MAX_DURATION_MS, whole);
}

/** A timer as it was stored, whatever was stored. */
export function readTimer(value) {
  const stored = value && typeof value === 'object' ? value : {};
  return {
    // What it counts down from.
    duration: clampDuration(stored.duration) || DEFAULT_DURATION_MS,
    // When a running timer runs out; 0 when it is not running.
    endsAt: count(stored.endsAt),
    // What was left when it was paused; 0 when it is not paused.
    remaining: count(stored.remaining)
  };
}

/**
 * Where the timer is: 'idle' (set, not started), 'running', 'paused',
 * 'ringing' (run out, and nobody has stopped it yet) or 'done' (run out long
 * enough ago that it has stopped ringing on its own).
 */
export function timerState(timer, now = Date.now()) {
  const state = readTimer(timer);
  if (state.endsAt) {
    if (now < state.endsAt) return 'running';
    return now - state.endsAt < RING_WINDOW_MS ? 'ringing' : 'done';
  }
  if (state.remaining) return 'paused';
  return 'idle';
}

/** How much time is left, at `now`. */
export function timeLeft(timer, now = Date.now()) {
  const state = readTimer(timer);
  if (state.endsAt) return Math.max(0, state.endsAt - now);
  if (state.remaining) return state.remaining;
  return state.duration;
}

export function startTimer(timer, now = Date.now()) {
  const state = readTimer(timer);
  const phase = timerState(state, now);
  if (phase === 'running' || phase === 'ringing') return state;
  const from = phase === 'paused' ? state.remaining : state.duration;
  return { ...state, endsAt: now + from, remaining: 0 };
}

export function pauseTimer(timer, now = Date.now()) {
  const state = readTimer(timer);
  if (timerState(state, now) !== 'running') return state;
  return { ...state, endsAt: 0, remaining: state.endsAt - now };
}

/** Back to its set length, stopped. Also what "Stop" on a ringing timer does. */
export function resetTimer(timer) {
  return { ...readTimer(timer), endsAt: 0, remaining: 0 };
}

/** Sets how long it counts, only while it is not in use -- a running timer is not re-aimed under somebody. */
export function setDuration(timer, ms, now = Date.now()) {
  const state = readTimer(timer);
  if (timerState(state, now) !== 'idle') return state;
  const duration = clampDuration(ms);
  return duration ? { ...state, duration } : state;
}

/** One more minute, from now -- the thing people want from a timer that just went off. */
export function oneMoreMinute(timer, now = Date.now()) {
  const state = readTimer(timer);
  const phase = timerState(state, now);
  if (phase === 'running') return { ...state, endsAt: state.endsAt + 60_000 };
  if (phase === 'paused') return { ...state, remaining: state.remaining + 60_000 };
  return { ...state, endsAt: now + 60_000, remaining: 0 };
}

/**
 * A length typed by a person, in milliseconds, or 0 when it is not one.
 *
 * `5` is five minutes -- a bare number is what a timer is usually set in.
 * `1:30` is a minute and a half, `1:02:03` an hour, two minutes and three
 * seconds. Seconds and minutes past 59 are refused rather than carried: `1:75`
 * is a typo, not a quarter past two.
 */
export function parseDuration(text) {
  const value = String(text ?? '').trim();
  if (!value) return 0;

  if (/^\d+(\.\d+)?$/.test(value)) return clampDuration(Number(value) * 60_000);

  const parts = value.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !/^\d+$/.test(part))) return 0;
  const numbers = parts.map(Number);
  const [hours, minutes, seconds] = numbers.length === 3 ? numbers : [0, ...numbers];
  if (numbers.length === 3 && minutes > 59) return 0;
  if (seconds > 59) return 0;
  return clampDuration(((hours * 60 + minutes) * 60 + seconds) * 1000);
}

/**
 * What is left, the way a timer reads: `5:00`, `0:07`, `1:02:03`.
 *
 * Rounded up to the second, not down: a timer with half a second to go has not
 * reached 0:00, and should not say so until it has.
 */
export function timerReading(ms) {
  const total = Math.ceil(Math.max(0, Number(ms) || 0) / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * How long until anything shown about the timer changes -- its next second
 * while running, the end of its ringing while ringing. Null when nothing will.
 */
export function msUntilTimerChange(timer, now = Date.now()) {
  const state = readTimer(timer);
  const phase = timerState(state, now);
  if (phase === 'running') {
    const left = state.endsAt - now;
    return (left % 1000 || 1000) + 5;
  }
  if (phase === 'ringing') return state.endsAt + RING_WINDOW_MS - now + 5;
  return null;
}

/**
 * How long until the timer starts or stops ringing -- all the ringer needs,
 * so it does not wake every second to watch one count down. Null when neither
 * is coming.
 */
export function msUntilTimerRingChange(timer, now = Date.now()) {
  const state = readTimer(timer);
  const phase = timerState(state, now);
  if (phase === 'running') return state.endsAt - now + 5;
  if (phase === 'ringing') return state.endsAt + RING_WINDOW_MS - now + 5;
  return null;
}

/**
 * What the bottom-left corner shows.
 *
 * On the timer page, the time, leading back to the clock. Elsewhere the timer:
 * what is left while it runs or is paused, 0:00 while it rings, and the icon
 * alone when it is not in use -- the corner is still the way in.
 *
 * `kind` is 'time', 'timer' or 'icon'; `ringing` says it has run out.
 */
export function timerCorner({ page = 'clock', timer = null, now = Date.now(), clockTime = '' } = {}) {
  if (page === 'timer') return { kind: 'time', text: clockTime, ringing: false };
  const phase = timerState(timer, now);
  if (phase === 'running' || phase === 'paused' || phase === 'ringing') {
    return { kind: 'timer', text: timerReading(timeLeft(timer, now)), ringing: phase === 'ringing' };
  }
  return { kind: 'icon', text: '', ringing: false };
}
