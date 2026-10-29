// Putting Canvas mode's wallpaper into a screenshot of it.
//
// Asked for on 2026-09-27: "make it also screenshot the backgrounds in Canvas
// mode and other modes using background images." Single Note and Playlist
// already had theirs in the picture; Canvas pins its wallpaper outside the
// board, so the board's screenshot never had it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { wallpaperPaint, wallpaperRect } from '../src/utils/screenshotWallpaper.js';
import { readFileSync as readSource } from 'node:fs';
import { WALLPAPER_LAYER_CLASSES, isWallpaperLayer, wallpaperSettingsFor } from '../src/utils/screenshotWallpaper.js';

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

// Reported 2026-10-28, on the phone: "the screenshot ... without capturing the
// background." Every mode's wallpaper is now painted under the capture, as
// Canvas's was; the layer it is drawn in on screen is left out.

it('every mode with a wallpaper gets it in its screenshot, from the settings it is drawn from', () => {
  const canvas = { backgroundImage: 'c' };
  const others = { backgroundImage: 'o' };
  assert.equal(wallpaperSettingsFor('default', { hasWallpaper: true, canvas, others }), canvas);
  for (const mode of ['simple', 'single', 'habit', 'task', 'playlist']) {
    assert.equal(wallpaperSettingsFor(mode, { hasWallpaper: true, canvas, others }), others, mode);
  }
  assert.equal(wallpaperSettingsFor('single', { hasWallpaper: false, canvas, others }), null);
});

it('the layer every mode draws its wallpaper in is one the capture knows to leave out', () => {
  const drawers = {
    'Modes/CanvasMode.svelte': 'canvas-bg-holder',
    'components/ModeWallpaper.svelte': 'mode-wallpaper',
    'Modes/SingleNoteMode.svelte': 'note-bg-clip',
    'Modes/PlaylistMode.svelte': 'pl-bg-holder'
  };
  for (const [path, name] of Object.entries(drawers)) {
    const source = readSource(new URL(`../src/${path}`, import.meta.url), 'utf8');
    assert.match(source, new RegExp(`class="${name}`), path);
    assert.ok(WALLPAPER_LAYER_CLASSES.includes(name));
    assert.equal(isWallpaperLayer({ classList: { contains: c => c === name } }), true);
  }
});

// Found while fixing the above: the Habit Tracker never handed its root to the
// app, so its screenshot was of the whole page, whose own background covered
// the wallpaper. Every mode the switcher mounts hands its root up.
it('every mode hands its root up, so the screenshot is of the mode and not the whole page', () => {
  const switcher = readSource(new URL('../src/Modes/ModeSwitcher.svelte', import.meta.url), 'utf8');
  const mounts = switcher.match(/<[A-Z]\w*Mode\b[\s\S]*?\/>/g) || [];
  assert.ok(mounts.length >= 6, `found ${mounts.length}`);
  for (const mount of mounts) assert.match(mount, /bind:canvasRef/, mount.split('\n')[0]);
});

// Found on the phone 2026-10-28: a wallpaper the screen had already shown sat
// in the cache without the permission to be drawn into a picture, so the
// screenshot, asking for the same address, was refused. It asks for its own.
import { freshCopyUrl } from '../src/utils/screenshotWallpaper.js';

it('a screenshot fetches its own copy of a wallpaper from the cloud, never the cached one', () => {
  const cloud = 'https://firebasestorage.googleapis.com/v0/b/x/o/wall.jpg?alt=media&token=abc';
  assert.equal(freshCopyUrl(cloud, 7), `${cloud}&screenshot=7`);
  assert.equal(freshCopyUrl('https://example.com/wall.jpg', 7), 'https://example.com/wall.jpg?screenshot=7');
});

it('a wallpaper held in the folder is used as it is', () => {
  assert.equal(freshCopyUrl('data:image/png;base64,AAAA', 7), 'data:image/png;base64,AAAA');
});
