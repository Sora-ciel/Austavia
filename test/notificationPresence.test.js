import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldShowNotification, dismissalFor } from '../src/utils/notificationPresence.js';

// Named after the request: "when swiping the music out, it removes the music it
// was on in app -- it shouldn't remove, just stop in app."
//
// The swipe fired the same stop as the player's own Stop button, which clears
// the track, the object URL and the resume position. A gesture meaning "put
// this away" was throwing away what you were listening to.

test('swiping it away leaves the track loaded, just paused and out of sight', () => {
  // The whole complaint. The track is still there; only the notification went.
  const dismissed = dismissalFor('track-1');
  assert.equal(
    shouldShowNotification({ hasTrack: true, playing: false, trackId: 'track-1', dismissedFor: dismissed }),
    false
  );
});

test('the swipe does not immediately undo itself', () => {
  // Why this needs a rule and not a line. The notification is shown from a
  // reactive statement that runs when the play state changes -- so pausing,
  // which is what the swipe does, would put it straight back up.
  const dismissed = dismissalFor('track-1');
  for (const playing of [false, false, false]) {
    assert.equal(
      shouldShowNotification({ hasTrack: true, playing, trackId: 'track-1', dismissedFor: dismissed }),
      false,
      'it stays gone while paused'
    );
  }
});

test('pressing play asks for it back', () => {
  const dismissed = dismissalFor('track-1');
  assert.equal(
    shouldShowNotification({ hasTrack: true, playing: true, trackId: 'track-1', dismissedFor: dismissed }),
    true
  );
});

test('a different track is a different thing to show', () => {
  // The dismissal is recorded against the track it was made on, so this ends
  // without anybody having to remember to clear a flag -- the kind that goes
  // stale and leaves the notification gone for the rest of the session.
  const dismissed = dismissalFor('track-1');
  assert.equal(
    shouldShowNotification({ hasTrack: true, playing: false, trackId: 'track-2', dismissedFor: dismissed }),
    true
  );
});

test('pausing in the app is not a dismissal, and keeps the notification', () => {
  // The ordinary pause, which must still leave something to press play on.
  assert.equal(
    shouldShowNotification({ hasTrack: true, playing: false, trackId: 'track-1', dismissedFor: null }),
    true
  );
});

test('with nothing playing there is nothing to show', () => {
  assert.equal(shouldShowNotification({ hasTrack: false, playing: false }), false);
  assert.equal(shouldShowNotification({ hasTrack: false, playing: true }), false);
  assert.equal(shouldShowNotification(), false);
});

test('a dismissal with no track behind it cannot silence what comes next', () => {
  assert.equal(dismissalFor(null), null);
  assert.equal(dismissalFor(undefined), null);
  assert.equal(
    shouldShowNotification({ hasTrack: true, playing: false, trackId: 'track-1', dismissedFor: null }),
    true
  );
});
