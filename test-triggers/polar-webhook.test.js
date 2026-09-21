// Does the payment webhook actually work?
//
// Everything either side of it is already tested without a runtime:
// polarAdapter.js reads Polar, entitlements.js says what someone is owed,
// subscriptionRecord.js says what to write down. None of that touches the part
// that can only be got wrong once — the endpoint. Whether the signature is
// checked against the bytes as received rather than a re-serialised copy,
// whether `req.rawBody` is even populated, whether a secret declared with
// defineSecret resolves, whether the plan and the storage ceiling that follows
// from it both land.
//
// All of which fails in the same direction: the money is taken, Polar is
// satisfied, and the account stays on the free plan. Nobody finds out except
// the person who paid.
//
// So this runs the real function in the functions emulator and posts real
// signed deliveries at it, including the ones nobody would think to send: the
// same event twice, a forged signature, and a payment with nothing to attach
// it to.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));

const PROJECT_ID = 'demo-arial';
const REGION = 'us-central1';
const ENDPOINT = `http://127.0.0.1:5001/${PROJECT_ID}/${REGION}/polarWebhook`;

// Must match EMULATOR_WEBHOOK_SECRET in scripts/emulator.mjs, which is what
// the function will be reading. A fake, and only ever valid here.
const SECRET = 'whsec_' + Buffer.from('emulator-only-not-a-secret').toString('base64');

const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getAuth } = require('firebase-admin/auth');
const { expectedSignature, SIGNED_HEADERS } = require('../functions/polarAdapter.js');

// Matches SYNC_NAMESPACE in functions/syncNamespace.js.
const NS = 'default';
const BUYER = 'webhookBuyer1';

let app;
let db;

async function waitFor(read, predicate, { timeoutMs = 90000, everyMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;

  while (Date.now() < deadline) {
    last = await read();
    if (predicate(last)) return last;
    await new Promise(resolve => setTimeout(resolve, everyMs));
  }

  throw new Error(`timed out; last value was ${JSON.stringify(last)}`);
}

/**
 * Post a delivery, signed the way Polar signs.
 *
 * The body is built once as a string and both signed and sent as that same
 * string. Signing an object and sending `JSON.stringify` of it again would
 * pass here and fail in production the first time a key came back in a
 * different order.
 */
async function deliver(event, { id = `evt_${Date.now()}_${Math.random()}`, secret = SECRET } = {}) {
  const rawBody = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [SIGNED_HEADERS.id]: id,
      [SIGNED_HEADERS.timestamp]: timestamp,
      [SIGNED_HEADERS.signature]: `v1,${expectedSignature(secret, id, timestamp, rawBody)}`
    },
    body: rawBody
  });

  return { status: response.status, body: await response.text(), id };
}

function activeSubscription(uid, { periodEnd = new Date(Date.now() + 30 * 86400000) } = {}) {
  return {
    type: 'subscription.updated',
    data: {
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: periodEnd.toISOString(),
      modified_at: new Date().toISOString(),
      metadata: { uid }
    }
  };
}

const planOf = async uid => (await db.ref(`sync/${NS}/users/${uid}/plan`).get()).val();

before(async () => {
  app = initializeApp({
    projectId: PROJECT_ID,
    databaseURL: `http://127.0.0.1:9000/?ns=${PROJECT_ID}`
  });

  db = getDatabase();
  await getAuth().createUser({ uid: BUYER }).catch(() => {});

  await db.ref(`sync/${NS}/users/${BUYER}/plan`).remove();
  await db.ref(`subscriptions/${BUYER}`).remove();
  await db.ref('diagnostics/polar/unmatched').remove();

  // Warm the runtime on a delivery nothing asserts about. The first request
  // pays for loading the module and starting a worker, and leaving that inside
  // the first real assertion makes the suite pass on a warm machine and fail
  // on a cold one.
  await fetch(ENDPOINT, { method: 'GET' }).catch(() => {});
});

after(async () => {
  if (app) await deleteApp(app).catch(() => {});
});

describe('the payment webhook', () => {
  it('turns a subscription into a plan, and a plan into a ceiling', async () => {
    const { status } = await deliver(activeSubscription(BUYER));
    assert.equal(status, 200);

    const plan = await waitFor(() => planOf(BUYER), value => value === 'pro');
    assert.equal(plan, 'pro');

    const record = (await db.ref(`subscriptions/${BUYER}`).get()).val();
    assert.equal(record.status, 'active');
    assert.equal(record.provider, 'polar');

    // The ceiling has to move with the plan. Writing the plan and leaving the
    // limit behind buys somebody ten gigabytes the rules still refuse.
    const storage = (await db.ref(`storage/${BUYER}`).get()).val();
    assert.equal(storage.plan, 'pro');
    assert.equal(storage.limit, 10 * 1024 * 1024 * 1024);
    assert.equal(storage.full, false);
  });

  it('is not fooled by a delivery signed with the wrong secret', async () => {
    const { status } = await deliver(
      { type: 'subscription.revoked', data: { metadata: { uid: BUYER } } },
      { secret: 'whsec_' + Buffer.from('not-the-secret').toString('base64') }
    );

    assert.equal(status, 401);
    assert.equal(await planOf(BUYER), 'pro', 'a forged delivery must change nothing');
  });

  it('ignores the same delivery arriving twice', async () => {
    const id = 'evt_repeated_once';
    const first = await deliver(activeSubscription(BUYER), { id });
    assert.equal(first.status, 200);

    const second = await deliver(activeSubscription(BUYER), { id });
    assert.equal(second.status, 200);
    assert.match(second.body, /duplicate/);
  });

  it('takes the plan away when the subscription is revoked', async () => {
    const { status } = await deliver({
      type: 'subscription.revoked',
      data: { modified_at: new Date().toISOString(), metadata: { uid: BUYER } }
    });
    assert.equal(status, 200);

    const plan = await waitFor(() => planOf(BUYER), value => value === 'free');
    assert.equal(plan, 'free');

    const storage = (await db.ref(`storage/${BUYER}`).get()).val();
    assert.equal(storage.limit, 100 * 1024 * 1024);
  });

  // A refund now also ends the subscription at Polar, because refunding an
  // order there leaves it running. That call cannot happen in an emulator —
  // there is no token, deliberately, so nothing reaches a real payment
  // provider from a test run.
  //
  // What this pins down is that the missing half is the *outbound* one: our own
  // side still has to be completely correct, and the delivery still has to be
  // accepted, because a 500 here would be retried and then recognised as a
  // duplicate and skipped, losing the refund entirely.
  it('handles a refund completely even when it cannot reach Polar', async () => {
    await deliver(activeSubscription(BUYER));
    await waitFor(() => planOf(BUYER), value => value === 'pro');

    const { status } = await deliver({
      type: 'order.refunded',
      data: {
        status: 'refunded',
        subscription_id: 'sub_emulator_1',
        modified_at: new Date().toISOString(),
        metadata: { uid: BUYER }
      }
    });

    assert.equal(status, 200, 'a refund we cannot revoke upstream is still a refund');
    const plan = await waitFor(() => planOf(BUYER), value => value === 'free');
    assert.equal(plan, 'free');
  });

  // The one open question in this integration: which key a checkout link's
  // reference_id ends up under. A delivery we cannot attribute is answered 200
  // — retrying it would not help — and its *shape* is kept so one real
  // checkout settles it. Never its values; those are a stranger's details.
  it('records the shape of a payment it cannot attribute to anyone', async () => {
    const { status } = await deliver({
      type: 'subscription.updated',
      data: {
        status: 'active',
        modified_at: new Date().toISOString(),
        metadata: { some_key_we_did_not_expect: 'abc123' },
        customer: { email: 'stranger@example.com' }
      }
    });

    assert.equal(status, 200);

    const unmatched = await waitFor(
      async () => (await db.ref('diagnostics/polar/unmatched').get()).val(),
      value => value && Object.keys(value).length > 0
    );

    const [shape] = Object.values(unmatched);
    assert.deepEqual(shape.metadataKeys, ['some_key_we_did_not_expect']);
    assert.ok(!JSON.stringify(shape).includes('stranger@example.com'));
  });
});
