/**
 * Letting go of a sync lock that nothing is going to release.
 *
 * Sync guards itself with a handful of "in progress" flags: an upload, a
 * download, the bootstrap, the gate. Each is set before the work and cleared in
 * a `finally`, which covers success and covers failure.
 *
 * It does not cover a promise that never settles. A request that hangs — a
 * phone that changed network mid-call, a socket the OS kept open and never fed
 * — leaves the `await` waiting for ever, so the `finally` never runs and the
 * flag stays true for the life of the process. Every later sync then returns
 * early at the guard, and nothing says why.
 *
 * That is the shape reported: sync stuck indefinitely on a phone, force-stopping
 * the app fixes it, and swiping it out of the recents list does not. Swiping
 * away does not have to kill the process, so the stuck flag survives it; a force
 * stop takes the memory holding it.
 *
 * It is also the rule in CLAUDE.md: a value kept by events needs something that
 * recomputes it. A lock released by a completion needs something that can
 * release it without one.
 *
 * ## Staleness is measured from progress, not from the start
 *
 * Timing out the whole operation would be wrong. Uploading a folder of pictures
 * on a slow connection legitimately takes minutes, and pulling the lock out from
 * under a working upload starts a second one alongside it — two writers on one
 * folder, which is the thing sync exists to avoid.
 *
 * So the holder says it is still getting somewhere — each file, each step — and
 * a lock is stale only when nothing has moved for a while. A working upload
 * refreshes itself however long it runs; a hung one stops refreshing the moment
 * it hangs.
 */

/**
 * How long a lock may sit without progress before it is considered abandoned.
 *
 * Generous on purpose. This is the gap between one file finishing and the next
 * starting, not the length of the whole job, and on a poor connection a single
 * large file can take a while. Too short and a working sync gets interrupted;
 * too long and someone waits. Two minutes is long enough that reaching it means
 * something really is wrong.
 */
export const STALL_LIMIT_MS = 2 * 60 * 1000;

/**
 * The locks that have stopped moving.
 *
 * `held` maps a lock's name to the time it last reported progress, or null when
 * nothing holds it. Returns the names worth releasing, so the caller can say
 * which ones it broke rather than clearing the lot silently.
 *
 * A timestamp in the future is not treated as stale: a device whose clock moved
 * is not evidence that sync is stuck, and cutting a live upload on that basis is
 * worse than waiting.
 */
export function stalledLocks(held = {}, now = Date.now(), limit = STALL_LIMIT_MS) {
  const stalled = [];

  for (const [name, since] of Object.entries(held || {})) {
    if (since === null || since === undefined) continue;
    const at = Number(since);
    if (!Number.isFinite(at)) continue;
    if (now - at >= limit) stalled.push(name);
  }

  return stalled;
}

/** Whether anything is holding a lock at all. */
export function anyHeld(held = {}) {
  return Object.values(held || {}).some((since) => since !== null && since !== undefined);
}
