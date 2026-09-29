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
 * Pure: the chip reads this device's memory of each clock
 * (clockDeviceStore.js) and hands it here.
 */
import { timerState, timeLeft } from './countdown.js';

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
