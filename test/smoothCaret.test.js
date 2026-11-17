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
  assert.ok(CARET_GLIDE_MS > 0 && CARET_GLIDE_MS <= 120);
});
