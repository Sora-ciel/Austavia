import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const polar = require('../functions/polarAdapter.js');
const entitlements = require('../functions/entitlements.js');

const {
  SIGNED_HEADERS,
  TIMESTAMP_TOLERANCE_MS,
  expectedSignature,
  verifyWebhook,
  statusFromEvent,
  uidFromEvent,
  eventShape,
  subscriptionIdFrom,
  refundIsFull,
  eventAtFrom,
  periodEndsAt
} = polar;
const { STATUS } = entitlements;

const SECRET = 'whsec_' + Buffer.from('a-test-signing-secret').toString('base64');
const NOW = 1788400000000;

function signedDelivery({
  body = '{"type":"subscription.active"}',
  id = 'evt_123',
  at = NOW,
  secret = SECRET
} = {}) {
  const timestamp = String(Math.floor(at / 1000));
  return {
    rawBody: body,
    headers: {
      [SIGNED_HEADERS.id]: id,
      [SIGNED_HEADERS.timestamp]: timestamp,
      [SIGNED_HEADERS.signature]: `v1,${expectedSignature(secret, id, timestamp, body)}`
    }
  };
}

describe('verifyWebhook', () => {
  it('accepts a genuine delivery', () => {
    const { rawBody, headers } = signedDelivery();
    assert.equal(verifyWebhook({ secret: SECRET, headers, rawBody, now: NOW }).ok, true);
  });

  it('rejects a body that was altered in flight', () => {
    const { headers } = signedDelivery();
    const result = verifyWebhook({
      secret: SECRET,
      headers,
      rawBody: '{"type":"subscription.active","tampered":true}',
      now: NOW
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'bad-signature');
  });

  it('rejects a signature made with the wrong secret', () => {
    const { rawBody, headers } = signedDelivery({ secret: 'whsec_' + Buffer.from('wrong').toString('base64') });
    assert.equal(verifyWebhook({ secret: SECRET, headers, rawBody, now: NOW }).ok, false);
  });

  // A signature is a hash of a body that never changes, so it stays valid for
  // ever on its own. Without a window, one captured delivery can be replayed
  // whenever it suits — and "subscription active" replayed after a refund is a
  // free account.
  it('rejects a replay from outside the window', () => {
    const { rawBody, headers } = signedDelivery({ at: NOW - TIMESTAMP_TOLERANCE_MS - 1000 });
    const result = verifyWebhook({ secret: SECRET, headers, rawBody, now: NOW });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'stale');
  });

  it('accepts one that is merely a little late', () => {
    const { rawBody, headers } = signedDelivery({ at: NOW - 60 * 1000 });
    assert.equal(verifyWebhook({ secret: SECRET, headers, rawBody, now: NOW }).ok, true);
  });

  // A clock a few seconds ahead is normal, not an attack.
  it('accepts one stamped slightly in the future', () => {
    const { rawBody, headers } = signedDelivery({ at: NOW + 30 * 1000 });
    assert.equal(verifyWebhook({ secret: SECRET, headers, rawBody, now: NOW }).ok, true);
  });

  // Both the old and the new secret are live while one is being rotated, so a
  // header can carry several candidates.
  it('accepts a match among several offered signatures', () => {
    const { rawBody, headers } = signedDelivery();
    const real = headers[SIGNED_HEADERS.signature].split(',')[1];
    headers[SIGNED_HEADERS.signature] = `v1,notitatall v1,${real}`;

    assert.equal(verifyWebhook({ secret: SECRET, headers, rawBody, now: NOW }).ok, true);
  });

  it('refuses anything missing its headers', () => {
    assert.equal(verifyWebhook({ secret: SECRET, headers: {}, rawBody: '{}', now: NOW }).reason, 'missing-headers');
  });

  // Failing open here would mean an unconfigured deploy accepting anything at
  // all from anyone.
  it('refuses when no secret is configured', () => {
    const { rawBody, headers } = signedDelivery();
    assert.equal(verifyWebhook({ secret: undefined, headers, rawBody, now: NOW }).ok, false);
  });

  it('refuses a timestamp that is not a number', () => {
    const { rawBody, headers } = signedDelivery();
    headers[SIGNED_HEADERS.timestamp] = 'yesterday';
    assert.equal(verifyWebhook({ secret: SECRET, headers, rawBody, now: NOW }).reason, 'bad-timestamp');
  });
});

describe('statusFromEvent', () => {
  const subscription = (data, type = 'subscription.updated') => ({ type, data });

  it('reads an active subscription', () => {
    assert.equal(statusFromEvent(subscription({ status: 'active' })), STATUS.ACTIVE);
  });

  // A trial is access. Someone inside one is owed the product.
  it('treats a trial as access', () => {
    assert.equal(statusFromEvent(subscription({ status: 'trialing' })), STATUS.ACTIVE);
  });

  // Polar still reports `active` for a subscription cancelled at period end,
  // because it is — they keep it until the period runs out. Reading it as
  // plainly active would be right today and wrong when the period ends.
  it('sees a cancel-at-period-end behind an active status', () => {
    assert.equal(
      statusFromEvent(subscription({ status: 'active', cancel_at_period_end: true })),
      STATUS.CANCELED
    );
  });

  it('reads a failed payment as past due', () => {
    assert.equal(statusFromEvent(subscription({ status: 'past_due' })), STATUS.PAST_DUE);
  });

  it('reads dunning giving up as gone', () => {
    assert.equal(statusFromEvent(subscription({ status: 'unpaid' })), STATUS.NONE);
  });

  it('reads a subscription that never started as gone', () => {
    assert.equal(statusFromEvent(subscription({ status: 'incomplete' })), STATUS.NONE);
    assert.equal(statusFromEvent(subscription({ status: 'incomplete_expired' })), STATUS.NONE);
  });

  it('takes a revocation at its word', () => {
    assert.equal(
      statusFromEvent({ type: 'subscription.revoked', data: { status: 'active' } }),
      STATUS.NONE
    );
  });

  // Money back means access back, whatever the subscription still claims.
  it('takes a refund over anything the subscription says', () => {
    assert.equal(
      statusFromEvent({ type: 'order.refunded', data: { status: 'active' } }),
      STATUS.REFUNDED
    );
  });

  // Silence is the correct answer for an event that is not about entitlement,
  // and entitlements.planChanged treats null as "leave it alone".
  it('says nothing about events that are not entitlement changes', () => {
    assert.equal(statusFromEvent({ type: 'checkout.created', data: {} }), null);
    assert.equal(statusFromEvent({ type: 'benefit_grant.created', data: {} }), null);
    assert.equal(statusFromEvent({}), null);
  });

  it('says nothing about a subscription status it has never heard of', () => {
    assert.equal(statusFromEvent(subscription({ status: 'hibernating' })), null);
  });
});

describe('uidFromEvent', () => {
  // Carried as metadata rather than matched on email: the address typed at a
  // checkout is often not the one on the Google account, and matching on it
  // would hand one person's subscription to somebody else.
  it('finds the account on the object itself', () => {
    assert.equal(uidFromEvent({ data: { metadata: { uid: 'abc' } } }), 'abc');
  });

  it('finds it on a nested subscription or checkout', () => {
    assert.equal(
      uidFromEvent({ data: { subscription: { metadata: { uid: 'from-sub' } } } }),
      'from-sub'
    );
    assert.equal(
      uidFromEvent({ data: { checkout: { metadata: { uid: 'from-checkout' } } } }),
      'from-checkout'
    );
  });

  it('prefers the outermost when several carry it', () => {
    assert.equal(
      uidFromEvent({
        data: { metadata: { uid: 'outer' }, subscription: { metadata: { uid: 'inner' } } }
      }),
      'outer'
    );
  });

  // Better to strand a payment for manual repair than to credit the wrong
  // account, which takes storage from someone who did nothing wrong.
  it('returns nothing rather than guessing', () => {
    assert.equal(uidFromEvent({ data: {} }), null);
    assert.equal(uidFromEvent({}), null);
    assert.equal(uidFromEvent({ data: { metadata: { uid: '' } } }), null);
  });
});

describe('periodEndsAt', () => {
  it('reads the end of the paid-for period', () => {
    assert.equal(
      periodEndsAt({ data: { current_period_end: '2026-10-01T00:00:00Z' } }),
      Date.UTC(2026, 9, 1)
    );
  });

  it('finds it on a nested subscription', () => {
    assert.equal(
      periodEndsAt({ data: { subscription: { current_period_end: '2026-10-01T00:00:00Z' } } }),
      Date.UTC(2026, 9, 1)
    );
  });

  // Zero, not now and not Infinity: resolvePlan reads a missing period as
  // already expired, which errs toward asking someone to pay rather than
  // toward giving the product away.
  it('is zero when there is no period to read', () => {
    assert.equal(periodEndsAt({ data: {} }), 0);
    assert.equal(periodEndsAt({ data: { current_period_end: 'soon' } }), 0);
    assert.equal(periodEndsAt({}), 0);
  });
});

describe('a delivery end to end', () => {
  // The whole path a real webhook takes: verify it, read what it means, find
  // whose it is, and let entitlements decide the plan.
  it('turns a signed cancellation into the plan it implies', () => {
    const event = {
      type: 'subscription.updated',
      data: {
        status: 'active',
        cancel_at_period_end: true,
        current_period_end: '2026-10-01T00:00:00Z',
        metadata: { uid: 'user-1' }
      }
    };
    const body = JSON.stringify(event);
    const { headers, rawBody } = signedDelivery({ body });

    assert.equal(verifyWebhook({ secret: SECRET, headers, rawBody, now: NOW }).ok, true);

    const status = statusFromEvent(event);
    assert.equal(status, STATUS.CANCELED);
    assert.equal(uidFromEvent(event), 'user-1');

    // Still inside the period they paid for, so still on the paid plan.
    assert.equal(
      entitlements.resolvePlan({
        status,
        periodEndsAt: periodEndsAt(event),
        basePlan: 'free',
        now: Date.UTC(2026, 8, 15)
      }),
      'pro'
    );

    // Past it, back to what they had before.
    assert.equal(
      entitlements.resolvePlan({
        status,
        periodEndsAt: periodEndsAt(event),
        basePlan: 'free',
        now: Date.UTC(2026, 10, 1)
      }),
      'free'
    );
  });
});

// --- Finding the account a payment belongs to --------------------------
//
// The one genuinely unknown part of this integration. A checkout *link* cannot
// carry arbitrary metadata in its URL: Polar takes `reference_id` and the utm
// parameters and says it attaches them to the checkout session's metadata, but
// not under which key. So several are read, and anything unattributable has
// its shape recorded rather than being guessed at a fourth time.

describe('uidFromEvent', () => {
  it('reads a uid we put there ourselves', () => {
    assert.equal(uidFromEvent({ data: { metadata: { uid: 'abc123XYZ' } } }), 'abc123XYZ');
  });

  it("reads a checkout link's reference_id, in either spelling", () => {
    assert.equal(uidFromEvent({ data: { metadata: { reference_id: 'abc123XYZ' } } }), 'abc123XYZ');
    assert.equal(uidFromEvent({ data: { metadata: { referenceId: 'abc123XYZ' } } }), 'abc123XYZ');
  });

  it('reads the external id Polar keeps on the customer', () => {
    assert.equal(uidFromEvent({ data: { customer: { external_id: 'abc123XYZ' } } }), 'abc123XYZ');
  });

  it('looks on the subscription and the checkout as well as the order', () => {
    assert.equal(
      uidFromEvent({ data: { subscription: { metadata: { uid: 'fromSubscription1' } } } }),
      'fromSubscription1'
    );
    assert.equal(
      uidFromEvent({ data: { checkout: { metadata: { uid: 'fromCheckout123' } } } }),
      'fromCheckout123'
    );
  });

  // A uid becomes part of a database path. One with a slash in it does not
  // fail -- it writes somewhere else entirely, which shows up as a stranger's
  // account changing.
  it('refuses anything that could move around a database path', () => {
    assert.equal(uidFromEvent({ data: { metadata: { uid: '../../admins/me' } } }), null);
    assert.equal(uidFromEvent({ data: { metadata: { uid: 'abc.def' } } }), null);
    assert.equal(uidFromEvent({ data: { metadata: { uid: 'a#b$c' } } }), null);
    assert.equal(uidFromEvent({ data: { metadata: { uid: 42 } } }), null);
  });

  it('says so plainly when there is nothing to go on', () => {
    assert.equal(uidFromEvent({ data: {} }), null);
    assert.equal(uidFromEvent({}), null);
  });
});

describe('eventShape', () => {
  it('records where the keys were, so one real delivery settles it', () => {
    const shape = eventShape({
      type: 'checkout.updated',
      data: {
        metadata: { reference_id: 'abc123XYZ', utm_source: 'app' },
        customer: { external_id: 'abc123XYZ', email: 'someone@example.com' }
      }
    });

    assert.equal(shape.type, 'checkout.updated');
    assert.deepEqual(shape.metadataKeys, ['reference_id', 'utm_source']);
    assert.equal(shape.hasCustomerExternalId, true);
  });

  // It is written to the database, and the values are a stranger's name,
  // address and email. Only the shape is any of our business.
  it('keeps no values at all', () => {
    const shape = eventShape({
      type: 'order.created',
      data: { customer: { email: 'someone@example.com', name: 'A Person' } }
    });

    const printed = JSON.stringify(shape);
    assert.ok(!printed.includes('someone@example.com'));
    assert.ok(!printed.includes('A Person'));
  });
});

describe('eventAtFrom', () => {
  // A retry is re-signed with the clock at the moment it is retried, so the
  // delivery time of an event that failed twice is long after it happened.
  // Ordering by that lets an old event land on top of a newer one.
  it('takes when the thing happened, not when it was delivered', () => {
    const happened = Date.parse('2026-09-01T10:00:00Z');
    const delivered = Date.parse('2026-09-01T11:30:00Z');

    assert.equal(
      eventAtFrom({ data: { modified_at: '2026-09-01T10:00:00Z' } }, delivered),
      happened
    );
  });

  it('falls back to the delivery time when the event does not say', () => {
    const delivered = 1788400000000;
    assert.equal(eventAtFrom({ data: {} }, delivered), delivered);
    assert.equal(eventAtFrom({ data: { modified_at: 'not a date' } }, delivered), delivered);
  });
});

// --- Deciding whether a refund ends a subscription ---------------------
//
// Asked for on 2026-09-21, after a sandbox refund left Polar still thinking
// the subscription was live: "a refund is generally also a revoke immediate of
// the subscription, so it makes the most sense that a refund revokes
// immediately, by default if not always."
//
// Acting on that means calling Polar and ending somebody's subscription, so
// the reading of "was this the whole order" has to be right. `order.refunded`
// fires for partial refunds too — Polar says so — and a goodwill refund of one
// month must never cancel a subscription that is carrying on.

describe('refundIsFull', () => {
  it('knows a whole order was given back', () => {
    assert.equal(refundIsFull({ data: { status: 'refunded' } }), true);
    assert.equal(refundIsFull({ data: { refunded_amount: 800, total_amount: 800 } }), true);
  });

  it('knows part of one was', () => {
    assert.equal(refundIsFull({ data: { status: 'partially_refunded' } }), false);
    assert.equal(refundIsFull({ data: { refunded_amount: 200, total_amount: 800 } }), false);
  });

  // The uncertain case does nothing, and that direction is deliberate: failing
  // to revoke leaves something to finish by hand, while revoking by mistake
  // takes the product off somebody who is paying for it.
  it('declines to answer when the payload does not say', () => {
    assert.equal(refundIsFull({ data: {} }), null);
    assert.equal(refundIsFull({ data: { refunded_amount: 'lots' } }), null);
    assert.equal(refundIsFull({}), null);
  });
});

describe('subscriptionIdFrom', () => {
  it('finds the subscription an order paid for', () => {
    assert.equal(subscriptionIdFrom({ data: { subscription_id: 'sub_1' } }), 'sub_1');
    assert.equal(subscriptionIdFrom({ data: { subscription: { id: 'sub_2' } } }), 'sub_2');
  });

  it('says nothing for an order that has none', () => {
    assert.equal(subscriptionIdFrom({ data: {} }), null);
  });
});

// --- When access actually ends ----------------------------------------
//
// Caught in a real staging log on 2026-09-26. A revoke had just worked, and
// one second later the account went back to `pro` for twenty seconds before a
// later delivery corrected it.
//
// The shapes below are copied from Polar's own listing for that account.

describe('periodEndsAt', () => {
  const REVOKED_AT = Date.parse('2026-09-26T22:13:12Z');
  const PERIOD_END = Date.parse('2026-10-26T21:49:04Z');

  it('reads the paid-for period of a healthy subscription', () => {
    assert.equal(
      periodEndsAt({ data: { status: 'active', ends_at: null, current_period_end: '2026-10-26T21:49:04Z' } }),
      PERIOD_END
    );
  });

  // The one that bit. A revoked subscription reports `canceled` with a period
  // end still a month away, because access was taken away *inside* the period
  // it was paid for. Reading only the period end says "keeps it until
  // October", and resolvePlan then leaves them on the paid plan.
  it('takes a revoke at the moment it happened, not the end of the paid month', () => {
    const revoked = {
      data: {
        status: 'canceled',
        canceled_at: '2026-09-26T22:13:12Z',
        ends_at: '2026-09-26T22:13:12Z',
        ended_at: '2026-09-26T22:13:12Z',
        current_period_end: '2026-10-26T21:49:04Z'
      }
    };

    assert.equal(periodEndsAt(revoked), REVOKED_AT);
    assert.ok(periodEndsAt(revoked) < PERIOD_END, 'access ended before the period did');
  });

  // Cancel-at-period-end must still keep what was paid for, which is the same
  // field saying something different.
  it('keeps a cancelled subscription to the end of what was paid for', () => {
    assert.equal(
      periodEndsAt({
        data: { status: 'active', cancel_at_period_end: true, ends_at: '2026-10-26T21:49:04Z', current_period_end: '2026-10-26T21:49:04Z' }
      }),
      PERIOD_END
    );
  });

  it('finds it on a nested subscription, as an order event carries it', () => {
    assert.equal(
      periodEndsAt({ data: { subscription: { current_period_end: '2026-10-26T21:49:04Z' } } }),
      PERIOD_END
    );
  });

  it('says nothing rather than a wrong date', () => {
    assert.equal(periodEndsAt({ data: {} }), 0);
    assert.equal(periodEndsAt({ data: { current_period_end: 'soon' } }), 0);
    assert.equal(periodEndsAt({}), 0);
  });
});
