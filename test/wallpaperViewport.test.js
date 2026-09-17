import { test } from 'node:test';
import assert from 'node:assert/strict';

import { steadyWallpaperHeight, isTyping } from '../src/utils/wallpaperViewport.js';

// Named after the report: "the background image moves up when the phone
// keyboard shows itself", in Single Note and Playlist mode.
//
// Nothing moves it. The keyboard genuinely shrinks the page — that is deliberate
// and is why the controls stay reachable and the caret stays on screen — and a
// centred picture re-fitted into a shorter box appears to jump upwards.

const phone = { previousWidth: 390, width: 390, previousHeight: 844 };

test('the wallpaper holds still while the keyboard is up', () => {
  assert.equal(steadyWallpaperHeight({ ...phone, height: 420, typing: true }), 844);
});

test('it comes back down to the window when the keyboard closes', () => {
  // The height grows again, and a grown height is always taken: holding a
  // smaller one back would leave the picture short of the bottom of the screen.
  assert.equal(steadyWallpaperHeight({ ...phone, previousHeight: 844, height: 844, typing: false }), 844);
  assert.equal(steadyWallpaperHeight({ ...phone, previousHeight: 420, height: 844, typing: true }), 844);
});

test('a window that really is smaller is followed', () => {
  // Shorter with nothing being written into is somebody dragging a window edge,
  // not a keyboard — and a percentage of shrink could never tell those apart,
  // which is why what is focused decides it instead.
  assert.equal(steadyWallpaperHeight({ ...phone, height: 420, typing: false }), 420);
});

test('a rotation is not a keyboard, even mid-sentence', () => {
  // Both measurements change, and the old height describes a shape that no
  // longer exists.
  assert.equal(
    steadyWallpaperHeight({ previousWidth: 390, width: 844, previousHeight: 844, height: 390, typing: true }),
    390
  );
});

test('the first measurement is simply taken', () => {
  assert.equal(steadyWallpaperHeight({ width: 390, height: 844 }), 844);
  assert.equal(steadyWallpaperHeight({ previousHeight: 0, width: 390, height: 844, typing: true }), 844);
});

test('a height that makes no sense leaves the picture as it was', () => {
  // Rather than collapsing it to nothing, which is the one visible failure.
  assert.equal(steadyWallpaperHeight({ ...phone, height: 0, typing: false }), 844);
  assert.equal(steadyWallpaperHeight({ ...phone, height: NaN }), 844);
  assert.equal(steadyWallpaperHeight({ ...phone, height: undefined }), 844);
  assert.equal(steadyWallpaperHeight(), 0);
});

test('typing in a note counts, and so does a plain field', () => {
  assert.equal(isTyping({ tagName: 'INPUT' }), true);
  assert.equal(isTyping({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTyping({ tagName: 'DIV', isContentEditable: true }), true);
});

test('nothing focused, or something that takes no keyboard, does not count', () => {
  assert.equal(isTyping({ tagName: 'DIV', isContentEditable: false }), false);
  assert.equal(isTyping({ tagName: 'BUTTON' }), false);
  assert.equal(isTyping(null), false);
  assert.equal(isTyping(), false);
});
