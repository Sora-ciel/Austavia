import { test } from 'node:test';
import assert from 'node:assert/strict';

import { audioAddressMethod, addressForAudio, releaseAudioAddress } from '../src/utils/audioAddress.js';

// Wanted: "when you move the timeline, a music that worked well stops working
// at all — the timeline moves again but no sound." On the Linux app an m4a
// played from a blob cannot seek backwards (see the module), so there it is
// played from the app's own local server. Nowhere else changes.

const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/140.0';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/140.0 Mobile';

test('the Linux desktop app plays music from its local server', () => {
  assert.equal(audioAddressMethod({ isTauri: true, userAgent: LINUX_UA }), 'server');
});

test('the Windows app, the phone and a browser tab keep playing from memory', () => {
  assert.equal(audioAddressMethod({ isTauri: true, userAgent: WINDOWS_UA }), 'blob');
  assert.equal(audioAddressMethod({ userAgent: ANDROID_UA }), 'blob');
  assert.equal(audioAddressMethod({ userAgent: LINUX_UA }), 'blob');
});

test('on Linux the track goes to the server, with its type, and its address is played', async () => {
  const calls = [];
  const invoke = async (command, body, options) => {
    calls.push({ command, body, options });
    return 'http://127.0.0.1:41234/code';
  };
  const blob = new Blob([Uint8Array.from([1, 2, 3])], { type: 'audio/mp4' });
  const address = await addressForAudio(blob, { method: 'server', invoke });
  assert.equal(address, 'http://127.0.0.1:41234/code');
  assert.equal(calls[0].command, 'serve_audio');
  assert.deepEqual([...calls[0].body], [1, 2, 3]);
  assert.equal(calls[0].options.headers['x-audio-type'], 'audio/mp4');
});

test('if the server cannot be reached the track still plays, from memory', async () => {
  const invoke = async () => { throw new Error('no server'); };
  const original = console.error;
  console.error = () => {};
  try {
    const address = await addressForAudio(new Blob([Uint8Array.from([1])]), { method: 'server', invoke });
    assert.match(address, /^blob:/);
    releaseAudioAddress(address);
  } finally {
    console.error = original;
  }
});

test('everywhere else the player gets a blob, as before', async () => {
  const address = await addressForAudio(new Blob([Uint8Array.from([1])]), { method: 'blob' });
  assert.match(address, /^blob:/);
  releaseAudioAddress(address);
});

test('letting go of a server address does nothing; the server drops old tracks itself', () => {
  assert.doesNotThrow(() => releaseAudioAddress('http://127.0.0.1:41234/code'));
  assert.doesNotThrow(() => releaseAudioAddress(''));
});
