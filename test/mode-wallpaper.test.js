// Which modes draw the folder's wallpaper.
//
// Asked for on 2026-09-27: "make other modes have as background the
// background that Canvas mode uses ... the same background and
// settings as the image background in Canvas mode."

import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { usesPortraitBackground } from '../src/utils/modeBackground.js';

import { MODE_ORDER, hasWallpaper } from '../src/Modes/modeRegistry.js';

it('gives every mode the folder wallpaper', () => {
  for (const mode of MODE_ORDER) {
    assert.equal(hasWallpaper(mode), true, mode);
  }
});

it('has no wallpaper for a mode it does not know', () => {
  assert.equal(hasWallpaper('nonsense'), false);
});

// Reported 2026-10-26: "a lot of the modes using the bg don't seem to change it
// when you put the phone on landscape ... we need to fix it on all modes."
//
// Simple Note, Habit Tracker and Task mode draw through ModeWallpaper, which
// chose the phone image by `innerWidth <= 1024` -- a phone on its side is
// still under 1024px wide, so it kept the upright picture. Canvas, Playlist
// and Single Note already chose by the screen's shape. Every wallpaper now
// chooses by shape, and looks again when the phone turns.

const WALLPAPER_DRAWERS = [
  'components/ModeWallpaper.svelte',
  // Not a drawer, but the Bg panel edits the picture on show, so it has to
  // agree with them about which one that is.
  'advanced-param/LeftControls.svelte',
  'Modes/CanvasMode.svelte',
  'Modes/PlaylistMode.svelte',
  'Modes/SingleNoteMode.svelte'
];

it('a phone turned on its side shows the landscape wallpaper', () => {
  assert.equal(usesPortraitBackground({ width: 390, height: 844 }), true);
  assert.equal(usesPortraitBackground({ width: 844, height: 390 }), false);
});

it('every mode picks its wallpaper by the screen shape, and looks again when the phone turns', () => {
  for (const path of WALLPAPER_DRAWERS) {
    const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
    assert.match(source, /usesPortraitBackground/, `${path} chooses by shape`);
    assert.match(source, /addEventListener\(['"]orientationchange['"]/, `${path} re-measures on rotation`);
  }
});
