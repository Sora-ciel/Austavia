// Sending somebody to a checkout that knows whose account it is.
//
// The whole paywall hangs off one string surviving a round trip through a
// payment provider. If the uid does not reach the checkout, the money arrives
// with nothing to attach it to — and the failure is invisible from our side,
// because everything else works: the card is charged, Polar is happy, the
// webhook is delivered, and the account it was for stays on the free plan.
//
// So the rule is: no uid, no button.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkoutUrlFor, upgradeOffer, isPaidPlan } from '../src/utils/checkout.js';

const LINK = 'https://buy.polar.sh/austavia-pro';
const UID = 'kK2nQ7xyzAbCdEfGh1234567';

describe('checkoutUrlFor', () => {
  it('carries the account id to the checkout', () => {
    const url = new URL(checkoutUrlFor({ link: LINK, uid: UID }));
    assert.equal(url.searchParams.get('reference_id'), UID);
  });

  it('keeps whatever the link already carried', () => {
    const url = new URL(checkoutUrlFor({ link: LINK + '?theme=dark', uid: UID }));
    assert.equal(url.searchParams.get('theme'), 'dark');
    assert.equal(url.searchParams.get('reference_id'), UID);
  });

  // Without an id the payment cannot be attributed to anybody, and a checkout
  // that takes money for nothing is worse than no checkout at all.
  it('refuses to build a checkout with nobody attached', () => {
    assert.equal(checkoutUrlFor({ link: LINK, uid: '' }), null);
    assert.equal(checkoutUrlFor({ link: LINK }), null);
  });

  it('offers nothing until there is a product to sell', () => {
    assert.equal(checkoutUrlFor({ link: '', uid: UID }), null);
    assert.equal(checkoutUrlFor({ link: '   ', uid: UID }), null);
  });

  // A payment page loaded over http is one an intermediary can rewrite.
  it('will not open a checkout over http', () => {
    assert.equal(checkoutUrlFor({ link: 'http://buy.polar.sh/x', uid: UID }), null);
    assert.equal(checkoutUrlFor({ link: 'not a url', uid: UID }), null);
  });
});

describe('upgradeOffer', () => {
  it('offers an upgrade to an account on the free plan', () => {
    const offer = upgradeOffer({
      usage: { plan: 'free', limit: 100, bytes: 10 },
      uid: UID,
      link: LINK
    });

    assert.equal(offer.show, true);
    assert.equal(offer.tone, 'quiet');
  });

  it('gets loud once storage is full', () => {
    const offer = upgradeOffer({
      usage: { plan: 'free', limit: 100, bytes: 100, full: true },
      uid: UID,
      link: LINK
    });

    assert.equal(offer.show, true);
    assert.equal(offer.tone, 'urgent');
  });

  // Nobody should be sold what they are already paying for.
  it('says nothing to an account that already pays', () => {
    assert.equal(upgradeOffer({ usage: { plan: 'pro', limit: 1000 }, uid: UID, link: LINK }).show, false);
    assert.equal(upgradeOffer({ usage: { plan: 'owner', limit: null }, uid: UID, link: LINK }).show, false);
  });

  it('says nothing to an account with no ceiling at all', () => {
    const offer = upgradeOffer({ usage: { plan: 'free', limit: null }, uid: UID, link: LINK });
    assert.equal(offer.show, false);
  });

  it('says nothing while there is no product and no link', () => {
    assert.equal(upgradeOffer({ usage: { plan: 'free', limit: 100 }, uid: UID, link: '' }).show, false);
  });

  // The plan comes from the server's own record. An account whose plan has not
  // been written yet is free, which is the same answer the server gives.
  it('treats an account with no plan recorded as free', () => {
    const offer = upgradeOffer({ usage: { limit: 100, bytes: 1 }, uid: UID, link: LINK });
    assert.equal(offer.show, true);
  });
});

describe('isPaidPlan', () => {
  it('knows which plans have nothing left to sell', () => {
    assert.equal(isPaidPlan('pro'), true);
    assert.equal(isPaidPlan('owner'), true);
    assert.equal(isPaidPlan('free'), false);
    assert.equal(isPaidPlan('legacy'), false);
    assert.equal(isPaidPlan(undefined), false);
  });
});
