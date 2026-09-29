/**
 * The timer on the app's toolbar.
 *
 * ## What was asked for
 *
 * "It would be great for the timer to be on the controls when you're in the
 * app, and if you click on it, it shows the buttons so you can use them." —
 * 2026-09-29. Like the mini player: a running timer is reachable from any
 * mode, without going back to the clock block that started it.
 *
 * ## What it shows
 *
 * The timers in use in the open folder -- running, paused or ringing. The
 * chip shows the one that matters most (see `activeTimers` for the order) and
 * how many there are; its panel lists them all. A timer set but not started
 * is not "in use" and shows nothing, so the chip is only there while there is
 * something to see.
 *
 * ## Where it goes
 *
 * "On phone I believe the timer should be a notification instead, but not
 * show on controls, cause that would take too much space" -- 2026-09-29. So
 * the Android app puts it in the notification shade (TimerNotifications.java)
 * and not on the toolbar, and a phone-sized browser, which has no shade to
 * put it in, leaves it on the clock block. See `timerPlace`.
 *
 * Pure: the chip reads this device's memory of each clock
 * (clockDeviceStore.js) and hands it here.
 */
import { timerState, timeLeft, timerReading } from './countdown.js';

const ORDER = { ringing: 0, running: 1, paused: 2 };

/**
 * A timer stopped from the chip's panel stays in it while it is open, so it
 * can be started again from there -- the same as Stop on the pop-up, which
 * sets the timer back rather than taking it away. It sits last.
 */
const STOPPED = 3;

/**
 * The folder's timers in use, most pressing first: ringing ones, then running
 * ones by how soon they end, then paused ones by how much they have left.
 */
export function activeTimers({ blocks = [], devices = {}, now = Date.now(), keep = [] } = {}) {
  const found = [];
  for (const block of blocks || []) {
    if (block?.type !== 'clock' || !block.id) continue;
    const timer = (devices[block.id] || {}).timer;
    let phase = timerState(timer, now);
    if (!(phase in ORDER)) {
      if (!keep.includes(block.id)) continue;
      phase = 'stopped';
    }
    found.push({ blockId: block.id, phase, left: timeLeft(timer, now), duration: timer?.duration || 0 });
  }
  const rank = phase => ORDER[phase] ?? STOPPED;
  return found.sort((a, b) => rank(a.phase) - rank(b.phase) || a.left - b.left);
}

/** At or under this width a browser is a phone, and the toolbar has no room. */
export const PHONE_WIDTH = 600;

/**
 * Where the timer shows: 'toolbar', 'notification' (the Android app) or
 * 'none' (a phone-sized browser -- the clock block still has it).
 */
export function timerPlace({ nativeAndroid = false, width = Infinity } = {}) {
  if (nativeAndroid) return 'notification';
  return width <= PHONE_WIDTH ? 'none' : 'toolbar';
}

/**
 * What the notification says, from `activeTimers`: the most pressing timer,
 * with a count of the others in its title. Null when there is nothing to
 * show. A running one is shown as the moment it ends, which Android counts
 * down to on its own -- so it stays right with the app asleep. `endsAt` is a
 * string because that is how it crosses to Java intact.
 */
export function timerNotice(timers = [], devices = {}) {
  const shown = (timers || []).filter(entry => entry.phase !== 'stopped');
  const first = shown[0];
  if (!first) return null;
  const endsAt = first.phase === 'running' ? Number(devices[first.blockId]?.timer?.endsAt) || 0 : 0;
  return {
    blockId: first.blockId,
    phase: first.phase,
    endsAt: String(endsAt),
    title: shown.length > 1 ? `Timer (+${shown.length - 1} more)` : 'Timer',
    text: first.phase === 'ringing' ? "Time's up" : first.phase === 'paused' ? `Paused · ${timerReading(first.left)}` : ''
  };
}

/** Two notices that would draw the same notification. */
export function sameNotice(a, b) {
  if (!a || !b) return a === b;
  return a.blockId === b.blockId && a.phase === b.phase && a.endsAt === b.endsAt && a.title === b.title && a.text === b.text;
}
