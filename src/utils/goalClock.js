/**
 * The clock objective bars read, and the pass that keeps them true.
 *
 * Task mode had this inline; habits with an amount or a time (2026-10-26) need
 * the same, so it lives here (CLAUDE.md, "One of everything"). Two timers:
 *
 * - a tick each second, which only does anything while a timer is running, so
 *   a list with none costs nothing;
 * - a settling pass every 30s, and once at the start: the absolute recompute
 *   (settleTask) that makes a new day start from zero and a finished timer
 *   stop, whatever events were missed -- CLAUDE.md's rule for anything kept
 *   by events.
 *
 * Returns the function that stops both.
 */
export function startGoalClock({
  isRunning = () => false,
  onTick = () => {},
  onSettle = () => {},
  tickMs = 1000,
  settleMs = 30000
} = {}) {
  onSettle();
  const clock = setInterval(() => {
    if (isRunning()) onTick(Date.now());
  }, tickMs);
  const pass = setInterval(onSettle, settleMs);
  return () => {
    clearInterval(clock);
    clearInterval(pass);
  };
}
