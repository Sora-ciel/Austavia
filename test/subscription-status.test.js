// What the person paying is told about their own subscription.
//
// Asked for on 2026-09-22, and fairly: "right now I see that of all the things
// customers should have, there's not even half of it done." The money side was
// built and the customer side was one Upgrade button.
//
// Three of these states are the ones that decide whether somebody feels
// cheated, and all three are invisible until they happen to a real person:
// cancelled-but-paid-up, a card that failed, and grandfathered. They are the
// reason this is a module and not markup.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  subscriptionView,
  readableDate,
  planLabel,
  isSettledPlan
} from '../src/utils/subscriptionStatus.js';

const NOW = new Date(2026, 8, 22, 12, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;
const IN_A_MONTH = NOW + 30 * DAY;

describe('subscriptionView', () => {
  it('offers Pro to an account on the free plan', () => {
    const view = subscriptionView({ plan: 'free', now: NOW });

    assert.equal(view.label, 'Free');
    assert.equal(view.action, 'upgrade');
    assert.match(view.detail, /storage/i);
  });

  it('treats an account with no plan recorded as free', () => {
    assert.equal(subscriptionView({ now: NOW }).action, 'upgrade');
  });

  it('tells a paying account when it renews', () => {
    const view = subscriptionView({
      plan: 'pro',
      status: 'active',
      periodEndsAt: IN_A_MONTH,
      now: NOW
    });

    assert.equal(view.label, 'Pro');
    assert.equal(view.tone, 'settled');
    assert.equal(view.action, 'manage');
    assert.equal(view.detail, 'Renews on 22 October 2026.');
  });

  // Cancelled is not over. Somebody who cancels on day two of a month they
  // paid for must be able to see that they keep it, or the next thing they do
  // is ask for their money back.
  it('says a cancelled plan is kept until the date it was paid up to', () => {
    const view = subscriptionView({
      plan: 'pro',
      status: 'canceled',
      periodEndsAt: IN_A_MONTH,
      now: NOW
    });

    assert.equal(view.tone, 'ending');
    assert.equal(view.action, 'manage');
    assert.match(view.detail, /keep Pro until 22 October 2026/);
    assert.match(view.detail, /then the account returns to Free/);
  });

  // The one state with a deadline the person can still act on, and usually the
  // one they do not know about: a card expires without anyone noticing.
  it('warns about a failed payment, with the date it runs out', () => {
    const view = subscriptionView({
      plan: 'pro',
      status: 'past_due',
      gracePeriodEndsAt: NOW + 14 * DAY,
      periodEndsAt: IN_A_MONTH,
      now: NOW
    });

    assert.equal(view.tone, 'attention');
    assert.equal(view.action, 'manage');
    assert.match(view.detail, /did not go through/);
    assert.match(view.detail, /before 6 October 2026/);
  });

  it('still says something useful about a failed payment with no deadline recorded', () => {
    const view = subscriptionView({ plan: 'pro', status: 'past_due', now: NOW });

    assert.equal(view.tone, 'attention');
    assert.match(view.detail, /Update your card/);
  });

  // Grandfathered accounts kept room they already had. Offering them more is
  // fine; implying they are behind on something is not.
  it('offers an upgrade to a grandfathered account without scolding it', () => {
    const view = subscriptionView({ plan: 'legacy', now: NOW });

    assert.equal(view.label, 'Legacy');
    assert.equal(view.action, 'upgrade');
    assert.match(view.detail, /keep the storage you already had/);
  });

  // Nothing to sell somebody who has no ceiling.
  it('sells nothing to the owner', () => {
    const view = subscriptionView({ plan: 'owner', now: NOW });

    assert.equal(view.action, null);
    assert.match(view.detail, /No storage limit/);
  });

  it('copes with a paid account whose record has not arrived yet', () => {
    const view = subscriptionView({ plan: 'pro', now: NOW });

    assert.equal(view.action, 'manage');
    assert.equal(view.detail, 'Active.');
  });
});

describe('readableDate', () => {
  it('writes a date the way a person reads one', () => {
    assert.equal(readableDate(new Date(2026, 9, 21).getTime()), '21 October 2026');
  });

  // Local parts, never UTC — the same reason habitDays.js builds keys that
  // way. "Renews on 21 October" must not say the 22nd because it is late.
  it('uses the day the person is living in', () => {
    assert.equal(readableDate(new Date(2026, 9, 21, 23, 45).getTime()), '21 October 2026');
  });

  it('says nothing rather than something wrong', () => {
    assert.equal(readableDate(0), '');
    assert.equal(readableDate(null), '');
    assert.equal(readableDate(undefined), '');
    assert.equal(readableDate('not a date'), '');
  });
});

describe('planLabel and isSettledPlan', () => {
  it('names every plan the server can write', () => {
    assert.equal(planLabel('free'), 'Free');
    assert.equal(planLabel('pro'), 'Pro');
    assert.equal(planLabel('legacy'), 'Legacy');
    assert.equal(planLabel('owner'), 'Owner');
  });

  // A plan name this build has never heard of reads as Free rather than
  // crashing the panel — the same "fail to the smaller claim" rule the server
  // uses in limits.js.
  it('falls back to Free for a plan it does not know', () => {
    assert.equal(planLabel('enterprise'), 'Free');
    assert.equal(planLabel(undefined), 'Free');
  });

  it('knows which plans are already paying', () => {
    assert.equal(isSettledPlan('pro'), true);
    assert.equal(isSettledPlan('owner'), true);
    assert.equal(isSettledPlan('free'), false);
    assert.equal(isSettledPlan('legacy'), false);
  });
});
