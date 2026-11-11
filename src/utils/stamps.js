/**
 * The stamp a change made on this device is saved with.
 *
 * ## What happened
 *
 * Reported on 2026-11-11: on Windows the phone's changes stopped arriving,
 * while Windows's own went on reaching the phone. The PC's clock had been
 * about four hours fast (Windows corrected it at the next time sync), and in
 * that time a folder was saved with a stamp four hours in the future. Sync
 * keeps whichever copy has the later stamp, so from then on:
 *
 * - the phone took that copy, which looked newer than anything it had;
 * - every edit made after it, stamped with the real time, looked *older* than
 *   the copy it was made from -- so Windows kept its own and even sent it back
 *   up over the phone's changes.
 *
 * Putting the clock right did not help: the future stamp was already written,
 * and would have kept winning until the real time caught up with it.
 *
 * ## So
 *
 * An edit is stamped later than the copy it was edited from: the clock, or one
 * millisecond past the previous stamp, whichever is later. Ordering between
 * copies then never runs backwards, whatever any device's clock says -- a
 * stamp in the future is carried forward by the next edit instead of
 * outranking it.
 */
export function nextStamp(previous, now = Date.now()) {
  const before = Number(previous) || 0;
  const clock = Number(now) || 0;
  return Math.max(clock, before + 1);
}
