// Asked 2026-11-17: on Linux a paused song still showed the app's speaker
// icon in the task bar; "it only shows when actual sound is playing".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releasesWhenPaused, RELEASE_AFTER_MS } from '../src/utils/audioRelease.js';

test('a paused song lets go of the sound in the desktop app, so the speaker icon goes', () => {
  assert.equal(releasesWhenPaused({ desktopApp: true }), true);
  assert.ok(RELEASE_AFTER_MS <= 3000, 'soon after the pause, not minutes later');
});

test('not on the phone, whose notification controls need the song kept, nor in a browser', () => {
  assert.equal(releasesWhenPaused({ androidApp: true }), false);
  assert.equal(releasesWhenPaused({}), false);
});
