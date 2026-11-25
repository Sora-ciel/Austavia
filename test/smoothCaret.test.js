// Asked 2026-11-17: "the caret we use to write seems so long", and a bit of
// animation so writing feels smoother (src/utils/smoothCaret.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caretBox, CARET_HEIGHT, CARET_GLIDE_MS } from '../src/utils/smoothCaret.js';

const host = { left: 100, top: 50 };

test('the caret is as tall as the letters, not the whole line', () => {
  // A 16px font in a line 32px tall (generous line spacing).
  const box = caretBox({ rect: { left: 140, top: 60, bottom: 92 }, host, fontSize: 16 });
  assert.equal(box.height, 16 * CARET_HEIGHT);
  // Centred on the line, where the letters are.
  assert.equal(box.y + box.height / 2, 76 - 50);
  assert.equal(box.x, 40);
});

test('never taller than the line itself', () => {
  const box = caretBox({ rect: { left: 0, top: 0, bottom: 10 }, host: { left: 0, top: 0 }, fontSize: 30 });
  assert.equal(box.height, 10);
});

test('on the zoomed Canvas it lands in the block\'s own pixels', () => {
  const box = caretBox({ rect: { left: 300, top: 100, bottom: 140 }, host: { left: 100, top: 50 }, scale: 2, fontSize: 16 });
  assert.equal(box.x, 100);
  assert.equal(box.height, Math.min(20, 16 * CARET_HEIGHT));
});

test('it glides quickly: smoother, never behind the writing for long', () => {
  assert.equal(CARET_GLIDE_MS, 80);
});

// Asked 2026-11-25, and wanted: first "on phone the animation of the caret
// should have less ms, because the phone seems to take more latency", then
// "remove the animation on phone".
import { caretGlideMs } from '../src/utils/smoothCaret.js';
test('on a phone the caret does not glide at all: it is where the letter went', () => {
  assert.equal(caretGlideMs({ touch: true }), 0);
  assert.equal(caretGlideMs({ touch: false }), CARET_GLIDE_MS);
});

// Asked 2026-11-17: moving the caret by a click or by keys should not glide --
// at 80ms you can see it travel frame by frame. Only writing glides it.
import { caretGlides } from '../src/utils/smoothCaret.js';

test('the caret glides while you write', () => {
  assert.equal(caretGlides({ textChanged: true }), true);
});

test('a click or the arrow keys put it straight where it goes', () => {
  assert.equal(caretGlides({ textChanged: false }), false);
});
