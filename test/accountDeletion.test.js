// Deleting an account from the app (functions/accountDeletion.js).
//
// Asked for on 2026-11-11, as one of the two things that matter most before
// anyone else uses Austavia: a "delete my account" button, instead of an email
// and a list of paths removed by hand. These say what that button promised.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  accountPaths,
  storagePrefix,
  signedInRecently,
  subscriptionToEnd,
  markersToForget,
  isDeletableUid,
  RECENT_SIGN_IN_MS,
  MARKER_KEPT_MS
} = require('../functions/accountDeletion.js');
const { subscriptionIdIn, recordAfterEvent } = require('../functions/subscriptionRecord.js');

const NOW = 1788400000000;

describe('deleting an account removes everything it had', () => {
  it('every place an account is kept is on the list', () => {
    // The same list PENDING.md had for doing it by hand.
    assert.deepEqual(accountPaths('abc123', 'default').sort(), [
      'activity/abc123',
      'noteSizes/abc123',
      'storage/abc123',
      'subscriptions/abc123',
      'sync/default/users/abc123',
      'usage/abc123'
    ]);
    assert.equal(storagePrefix('abc123'), 'users/abc123/');
  });

  it('never deletes from the top of a node because a uid was empty or odd', () => {
    for (const bad of ['', null, undefined, '../x', 'a/b', 'a.b', 42]) {
      assert.equal(isDeletableUid(bad), false);
      assert.throws(() => accountPaths(bad, 'default'));
      assert.throws(() => storagePrefix(bad));
    }
  });
});

describe('only the person, signed in a moment ago, can delete', () => {
  const seconds = ms => Math.floor(ms / 1000);

  it('a sign-in made just now is enough', () => {
    assert.equal(signedInRecently({ authTimeSeconds: seconds(NOW - 60 * 1000), now: NOW }), true);
  });

  it('a session left open for an hour is not', () => {
    assert.equal(signedInRecently({ authTimeSeconds: seconds(NOW - RECENT_SIGN_IN_MS - 1000), now: NOW }), false);
  });

  it('no sign-in time, or one in the future, is not proof', () => {
    assert.equal(signedInRecently({ authTimeSeconds: undefined, now: NOW }), false);
    assert.equal(signedInRecently({ authTimeSeconds: seconds(NOW + 10 * 60 * 1000), now: NOW }), false);
  });
});

describe('a deleted account is not charged again', () => {
  it('a paid subscription is ended at Polar first', () => {
    assert.deepEqual(
      subscriptionToEnd({ provider: 'polar', status: 'active', subscriptionId: 'sub_1' }),
      { action: 'revoke', id: 'sub_1' }
    );
  });

  it('a cancelled one still running is ended too', () => {
    assert.deepEqual(
      subscriptionToEnd({ provider: 'polar', status: 'canceled', subscriptionId: 'sub_1' }),
      { action: 'revoke', id: 'sub_1' }
    );
  });

  it('paying with no subscription id on record is left for a person, not ignored', () => {
    assert.deepEqual(subscriptionToEnd({ provider: 'polar', status: 'past_due' }), { action: 'by-hand' });
  });

  it('nothing to end when nothing is being paid', () => {
    assert.deepEqual(subscriptionToEnd(null), { action: 'none' });
    assert.deepEqual(subscriptionToEnd({ provider: 'polar', status: 'refunded', subscriptionId: 's' }), { action: 'none' });
    assert.deepEqual(subscriptionToEnd({ provider: 'polar', status: 'none' }), { action: 'none' });
  });

  it('the subscription id is written down from each Polar event', () => {
    assert.equal(subscriptionIdIn({ type: 'subscription.active', data: { id: 'sub_9' } }), 'sub_9');
    assert.equal(subscriptionIdIn({ type: 'order.refunded', data: { subscription_id: 'sub_9' } }), 'sub_9');

    const { record } = recordAfterEvent({
      event: {
        type: 'subscription.active',
        data: { id: 'sub_9', status: 'active', current_period_end: new Date(NOW + 864e5).toISOString(), modified_at: new Date(NOW).toISOString() }
      },
      record: {},
      eventId: 'e1',
      eventAt: NOW,
      now: NOW
    });
    assert.equal(record.subscriptionId, 'sub_9');
  });
});

describe('the marker a deletion leaves is forgotten after a month', () => {
  it('kept while triggers may still land, dropped after', () => {
    const markers = { fresh: { at: NOW - 1000 }, old: { at: NOW - MARKER_KEPT_MS - 1000 }, odd: {} };
    assert.deepEqual(markersToForget(markers, NOW).sort(), ['odd', 'old']);
  });
});

describe('what the app says when a deletion did not happen', async () => {
  const { deletionFailureMessage } = await import('../src/utils/accountDeletion.js');

  it('signing in with another account deletes nothing and says so', () => {
    assert.match(deletionFailureMessage({ code: 'auth/user-mismatch' }), /different Google account/);
  });

  it('a subscription that could not be ended stops the deletion', () => {
    assert.match(deletionFailureMessage({ code: 'UNAVAILABLE' }), /nothing was deleted/);
  });
});
