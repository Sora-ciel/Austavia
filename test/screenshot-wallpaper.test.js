// Putting Canvas mode's wallpaper into a screenshot of it.
//
// Asked for on 2026-09-27: "make it also screenshot the backgrounds in Canvas
// mode and other modes using background images." Single Note and Playlist
// already had theirs in the picture; Canvas pins its wallpaper outside the
// board, so the board's screenshot never had it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { wallpaperPaint, wallpaperRect } from '../src/utils/screenshotWallpaper.js';

describe('wallpaperPaint', () => {
  it('is nothing when there is no wallpaper', () => {
    assert.equal(wallpaperPaint({ backgroundImage: '' }), null);
    assert.equal(wallpaperPaint(null), null);
  });

  it('paints it the way the screen does', () => {
    const paint = wallpaperPaint({ backgroundImage: 'data:x', bgOpacity: 60, bgLuminosity: 50, bgSize: 'contain' });
    assert.equal(paint.image, 'data:x');
    assert.equal(paint.alpha, 0.6);
    assert.equal(paint.filter, 'brightness(0.5)');
    assert.equal(paint.size, 'contain');
  });

  // A 6px blur on screen, in a picture drawn twice as large, is 12px -- or it
  // looks half as soft as what was on screen.
  it('scales the blur, and the bleed that hides its edges, with the picture', () => {
    const paint = wallpaperPaint({ backgroundImage: 'data:x', bgBlur: 6 }, { scale: 2 });
    assert.equal(paint.filter, 'blur(12px)');
    assert.equal(paint.bleed, 24);
  });

  it('uses the phone image on a phone, as the screen does', () => {
    const settings = { backgroundImage: 'wide', backgroundImageMobile: 'tall' };
    assert.equal(wallpaperPaint(settings, { isMobile: true }).image, 'tall');
    assert.equal(wallpaperPaint(settings, { isMobile: false }).image, 'wide');
  });
});

describe('wallpaperRect', () => {
  // The screenshot is of the whole board, so the wallpaper covers the whole
  // picture rather than stopping where the window did.
  it('covers the whole picture, centred, cropping the overflow', () => {
    const rect = wallpaperRect({ imageWidth: 400, imageHeight: 300, width: 800, height: 800 });
    assert.ok(Math.abs(rect.width - 800 * 4 / 3) < 1e-9);
    assert.equal(rect.height, 800);
    assert.equal(rect.x, (800 - rect.width) / 2);
    assert.equal(rect.y, 0);
  });

  it('fits inside it when set to contain', () => {
    const rect = wallpaperRect({ imageWidth: 400, imageHeight: 300, width: 800, height: 800, size: 'contain' });
    assert.equal(rect.width, 800);
    assert.equal(rect.height, 600);
    assert.equal(rect.y, 100);
  });

  it('reaches past every edge by the bleed', () => {
    const rect = wallpaperRect({ imageWidth: 100, imageHeight: 100, width: 100, height: 100, bleed: 10 });
    assert.deepEqual(rect, { x: -10, y: -10, width: 120, height: 120 });
  });
});
