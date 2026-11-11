/**
 * The thirty-second backstop, made cheap.
 *
 * Every open device asked the cloud for the whole index every 30 s, so that a
 * change the live subscription missed is still found (CLAUDE.md: something
 * must recompute). Measured 2026-11-11: about nine tenths of everything the
 * database sent last month -- 366 MB against 38 MB written -- and the one cost
 * that grows with how long the app stays open rather than with use.
 *
 * Now every write to the index also writes one small number beside it,
 * `indexStamp` (firebaseClient.js), and the backstop reads that. The whole
 * index is read only when the stamp has moved since the last full read -- or
 * is unknown -- and in any case every FULL_READ_EVERY_MS, so a stamp that
 * failed to be written cannot leave a device blind for ever. Absolute, like
 * every other pass here: worked out from what is in the cloud each time.
 */
export const FULL_READ_EVERY_MS = 10 * 60 * 1000;

/** Whether this tick must read the whole index. */
export function backstopNeedsFullRead({ stamp = null, lastStamp = null, lastFullReadAt = 0, now = Date.now() } = {}) {
  if (stamp === null || stamp === undefined) return true;
  if (stamp !== lastStamp) return true;
  return now - (Number(lastFullReadAt) || 0) >= FULL_READ_EVERY_MS;
}
