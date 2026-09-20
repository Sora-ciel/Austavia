// Carrying out what subscriptionRecord.js decided.
//
// Deliberately thin, and deliberately separate: everything with a judgement in
// it is in entitlements.js, polarAdapter.js and subscriptionRecord.js, where a
// test can reach it without a database. What is left here is writes, and the
// order they happen in.
//
// That order matters more than it looks. A plan is three things, not one:
//
//   sync/{ns}/users/{uid}/plan   what the account is on
//   storage/{uid}.limit          the ceiling that follows from it
//   the auth token's claim       what Storage rules can actually see
//
// Writing the first and forgetting the other two buys somebody ten gigabytes
// that the rules still refuse to let them use — which reads, from their side,
// as having paid for nothing.

const { logger } = require('firebase-functions');
const { getDatabase } = require('firebase-admin/database');
const { SYNC_NAMESPACE } = require('./syncNamespace');
const { storageLimitFor, isOverStorageLimit, storableLimit } = require('./limits');
const { syncStorageFullClaim } = require('./storageAccounting');
const { expiredPlanFor } = require('./entitlements');
const { uidFromEvent, eventShape } = require('./polarAdapter');
const { recordAfterEvent, eventKey } = require('./subscriptionRecord');

const SUBSCRIPTIONS = 'subscriptions';
const UNMATCHED = 'diagnostics/polar/unmatched';

// Unmatched deliveries are kept for looking at, not for ever.
const UNMATCHED_KEPT = 20;

function planRef(db, uid) {
  return db.ref(`sync/${SYNC_NAMESPACE}/users/${uid}/plan`);
}

/**
 * Put an account on a plan, and move its ceiling with it.
 *
 * The storage record is rewritten rather than adjusted — the bytes it already
 * holds are the truth about what is stored, and the limit and the full flag
 * are both derived from them, so recomputing both from the new plan is
 * correct at any moment and safe to repeat.
 */
async function applyPlan(db, uid, plan) {
  await planRef(db, uid).set(plan);

  const snap = await db.ref(`storage/${uid}`).get();
  const bytes = Number((snap.val() || {}).bytes) || 0;
  const limit = storageLimitFor(plan);
  const full = isOverStorageLimit(bytes, plan);

  await db.ref(`storage/${uid}`).update({
    plan,
    limit: storableLimit(limit),
    full,
    updatedAt: Date.now()
  });

  // Last, and only after the number it mirrors is written. A claim saying
  // there is room, over a record that says there is not, is the one ordering
  // of these that hands out storage nobody paid for.
  await syncStorageFullClaim(uid, full);

  logger.info('plan-applied', { uid, plan, bytes, full });
}

/**
 * Keep the shape of a delivery we could not attribute to an account.
 *
 * Key names and the event type only — see `eventShape`. This exists because
 * the one thing not known in advance about this integration is which key a
 * checkout link's `reference_id` ends up under, and one real delivery answers
 * it. Guessing three times and shipping each guess is how the cover art went.
 */
async function recordUnmatched(db, eventId, event) {
  // Escaped, because this id is somebody else's string and it is about to be
  // a path segment — see eventKey. An id with a dot in it does not write to a
  // slightly odd key here, it throws.
  const key = eventKey(eventId) || `anon-${Date.now()}`;
  await db.ref(`${UNMATCHED}/${key}`).set({ ...eventShape(event), at: Date.now() });

  const snap = await db.ref(UNMATCHED).get();
  const all = snap.val() || {};
  const keys = Object.keys(all);
  if (keys.length <= UNMATCHED_KEPT) return;

  const oldest = keys
    .sort((a, b) => (Number(all[a] && all[a].at) || 0) - (Number(all[b] && all[b].at) || 0))
    .slice(0, keys.length - UNMATCHED_KEPT);
  await Promise.all(oldest.map(id => db.ref(`${UNMATCHED}/${id}`).remove()));
}

/**
 * Apply one verified Polar delivery.
 *
 * The record is updated inside a transaction so that recognising a redelivery
 * and writing the result cannot be separated: two copies of the same event
 * arriving together would otherwise both read "not seen yet" and both apply.
 */
async function applyPolarEvent({ db = getDatabase(), event, eventId, eventAt, now = Date.now() }) {
  const uid = uidFromEvent(event);
  if (!uid) {
    await recordUnmatched(db, eventId, event);
    logger.warn('polar-event-unmatched', { eventId, type: event && event.type });
    return { ok: false, reason: 'no-uid' };
  }

  let outcome = null;
  const result = await db.ref(`${SUBSCRIPTIONS}/${uid}`).transaction(current => {
    outcome = recordAfterEvent({ event, record: current || {}, eventId, eventAt, now });
    if (!outcome.record) return undefined; // abort: nothing to write
    return outcome.record;
  });

  if (!result.committed || !outcome || !outcome.record) {
    const reason = (outcome && outcome.ignored) || 'not-committed';
    logger.info('polar-event-ignored', { uid, eventId, reason });
    return { ok: true, uid, ignored: reason };
  }

  const stored = await planRef(db, uid).get();
  const current = stored.val();
  if (current === outcome.plan) {
    logger.info('polar-event-applied-no-change', { uid, plan: outcome.plan });
    return { ok: true, uid, plan: outcome.plan, changed: false };
  }

  await applyPlan(db, uid, outcome.plan);
  return { ok: true, uid, plan: outcome.plan, changed: true };
}

/**
 * Look again at every subscription, and correct the ones that have lapsed.
 *
 * This is the periodic pass CLAUDE.md asks for, and it is not optional here.
 * The webhook path is the only thing that moves a cancelled account off the
 * paid plan when its period ends, and that is a single delivery months after
 * the customer stopped thinking about it — one that never arrives leaves
 * somebody on the paid plan for ever, silently, because nothing else ever
 * looks.
 *
 * Absolute, like every other sweep here: `expiredPlanFor` works out what the
 * record should say now and returns nothing at all when it already says it,
 * which is the case for almost every account almost every time.
 */
async function sweepExpiredPlans({ db = getDatabase(), now = Date.now() } = {}) {
  const snap = await db.ref(SUBSCRIPTIONS).get();
  const records = snap.val() || {};

  let checked = 0;
  let corrected = 0;

  for (const [uid, record] of Object.entries(records)) {
    if (!record || typeof record !== 'object') continue;
    checked += 1;

    const next = expiredPlanFor(record, now);
    if (!next) continue;

    await db.ref(`${SUBSCRIPTIONS}/${uid}`).update({ plan: next, updatedAt: now });
    await applyPlan(db, uid, next);
    corrected += 1;
    logger.info('plan-lapsed', { uid, from: record.plan, to: next });
  }

  logger.info('plans-swept', { checked, corrected });
  return { checked, corrected };
}

module.exports = {
  SUBSCRIPTIONS,
  UNMATCHED,
  applyPlan,
  recordUnmatched,
  applyPolarEvent,
  sweepExpiredPlans
};
