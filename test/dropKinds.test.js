import { test } from 'node:test';
import assert from 'node:assert/strict';

import { splitDrop } from '../src/utils/dropKinds.js';

// Asked 2026-11-10: "make it so that we can slide music in the app and it adds
// it in playlist."
test('music dropped on the app goes to the library, pictures and videos where they always went', () => {
  const files = [
    { name: 'song.mp3', type: 'audio/mpeg' },
    { name: 'song.m4a', type: 'video/mp4' },
    { name: 'photo.png', type: 'image/png' },
    { name: 'clip.mp4', type: 'video/mp4' },
    { name: 'notes.txt', type: 'text/plain' }
  ];
  const { music, media } = splitDrop(files);
  assert.deepEqual(music.map(f => f.name), ['song.mp3', 'song.m4a']);
  assert.deepEqual(media.map(f => f.name), ['photo.png', 'clip.mp4']);
});
