import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startupGate,
  releasedWithoutSyncing,
  shouldCheckOnReturn,
  GATE_TIMEOUT_MS
} from '../src/utils/startupGate.js';

// Named after the request: "there's a moment between the opening of the app,
// the mounting of the mode, and the pop-up that stops editing to sync. In that
// window we can probably edit and create a wrong version to sync. We should
// have that pop-up logic fire before the mode is mounted. Still at the same
// conditions: that you are connected to an account and that you have auto sync
// on."

/** A device that signed in last time, with sync on, still waiting on Firebase. */
const waking = (over = {}) => ({
  remembersAccount: true,
  autoSyncEnabled: true,
  firebaseConfigured: true,
  authResolved: false,
  signedIn: false,
  bootstrapComplete: false,
  online: true,
  waitedMs: 0,
  ...over
});

test('the workspace is held from the first frame, before the account has answered', () => {
  // The whole point. The old lock waited for authUser, which is a network round
  // trip after the page has drawn, and the modes were editable in between.
  assert.equal(startupGate(waking()).hold, true);
});

test('it is still held while the cloud copy is being fetched', () => {
  assert.equal(startupGate(waking({ authResolved: true, signedIn: true })).hold, true);
});

test('it opens when the cloud copy is here', () => {
  const { hold, reason } = startupGate(waking({
    authResolved: true,
    signedIn: true,
    bootstrapComplete: true
  }));
  assert.equal(hold, false);
  assert.equal(reason, 'the cloud copy is here');
});

// The conditions the request named, and nothing is held outside them.

test('nothing is held with auto sync off', () => {
  assert.equal(startupGate(waking({ autoSyncEnabled: false })).hold, false);
});

test('nothing is held on a device that has never signed in', () => {
  // A fresh install has nothing to wait for, and a blocked screen on first
  // launch would be the worst possible first impression.
  assert.equal(startupGate(waking({ remembersAccount: false })).hold, false);
});

test('nothing is held when there is no cloud configured at all', () => {
  assert.equal(startupGate(waking({ firebaseConfigured: false })).hold, false);
});

// Getting out. A gate with no way out is worse than the bug it fixes.

test('somebody with no signal is not locked out of their own notes', () => {
  const { hold, reason } = startupGate(waking({ online: false }));
  assert.equal(hold, false);
  assert.equal(reason, 'this device is offline');
});

test('it lets go the moment the account comes back signed out', () => {
  // The hold is a guess made from what this device remembers. When auth
  // disagrees, auth is right and nothing is coming.
  const { hold, reason } = startupGate(waking({ authResolved: true, signedIn: false }));
  assert.equal(hold, false);
  assert.equal(reason, 'the account is signed out');
});

test('it gives up rather than waiting for ever', () => {
  assert.equal(startupGate(waking({ waitedMs: GATE_TIMEOUT_MS - 1 })).hold, true);
  assert.equal(startupGate(waking({ waitedMs: GATE_TIMEOUT_MS })).hold, false);
  assert.equal(
    startupGate(waking({ waitedMs: GATE_TIMEOUT_MS + 5000 })).reason,
    'the cloud did not answer in time'
  );
});

test('giving up is told apart from succeeding', () => {
  // Releasing on a timeout means this device is about to be edited against a
  // copy nobody checked — the state the gate exists to avoid, and worth a line
  // in the log rather than passing as success.
  assert.equal(releasedWithoutSyncing('the cloud did not answer in time'), true);
  assert.equal(releasedWithoutSyncing('this device is offline'), true);
  assert.equal(releasedWithoutSyncing('the cloud copy is here'), false);
  assert.equal(releasedWithoutSyncing('auto sync is off'), false);
  assert.equal(releasedWithoutSyncing('no account is remembered on this device'), false);
});

test('called with nothing, it holds nothing', () => {
  // Defaults matter here: a caller that has not worked out its state yet must
  // not accidentally lock the app, and every field defaulting to "no" means the
  // failure is towards letting people write.
  assert.equal(startupGate().hold, false);
  assert.equal(startupGate({}).hold, false);
});

test('the banner has something to say at every stage', () => {
  for (const state of [waking(), waking({ authResolved: true, signedIn: true })]) {
    const { reason } = startupGate(state);
    assert.ok(reason && reason.length > 3, `no reason given for ${JSON.stringify(state)}`);
  }
});

// Named after the report: "when I try to add an image it says checking
// something for a fraction of a second and apparently it shows nothing on the
// diagnostic" — and, earlier, "when I'm not connected I can add those images
// but when I'm connected I can't".
//
// A file dialog takes focus from the window and gives it back. That looked like
// coming back to the app, so the check ran, the workspace went read-only for
// the moment it took, and the picture being added right then was refused.

test('choosing a file does not count as coming back to the app', () => {
  // The window is focused again, but it was never hidden — a dialog sat on top
  // of a page that stayed visible the whole time.
  assert.equal(shouldCheckOnReturn({ trigger: 'focus', wasHidden: false }), false);
});

test('coming back from actually being away does count', () => {
  assert.equal(shouldCheckOnReturn({ trigger: 'focus', wasHidden: true }), true);
});

test('the page saying it is visible again always counts', () => {
  // First-hand, and the reason focus is listened to at all is that this one is
  // late on Android rather than wrong.
  assert.equal(shouldCheckOnReturn({ trigger: 'visibilitychange', wasHidden: false }), true);
  assert.equal(shouldCheckOnReturn({ trigger: 'visibilitychange', wasHidden: true }), true);
});

test('an unknown trigger is treated as a hint, not as proof', () => {
  assert.equal(shouldCheckOnReturn({ trigger: 'pageshow', wasHidden: false }), false);
  assert.equal(shouldCheckOnReturn({ trigger: 'pageshow', wasHidden: true }), true);
  assert.equal(shouldCheckOnReturn(), false);
});
