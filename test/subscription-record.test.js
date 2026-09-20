// What gets written down when a payment webhook arrives.
//
// These are the cases nobody will ever send by hand, and every one of them
// fails in the customer's favour if it is wrong — which is the direction that
// never produces a complaint and so never gets found. A refund undone by a
// redelivered renewal, a card that fails every hour and pushes its own deadline
// out for ever, an old delivery landing on top of a newer one: each leaves
// somebody on the paid plan, quietly, for as long as the account exists.
//
// The behaviour wanted here is that money moving is recorded exactly once, in
// the order it happened, and that a second copy of the same news changes
// nothing.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const record = require('../functions/subscriptionRecord.js');
const entitlements = require('../functions/entitlements.js');

const { recordAfterEvent, rememberEvent, eventKey, SEEN_EVENTS_KEPT, IGNORED } = record;
const { STATUS, PAID_PLAN, GRACE_PERIOD_MS } = entitlements;

const NOW = 1788400000000;
const DAY = 24 * 60 * 60 * 1000;

function subscriptionEvent({
  type = 'subscription.updated',
  status = 'active',
  cancelAtPeriodEnd = false,
  periodEnd = new Date(NOW + 30 * DAY).toISOString(),
  modifiedAt = new Date(NOW).toISOString()
} = {}) {
  return {
    type,
    data: {
      status,
      cancel_at_period_end: cancelAtPeriodEnd,
      current_period_end: periodEnd,
      modified_at: modifiedAt,
      metadata: { uid: 'abc123' }
    }
  };
}

describe('recordAfterEvent', () => {
  it('puts an active subscription on the paid plan', () => {
    const outcome = recordAfterEvent({
      event: subscriptionEvent(),
      record: {},
      eventId: 'evt_1',
      eventAt: NOW,
      now: NOW
    });

    assert.equal(outcome.ignored, null);
    assert.equal(outcome.plan, PAID_PLAN);
    assert.equal(outcome.record.status, STATUS.ACTIVE);
    assert.equal(outcome.record.provider, 'polar');
  });

  it('the same delivery twice changes nothing the second time', () => {
    const first = recordAfterEvent({
      event: subscriptionEvent(),
      record: {},
      eventId: 'evt_1',
      eventAt: NOW,
      now: NOW
    });

    const second = recordAfterEvent({
      event: subscriptionEvent(),
      record: first.record,
      eventId: 'evt_1',
      eventAt: NOW,
      now: NOW
    });

    assert.equal(second.ignored, IGNORED.DUPLICATE);
    assert.equal(second.record, null);
  });

  // The one that matters most. Providers retry, and a retry of an older event
  // is sent again after a newer one has already landed.
  it('an older event does not undo a newer one', () => {
    const revoked = recordAfterEvent({
      event: { type: 'subscription.revoked', data: { modified_at: new Date(NOW).toISOString() } },
      record: { plan: PAID_PLAN },
      eventId: 'evt_revoke',
      eventAt: NOW,
      now: NOW
    });
    assert.notEqual(revoked.plan, PAID_PLAN);

    const lateRenewal = recordAfterEvent({
      event: subscriptionEvent({ modifiedAt: new Date(NOW - DAY).toISOString() }),
      record: revoked.record,
      eventId: 'evt_renew',
      eventAt: NOW - DAY,
      now: NOW + 1000
    });

    assert.equal(lateRenewal.ignored, IGNORED.OUT_OF_ORDER);
    assert.equal(lateRenewal.record, null);
  });

  it('a refund takes the plan away at once', () => {
    const outcome = recordAfterEvent({
      event: { type: 'order.refunded', data: { modified_at: new Date(NOW).toISOString() } },
      record: { plan: PAID_PLAN, status: STATUS.ACTIVE },
      eventId: 'evt_refund',
      eventAt: NOW,
      now: NOW
    });

    assert.notEqual(outcome.plan, PAID_PLAN);
  });

  it('a cancelled subscription keeps the plan until its period ends', () => {
    const outcome = recordAfterEvent({
      event: subscriptionEvent({ cancelAtPeriodEnd: true }),
      record: {},
      eventId: 'evt_cancel',
      eventAt: NOW,
      now: NOW
    });

    assert.equal(outcome.plan, PAID_PLAN);
    assert.equal(outcome.record.status, STATUS.CANCELED);
    assert.ok(outcome.record.periodEndsAt > NOW);
  });

  // A declined card is declined again on every retry the provider makes, and
  // each of those is another past_due delivery. Restarting the window on each
  // one means the account never actually lapses.
  it('a card that keeps failing does not keep extending its own grace period', () => {
    const first = recordAfterEvent({
      event: subscriptionEvent({ status: 'past_due' }),
      record: {},
      eventId: 'evt_due_1',
      eventAt: NOW,
      now: NOW
    });

    assert.equal(first.record.gracePeriodEndsAt, NOW + GRACE_PERIOD_MS);

    const aWeekLater = NOW + 7 * DAY;
    const second = recordAfterEvent({
      event: subscriptionEvent({ status: 'past_due', modifiedAt: new Date(aWeekLater).toISOString() }),
      record: first.record,
      eventId: 'evt_due_2',
      eventAt: aWeekLater,
      now: aWeekLater
    });

    assert.equal(second.record.gracePeriodEndsAt, first.record.gracePeriodEndsAt);
  });

  it('starts a fresh grace period once the old one has run out', () => {
    const lapsed = { status: STATUS.PAST_DUE, gracePeriodEndsAt: NOW - DAY };
    const later = NOW + DAY;

    const outcome = recordAfterEvent({
      event: subscriptionEvent({ status: 'past_due' }),
      record: lapsed,
      eventId: 'evt_due_3',
      eventAt: later,
      now: later
    });

    assert.equal(outcome.record.gracePeriodEndsAt, later + GRACE_PERIOD_MS);
  });

  it('keeps the period it already knew when the event does not mention one', () => {
    const known = NOW + 10 * DAY;
    const outcome = recordAfterEvent({
      event: {
        type: 'subscription.updated',
        data: { status: 'active', modified_at: new Date(NOW).toISOString() }
      },
      record: { periodEndsAt: known },
      eventId: 'evt_no_period',
      eventAt: NOW,
      now: NOW
    });

    assert.equal(outcome.record.periodEndsAt, known);
  });

  it('ignores an event that says nothing about entitlement', () => {
    const outcome = recordAfterEvent({
      event: { type: 'checkout.created', data: {} },
      record: {},
      eventId: 'evt_checkout',
      eventAt: NOW,
      now: NOW
    });

    assert.equal(outcome.ignored, IGNORED.NOT_AN_ENTITLEMENT);
    assert.equal(outcome.record, null);
  });

  it('leaves a status this build has never heard of alone', () => {
    const outcome = recordAfterEvent({
      event: { type: 'subscription.updated', data: { status: 'hibernating' } },
      record: { plan: PAID_PLAN },
      eventId: 'evt_weird',
      eventAt: NOW,
      now: NOW
    });

    assert.equal(outcome.ignored, IGNORED.NOT_AN_ENTITLEMENT);
    assert.equal(outcome.record, null);
  });

  it('keeps a grandfathered account on its own plan when it stops paying', () => {
    const outcome = recordAfterEvent({
      event: { type: 'subscription.revoked', data: {} },
      record: { basePlan: 'legacy', plan: PAID_PLAN },
      eventId: 'evt_revoked',
      eventAt: NOW,
      now: NOW
    });

    assert.equal(outcome.plan, 'legacy');
  });
});

// Found by the emulator suite, not by anything here: the delivery id becomes a
// database key, and a Realtime Database key may not hold `.`, `#`, `$`, `[`,
// `]` or `/`. It does not tolerate one and shrug — it throws, so the whole
// write fails, the endpoint answers 500, and the provider retries for ever
// while nobody's plan ever changes. The id is somebody else's string and its
// format is theirs to change.
describe('eventKey', () => {
  it('a delivery id that is not a legal key does not take the write down with it', () => {
    assert.equal(eventKey('evt_1.2'), 'evt_1%2E2');
    assert.equal(eventKey('a/b#c$d[e]'), 'a%2Fb%23c%24d%5Be%5D');
  });

  it('leaves an ordinary id alone', () => {
    assert.equal(eventKey('whid_2aBcDeF'), 'whid_2aBcDeF');
  });

  // Two ids sharing a key would mean the second was mistaken for a redelivery
  // of the first and silently dropped — which on a refund following a renewal
  // is money.
  it('never turns two different ids into the same key', () => {
    assert.notEqual(eventKey('a.b'), eventKey('a%2Eb'));
  });

  it('says nothing rather than inventing a key', () => {
    assert.equal(eventKey(''), '');
    assert.equal(eventKey(null), '');
  });
});

describe('rememberEvent', () => {
  it('does not grow for ever', () => {
    let seen = {};
    for (let i = 0; i < SEEN_EVENTS_KEPT + 10; i += 1) {
      seen = rememberEvent(seen, 'evt_' + i, NOW + i);
    }

    assert.equal(Object.keys(seen).length, SEEN_EVENTS_KEPT);
    // The oldest go, not whichever the map happened to list first.
    assert.equal(seen.evt_0, undefined);
    assert.ok(seen['evt_' + (SEEN_EVENTS_KEPT + 9)]);
  });
});
