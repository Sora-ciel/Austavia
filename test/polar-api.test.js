// The one place that acts on the payment provider rather than listening to it.
//
// Everything else in `functions/` only reads what Polar sends. This ends a
// subscription, on somebody's real account, with their money already returned
// — so the tests here are less about the happy path than about the two ways
// this could be worse than doing nothing: reaching the wrong Polar, and
// failing a webhook over a state that is already what we wanted.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { apiBaseFor, revokeSubscription, PRODUCTION_BASE, SANDBOX_BASE } = require('../functions/polarApi.js');

const PRODUCTION = 'arial-473c1';

function fakeFetch(response) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    return response;
  };
  impl.calls = calls;
  return impl;
}

const ok = { ok: true, status: 200, text: async () => '{}' };
const alreadyRevoked = { ok: false, status: 403, text: async () => 'This subscription is already revoked.' };
const notFound = { ok: false, status: 404, text: async () => 'not found' };
const broken = { ok: false, status: 500, text: async () => 'upstream exploded' };

describe('apiBaseFor', () => {
  it('talks to the real Polar only from the real project', () => {
    assert.equal(apiBaseFor(PRODUCTION, PRODUCTION), PRODUCTION_BASE);
  });

  // The one that matters. A staging deploy reaching into the live Polar
  // account would revoke a paying customer's subscription from a test.
  it('sends staging and the emulator to the sandbox', () => {
    assert.equal(apiBaseFor('arial-staging', PRODUCTION), SANDBOX_BASE);
    assert.equal(apiBaseFor('demo-arial', PRODUCTION), SANDBOX_BASE);
    assert.equal(apiBaseFor(undefined, PRODUCTION), SANDBOX_BASE);
    assert.equal(apiBaseFor('', PRODUCTION), SANDBOX_BASE);
  });
});

describe('revokeSubscription', () => {
  it('asks Polar to end the subscription', async () => {
    const fetchImpl = fakeFetch(ok);
    const result = await revokeSubscription({
      id: 'sub_123',
      token: 'polar_at_test',
      baseUrl: SANDBOX_BASE,
      fetchImpl
    });

    assert.equal(result.ok, true);
    assert.equal(fetchImpl.calls[0].url, `${SANDBOX_BASE}/v1/subscriptions/sub_123`);
    assert.equal(fetchImpl.calls[0].options.method, 'DELETE');
    assert.equal(fetchImpl.calls[0].options.headers.Authorization, 'Bearer polar_at_test');
  });

  // Both of these mean the thing we wanted is already true. Treating them as
  // failures would answer 500 to a webhook that had in fact been dealt with,
  // and be retried for ever.
  it('counts an already-revoked subscription as done', async () => {
    const result = await revokeSubscription({
      id: 'sub_123',
      token: 't',
      fetchImpl: fakeFetch(alreadyRevoked)
    });

    assert.equal(result.ok, true);
    assert.equal(result.alreadyDone, true);
  });

  it('counts a subscription that no longer exists as done', async () => {
    const result = await revokeSubscription({ id: 'sub_123', token: 't', fetchImpl: fakeFetch(notFound) });
    assert.equal(result.ok, true);
    assert.equal(result.alreadyDone, true);
  });

  it('reports a real failure rather than pretending', async () => {
    const result = await revokeSubscription({ id: 'sub_123', token: 't', fetchImpl: fakeFetch(broken) });
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
    assert.match(result.detail, /exploded/);
  });

  // Without a token this would send an unauthenticated DELETE to a payment
  // provider. It should not leave the building.
  it('does not call out at all without a token or an id', async () => {
    const noToken = fakeFetch(ok);
    assert.equal((await revokeSubscription({ id: 'sub_123', fetchImpl: noToken })).ok, false);
    assert.equal(noToken.calls.length, 0);

    const noId = fakeFetch(ok);
    assert.equal((await revokeSubscription({ token: 't', fetchImpl: noId })).ok, false);
    assert.equal(noId.calls.length, 0);
  });
});
