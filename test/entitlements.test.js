import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import entitlements from '../functions/entitlements.js';

const {
  STATUS,
  PAID_PLAN,
  GRACE_PERIOD_MS,
  resolvePlan,
  graceEndsAt,
  isAlreadyProcessed,
  planChanged,
  expiredPlanFor
} = entitlements;

const NOW = Date.UTC(2026, 8, 1, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

describe('resolvePlan', () => {
  it('gives a paying account the paid plan', () => {
    assert.equal(resolvePlan({ status: STATUS.ACTIVE, now: NOW }), PAID_PLAN);
  });

  it('gives an account that never subscribed its base plan', () => {
    assert.equal(resolvePlan({ status: STATUS.NONE, now: NOW }), 'free');
  });

  // Cancelled is not the same as over: they paid for the period, so they keep
  // it until it runs out.
  it('keeps a cancelled subscription until the period it paid for ends', () => {
    assert.equal(
      resolvePlan({ status: STATUS.CANCELED, periodEndsAt: NOW + DAY, now: NOW }),
      PAID_PLAN
    );
  });

  it('drops a cancelled subscription once that period is over', () => {
    assert.equal(
      resolvePlan({ status: STATUS.CANCELED, periodEndsAt: NOW - DAY, now: NOW }),
      'free'
    );
  });

  // A failed card is usually an expired card, not a person leaving. Cutting
  // them off the same hour turns an administrative hiccup into a lost customer.
  it('keeps a failed payment alive inside the grace period', () => {
    assert.equal(
      resolvePlan({ status: STATUS.PAST_DUE, gracePeriodEndsAt: NOW + DAY, now: NOW }),
      PAID_PLAN
    );
  });

  it('drops it once the grace period has run out', () => {
    assert.equal(
      resolvePlan({ status: STATUS.PAST_DUE, gracePeriodEndsAt: NOW - 1, now: NOW }),
      'free'
    );
  });

  // Asked for in as many words, on 2026-09-21, after watching it happen in the
  // sandbox: "a refund shouldn't keep the plan on, a refund is generally also a
  // revoke immediate of the subscription, so it makes the most sense that a
  // refund revokes immediately, by default if not always."
  //
  // This is deliberately *stricter than Polar*, and that is the part worth not
  // undoing later. Polar documents that refunding an order tied to a
  // subscription returns the money and leaves the subscription running -- to
  // end access you have to cancel or revoke it separately. So a refund alone
  // leaves their side saying "active" and ours saying "free", which is the
  // right way round: the alternative is a paid plan for anyone willing to ask
  // for their money back.
  //
  // The operational half of that decision lives in POLAR.md: when you refund,
  // revoke too, or the customer is still subscribed and will be billed again.
  it('a refund ends the plan at once, even though Polar leaves the subscription running', () => {
    assert.equal(
      resolvePlan({
        status: STATUS.REFUNDED,
        periodEndsAt: NOW + 365 * DAY,
        gracePeriodEndsAt: NOW + 365 * DAY,
        now: NOW
      }),
      'free'
    );
  });

  // The subtlety that would otherwise punish someone for having paid: an
  // account grandfathered onto 5 GB that subscribes and later cancels is owed
  // its 5 GB back, not dropped to 100 MB.
  it('falls back to a grandfathered plan rather than to free', () => {
    assert.equal(
      resolvePlan({ status: STATUS.NONE, basePlan: 'legacy', now: NOW }),
      'legacy'
    );
    assert.equal(
      resolvePlan({
        status: STATUS.CANCELED,
        basePlan: 'legacy',
        periodEndsAt: NOW - DAY,
        now: NOW
      }),
      'legacy'
    );
  });

  it('never falls back to a plan this build does not have', () => {
    assert.equal(
      resolvePlan({ status: STATUS.NONE, basePlan: 'enterprise-mega', now: NOW }),
      'free'
    );
  });

  it('leaves the owner account owner when it is not subscribed', () => {
    assert.equal(
      resolvePlan({ status: STATUS.NONE, basePlan: 'owner', now: NOW }),
      'owner'
    );
  });

  // Guessing upward gives away the product; guessing downward cuts off someone
  // who is paying. Declining to answer is the only choice that cannot be
  // wrong on its own.
  it('refuses to guess at a status it does not know', () => {
    assert.equal(resolvePlan({ status: 'trialing_v2', now: NOW }), null);
    assert.equal(resolvePlan({ now: NOW }), null);
    assert.equal(resolvePlan(), null);
  });

  it('treats a missing period as expired rather than as forever', () => {
    assert.equal(resolvePlan({ status: STATUS.CANCELED, now: NOW }), 'free');
    assert.equal(resolvePlan({ status: STATUS.PAST_DUE, now: NOW }), 'free');
  });
});

describe('graceEndsAt', () => {
  it('runs from the moment the payment failed', () => {
    assert.equal(graceEndsAt(NOW), NOW + GRACE_PERIOD_MS);
  });

  it('is long enough to fix a card and short enough not to be free storage', () => {
    assert.ok(GRACE_PERIOD_MS >= 7 * DAY);
    assert.ok(GRACE_PERIOD_MS <= 30 * DAY);
  });

  it('does not blow up on a missing timestamp', () => {
    assert.equal(graceEndsAt(undefined), GRACE_PERIOD_MS);
  });
});

describe('isAlreadyProcessed', () => {
  // Providers retry until they get a 200, so a redelivery is the normal case.
  // Without this, a replayed renewal could undo a refund.
  it('recognises an event it has already seen', () => {
    assert.equal(isAlreadyProcessed({ evt_1: true }, 'evt_1'), true);
  });

  it('lets a new event through', () => {
    assert.equal(isAlreadyProcessed({ evt_1: true }, 'evt_2'), false);
    assert.equal(isAlreadyProcessed(null, 'evt_2'), false);
  });

  // An event with no id cannot be deduplicated, and pretending otherwise would
  // silently drop every one of them.
  it('does not treat a missing id as already seen', () => {
    assert.equal(isAlreadyProcessed({ evt_1: true }, undefined), false);
  });
});

// The webhook path is the fast one, and like every event-driven path it is
// only as right as the last event it heard. A cancelled subscription is moved
// off the paid plan by exactly one `subscription.revoked` delivery — so one
// missed webhook leaves somebody paid-up for ever, silently, because nothing
// else ever looks again. This is what looks again.
describe('expiredPlanFor', () => {
  const cancelled = (periodEndsAt, plan = 'pro') => ({
    plan,
    status: STATUS.CANCELED,
    basePlan: 'free',
    periodEndsAt
  });

  it('leaves a subscription alone while its period is still running', () => {
    assert.equal(expiredPlanFor(cancelled(NOW + DAY), NOW), null);
  });

  // The whole point: the revocation webhook never arrived, and without this
  // the account stays on the paid plan for good.
  it('expires a cancelled plan whose period has quietly passed', () => {
    assert.equal(expiredPlanFor(cancelled(NOW - DAY), NOW), 'free');
  });

  it('expires a grace period that ran out unnoticed', () => {
    const record = {
      plan: 'pro',
      status: STATUS.PAST_DUE,
      basePlan: 'free',
      gracePeriodEndsAt: NOW - 1
    };
    assert.equal(expiredPlanFor(record, NOW), 'free');
  });

  it('gives a grandfathered account its own plan back, not free', () => {
    const record = {
      plan: 'pro',
      status: STATUS.CANCELED,
      basePlan: 'legacy',
      periodEndsAt: NOW - DAY
    };
    assert.equal(expiredPlanFor(record, NOW), 'legacy');
  });

  it('has nothing to say about an account that is paying', () => {
    assert.equal(expiredPlanFor({ plan: 'pro', status: STATUS.ACTIVE }, NOW), null);
  });

  it('has nothing to say about an account that never subscribed', () => {
    assert.equal(expiredPlanFor({ plan: 'free', status: STATUS.NONE }, NOW), null);
  });

  // A record it cannot read must not be "corrected" into a downgrade — that
  // would cut off someone who is paying, on the strength of a field this build
  // does not recognise.
  it('refuses to touch a record it cannot make sense of', () => {
    assert.equal(expiredPlanFor({ plan: 'pro', status: 'hibernating' }, NOW), null);
    assert.equal(expiredPlanFor({}, NOW), null);
  });

  // Safe to run twice, like every reconcile: it computes an absolute answer
  // rather than applying a change.
  it('is a no-op the second time it runs', () => {
    const record = cancelled(NOW - DAY);
    const next = expiredPlanFor(record, NOW);
    assert.equal(next, 'free');
    assert.equal(expiredPlanFor({ ...record, plan: next }, NOW), null);
  });
});

describe('planChanged', () => {
  it('is false when the answer is the same', () => {
    assert.equal(planChanged('pro', 'pro'), false);
    assert.equal(planChanged(undefined, 'free'), false);
  });

  it('is true for a real move in either direction', () => {
    assert.equal(planChanged('free', 'pro'), true);
    assert.equal(planChanged('pro', 'free'), true);
  });

  // resolvePlan returns null when it will not guess, and null must never be
  // written over a plan somebody is paying for.
  it('never treats a refusal to decide as a change', () => {
    assert.equal(planChanged('pro', null), false);
    assert.equal(planChanged('pro', undefined), false);
  });
});
