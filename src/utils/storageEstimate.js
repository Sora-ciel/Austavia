/**
 * Showing what the account holds now, rather than what it held thirty seconds
 * ago.
 *
 * ## What was asked for
 *
 * "Show the storage on our app instant from the client side instead of the
 * server one. Just make sure that when the cloud sends its update it's the
 * same storage counted — if not, write it in the diagnostic and logs. And put
 * the cloud's storage count as the true storage." — 2026-09-27.
 *
 * ## An estimate in front of the truth
 *
 * The server's number is the only one that counts, and it cannot be quick: it
 * is arrived at by the file landing, a trigger firing, a balance being
 * rewritten and a subscription carrying it back. Measured at about thirty
 * seconds.
 *
 * So what is shown is the last number the server gave, plus what this device
 * has done since. That is instant, and it is right in every case where nothing
 * else is touching the account.
 *
 * Three rules make it honest rather than merely fast:
 *
 * - **The server's number always wins.** When a record arrives, the estimate
 *   is thrown away and the new figure is adopted whole. The estimate is a
 *   guess about the gap, never a correction to what came back.
 * - **Every guess is checked.** When the record arrives, what was predicted is
 *   compared with what actually happened, and a disagreement is written to the
 *   sync log and the diagnostics. A guess nobody checks is a lie with a
 *   refresh rate.
 * - **Disagreeing is not a fault.** Another device uploading, a sweep removing
 *   something, JSON overhead — all of them move the real number without this
 *   one knowing. It is recorded because it is worth knowing, not because
 *   something is broken.
 */

/**
 * How far out a prediction may be before it is worth mentioning.
 *
 * A folder is stored as JSON, so what a picture costs is its data URL plus
 * whatever punctuation the surrounding structure needs, and the app cannot
 * know that to the byte. A few kilobytes of disagreement is arithmetic; a
 * megabyte is something else having happened.
 */
export const DRIFT_TOLERANCE = 8 * 1024;

function totalOf(usage) {
  if (!usage) return 0;
  const total = Number(usage.total);
  if (Number.isFinite(total) && total >= 0) return total;
  return Math.max(0, Number(usage.bytes) || 0);
}

/**
 * The record to show, with this device's uncounted changes folded in.
 *
 * Returns the record itself when there is nothing pending, so the common case
 * costs nothing and the object identity is unchanged.
 */
export function estimatedUsage(usage, pendingBytes = 0) {
  const pending = Number(pendingBytes) || 0;
  if (!usage || pending === 0) return usage;

  const total = Math.max(0, totalOf(usage) + pending);
  const limit = usage.limit;
  const ceiling = limit === null || limit === undefined ? Number.POSITIVE_INFINITY : Number(limit);

  return {
    ...usage,
    total,
    // Recomputed rather than carried over: a prediction that says there is
    // room while showing a total past the ceiling is worse than no prediction,
    // because the two are read together.
    full: Number.isFinite(ceiling) ? total > ceiling : false,
    estimated: true
  };
}

/**
 * What was predicted against what arrived.
 *
 * `agrees` is the answer; the numbers are there so a disagreement can be read
 * rather than merely noticed.
 */
export function driftReport({ previous = null, pendingBytes = 0, arrived = null } = {}) {
  const expected = Math.max(0, totalOf(previous) + (Number(pendingBytes) || 0));
  const actual = totalOf(arrived);
  const difference = actual - expected;

  return {
    agrees: Math.abs(difference) <= DRIFT_TOLERANCE,
    expected,
    actual,
    difference
  };
}

/** The sentence for the sync log and the diagnostics. */
export function describeDrift(report) {
  if (!report || report.agrees) return '';

  const direction = report.difference > 0 ? 'more' : 'less';
  return `the cloud counted ${Math.abs(report.difference)} bytes ${direction} than this device predicted`;
}
