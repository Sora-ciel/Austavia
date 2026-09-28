// Which modes draw the folder's wallpaper.
//
// Asked for on 2026-09-27: "make other modes have as background (apart from
// Birthday) the background that Canvas mode uses ... the same background and
// settings as the image background in Canvas mode." Birthday is left out on
// purpose -- change that as a decision.

import { it } from 'node:test';
import assert from 'node:assert/strict';

import { MODE_ORDER, hasWallpaper } from '../src/Modes/modeRegistry.js';

it('gives every mode but Birthday the folder wallpaper', () => {
  for (const mode of MODE_ORDER) {
    assert.equal(hasWallpaper(mode), mode !== 'birthday', mode);
  }
});

it('has no wallpaper for a mode it does not know', () => {
  assert.equal(hasWallpaper('nonsense'), false);
});
