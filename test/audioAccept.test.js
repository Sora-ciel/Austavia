import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIO_ACCEPT_ATTRIBUTE,
  audioAcceptFor,
  isSupportedAudioFile
} from '../src/utils/audioTags.js';

test('a desktop browser gets the list, where extensions filter correctly', () => {
  const accept = audioAcceptFor({ native: false });
  assert.equal(accept, AUDIO_ACCEPT_ATTRIBUTE);
  assert.match(accept, /audio\/\*/);
  assert.match(accept, /\.flac/);
});

// Android hands `accept` to the file provider as a MIME filter, and anything it
// reports a different type for cannot be selected at all.
test('a phone is asked for everything, so nothing is greyed out', () => {
  assert.equal(audioAcceptFor({ native: true }), undefined);
});

test('called with nothing, it assumes a browser', () => {
  assert.equal(audioAcceptFor(), AUDIO_ACCEPT_ATTRIBUTE);
});

// Asking for everything is only safe because the filter after selection is the
// one that actually decides — which is the same reasoning that put it there.
test('what comes back is still filtered, whatever the picker allowed', () => {
  assert.equal(isSupportedAudioFile({ name: 'song.mp3', type: 'audio/mpeg' }), true);
  assert.equal(isSupportedAudioFile({ name: 'notes.pdf', type: 'application/pdf' }), false);
  assert.equal(isSupportedAudioFile({ name: 'holiday.jpg', type: 'image/jpeg' }), false);
});

// The reason the attribute was hurting: these are real files a provider
// mislabels, and the picker would have refused them.
test('audio a provider labels wrongly is still accepted once chosen', () => {
  assert.equal(isSupportedAudioFile({ name: 'track.m4a', type: 'video/mp4' }), true);
  assert.equal(isSupportedAudioFile({ name: 'track.flac', type: '' }), true);
  assert.equal(isSupportedAudioFile({ name: 'track.opus', type: 'application/octet-stream' }), true);
});
