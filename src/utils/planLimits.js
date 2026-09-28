/**
 * The storage ceiling for a plan, worked out on this device.
 *
 * ## What was asked for
 *
 * "Change the account limit to free. Normally, even client side, it should
 * calculate the right thing for the plan and not block like the earlier tiny
 * limit." — 2026-09-28.
 *
 * ## Why the app needs its own copy
 *
 * The limit the app judged by came from the server's storage record, which
 * carries the ceiling of the plan it was written under. It is rewritten when
 * a payment moves the plan (applyPlan), and otherwise only when something is
 * uploaded, deleted or reconciled. A plan changed any other way -- by hand on
 * staging, by an admin, by a build that never ran applyPlan -- left the app
 * refusing pictures against a 1 MB "tiny" ceiling the account no longer had.
 *
 * So the app also listens to the plan itself, which is the account's own to
 * read, and works the ceiling out from it the same way the server does. The
 * server still enforces: this only stops the app refusing something the
 * server would allow, or allowing something it would not.
 *
 * ## Kept identical to the server
 *
 * The numbers are the ones in functions/limits.js, copied rather than shared
 * because that file is CommonJS inside a separately deployed package. A test
 * (test/plan-limits.test.js) reads both and fails the moment they differ.
 */

export const DEFAULT_PLAN = 'free';

export const STORAGE_BYTE_LIMITS = {
  free: 100 * 1024 * 1024,
  pro: 10 * 1024 * 1024 * 1024,
  legacy: 5 * 1024 * 1024 * 1024,
  owner: Number.POSITIVE_INFINITY,
  tiny: 1 * 1024 * 1024
};

/**
 * A plan's ceiling in bytes -- Infinity for none. A plan this build has never
 * heard of is free, as on the server: failing open would hand out storage.
 */
export function limitForPlan(plan) {
  return STORAGE_BYTE_LIMITS[plan] ?? STORAGE_BYTE_LIMITS[DEFAULT_PLAN];
}

/**
 * The storage record with its ceiling taken from the plan rather than from
 * whatever plan the record was last written under.
 *
 * `plan` undefined means it has not arrived yet: the record is returned as it
 * is, rather than guessed at. A missing record stays missing -- with nothing
 * counted there is nothing to judge.
 */
export function usageForPlan(usage, plan) {
  if (!usage || plan === undefined) return usage;

  const limit = limitForPlan(plan || DEFAULT_PLAN);
  const total = Number.isFinite(Number(usage.total)) ? Number(usage.total) : Number(usage.bytes) || 0;

  return {
    ...usage,
    plan: plan || DEFAULT_PLAN,
    // Stored the way the server stores it: null for no ceiling.
    limit: Number.isFinite(limit) ? limit : null,
    // Over, not at -- the server's isOverStorageLimit.
    full: total > limit
  };
}
