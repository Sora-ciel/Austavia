import { test } from 'node:test';
import assert from 'node:assert/strict';

import { faststart, playableAudio, looksLikeMp4 } from '../src/utils/mp4Faststart.js';

// Wanted: "the musics that are m4a don't work well when playing [on Linux] …
// sometimes the whole playing is silent till you change the timeline."
// Measured in a WebKitGTK webview: an m4a whose index (moov) comes after its
// sound (mdat) played with no sound at all, and the same file with moov first
// played at once. So the player is handed a copy with moov first.

function atom(type, ...parts) {
  const body = parts.flatMap(part => [...part]);
  const size = 8 + body.length;
  return Uint8Array.from([
    (size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255,
    ...[...type].map(c => c.charCodeAt(0)),
    ...body
  ]);
}

function u32(...values) {
  return Uint8Array.from(values.flatMap(v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]));
}

function concat(...arrays) {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrays) { out.set(a, at); at += a.length; }
  return out;
}

const SOUND = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

/** ftyp, free, mdat, moov — the layout of the files that played silent. */
function indexAtTheEnd({ wide = false } = {}) {
  const ftyp = atom('ftyp', Uint8Array.from([...'M4A '].map(c => c.charCodeAt(0))), u32(0));
  const free = atom('free');
  const mdatStart = ftyp.length + free.length;
  const mdat = atom('mdat', SOUND);
  // Two chunks, at the start and the middle of the sound.
  const chunks = [mdatStart + 8, mdatStart + 8 + 6];
  const offsets = wide
    ? atom('co64', u32(0), u32(chunks.length), ...chunks.map(c => u32(0, c)))
    : atom('stco', u32(0), u32(chunks.length), u32(...chunks));
  const moov = atom('moov', atom('trak', atom('mdia', atom('minf', atom('stbl', offsets)))));
  return { file: concat(ftyp, free, mdat, moov), moovSize: moov.length, chunks };
}

function topLevel(bytes) {
  const types = [];
  for (let at = 0; at < bytes.length;) {
    const size = new DataView(bytes.buffer, bytes.byteOffset).getUint32(at);
    types.push(String.fromCharCode(...bytes.subarray(at + 4, at + 8)));
    at += size;
  }
  return types;
}

function chunkOffsets(bytes, { wide = false } = {}) {
  const name = wide ? 'co64' : 'stco';
  const at = Buffer.from(bytes).indexOf(name) - 4;
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const count = view.getUint32(at + 12);
  return Array.from({ length: count }, (_, i) =>
    wide ? view.getUint32(at + 16 + i * 8 + 4) : view.getUint32(at + 16 + i * 4));
}

function soundAt(bytes, offset) {
  return bytes[offset];
}

test('an m4a with its index at the end is handed to the player with the index first', () => {
  const { file } = indexAtTheEnd();
  assert.deepEqual(topLevel(faststart(file)), ['ftyp', 'free', 'moov', 'mdat']);
});

test('every chunk still points at the same sound once the index has moved', () => {
  const { file, chunks } = indexAtTheEnd();
  const moved = faststart(file);
  const before = chunks.map(c => soundAt(file, c));
  const after = chunkOffsets(moved).map(c => soundAt(moved, c));
  assert.deepEqual(after, before);
});

test('the same holds for big files, whose offsets are 64-bit', () => {
  const { file, chunks } = indexAtTheEnd({ wide: true });
  const moved = faststart(file);
  assert.deepEqual(topLevel(moved), ['ftyp', 'free', 'moov', 'mdat']);
  assert.deepEqual(
    chunkOffsets(moved, { wide: true }).map(c => soundAt(moved, c)),
    chunks.map(c => soundAt(file, c))
  );
});

test('nothing is added or lost, only moved', () => {
  const { file } = indexAtTheEnd();
  const moved = faststart(file);
  assert.equal(moved.length, file.length);
});

test('a file already in the right order is left alone', () => {
  const { file } = indexAtTheEnd();
  assert.equal(faststart(faststart(file)), null);
});

test('something that is not an MP4 is left alone', () => {
  const mp3 = Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
  assert.equal(looksLikeMp4(mp3), false);
  assert.equal(faststart(mp3), null);
});

test('a damaged MP4 is played as it is rather than guessed at', () => {
  const { file } = indexAtTheEnd();
  assert.equal(faststart(file.subarray(0, file.length - 5)), null);
});

test('the player gets a reordered copy and the stored track is not touched', async () => {
  const { file } = indexAtTheEnd();
  const stored = new Blob([file], { type: 'audio/mp4' });
  const played = await playableAudio(stored);
  assert.notEqual(played, stored);
  assert.deepEqual(topLevel(new Uint8Array(await played.arrayBuffer())), ['ftyp', 'free', 'moov', 'mdat']);
  assert.deepEqual(new Uint8Array(await stored.arrayBuffer()), file);
  assert.equal(played.type, 'audio/mp4');
});

test('an mp3 goes to the player exactly as stored', async () => {
  const mp3 = new Blob([Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0])], { type: 'audio/mpeg' });
  assert.equal(await playableAudio(mp3), mp3);
});
