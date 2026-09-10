import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKGROUND_DEFAULTS,
  normalizeBackgroundSettings,
  backgroundImageFor,
  usesPortraitBackground,
  backgroundLayerStyle
} from '../src/utils/modeBackground.js';

describe('normalizeBackgroundSettings', () => {
  it('fills in everything a folder has never set', () => {
    const s = normalizeBackgroundSettings({});
    assert.deepEqual(s, BACKGROUND_DEFAULTS);
  });

  it('copes with nothing at all', () => {
    assert.equal(normalizeBackgroundSettings().bgOpacity, 100);
    assert.equal(normalizeBackgroundSettings(null).bgSize, 'cover');
  });

  // Saves from before the 0–100 rewrite stored opacity as a 0–1 fraction. The
  // two formats overlap at exactly 1, which is why the marker is the presence
  // of bgLuminosity rather than the magnitude — reading it by size turns a
  // legitimate 1% into 100%.
  it('scales up a legacy fractional opacity', () => {
    assert.equal(normalizeBackgroundSettings({ bgOpacity: 0.4 }).bgOpacity, 40);
  });

  it('leaves a real 1% alone when the save is not legacy', () => {
    assert.equal(
      normalizeBackgroundSettings({ bgOpacity: 1, bgLuminosity: 100 }).bgOpacity,
      1
    );
  });

  it('clamps everything into range', () => {
    const s = normalizeBackgroundSettings({ bgOpacity: 500, bgLuminosity: -20, bgBlur: -5 });
    assert.equal(s.bgOpacity, 100);
    assert.equal(s.bgLuminosity, 0);
    assert.equal(s.bgBlur, 0);
  });

  it('only accepts the two sizes it knows', () => {
    assert.equal(normalizeBackgroundSettings({ bgSize: 'contain' }).bgSize, 'contain');
    assert.equal(normalizeBackgroundSettings({ bgSize: 'stretch' }).bgSize, 'cover');
  });

  // A theme's wallpaper is layered on at render time and must never end up in
  // a save, or the stored copy outranks the theme and becomes a dead reference
  // the day the theme is removed.
  it('lets the caller reject an image it should not keep', () => {
    const s = normalizeBackgroundSettings(
      { backgroundImage: 'theme://hato.png', backgroundImageMobile: 'mine.png' },
      { keepImage: value => (value.startsWith('theme://') ? '' : value) }
    );

    assert.equal(s.backgroundImage, '');
    assert.equal(s.backgroundImageMobile, 'mine.png');
  });

  it('never returns a non-string image', () => {
    const s = normalizeBackgroundSettings({ backgroundImage: 42, backgroundImageMobile: null });
    assert.equal(s.backgroundImage, '');
    assert.equal(s.backgroundImageMobile, '');
  });

  it('treats the theme opt-out as strictly boolean', () => {
    assert.equal(normalizeBackgroundSettings({ bgThemeOptOut: 'yes' }).bgThemeOptOut, false);
    assert.equal(normalizeBackgroundSettings({ bgThemeOptOut: true }).bgThemeOptOut, true);
  });
});

describe('backgroundImageFor', () => {
  const settings = { backgroundImage: 'desktop.png', backgroundImageMobile: 'phone.png' };

  it('picks the one for this screen', () => {
    assert.equal(backgroundImageFor(settings, { isMobile: false }), 'desktop.png');
    assert.equal(backgroundImageFor(settings, { isMobile: true }), 'phone.png');
  });

  it('is empty when that screen has none', () => {
    assert.equal(backgroundImageFor({ backgroundImage: 'a.png' }, { isMobile: true }), '');
    assert.equal(backgroundImageFor({}), '');
    assert.equal(backgroundImageFor(), '');
  });
});

describe('backgroundLayerStyle', () => {
  it('is null when there is no image, so nothing is rendered at all', () => {
    assert.equal(backgroundLayerStyle({}), null);
    assert.equal(backgroundLayerStyle({ backgroundImage: '' }), null);
  });

  it('turns opacity into the fraction CSS wants', () => {
    assert.equal(backgroundLayerStyle({ backgroundImage: 'a.png', bgOpacity: 40 }).opacity, 0.4);
  });

  it('leaves the filter alone when nothing was asked for', () => {
    const style = backgroundLayerStyle({ backgroundImage: 'a.png' });
    assert.equal(style.filter, 'none');
    assert.equal(style.bleed, 0);
  });

  it('combines blur and brightness in one filter', () => {
    const style = backgroundLayerStyle({ backgroundImage: 'a.png', bgBlur: 4, bgLuminosity: 50 });
    assert.match(style.filter, /blur\(4px\)/);
    assert.match(style.filter, /brightness\(0\.5\)/);
  });

  // A blurred edge fades to nothing, so the layer has to spill past its
  // container or a band of the colour underneath shows around the picture.
  it('bleeds past the edges in proportion to the blur', () => {
    assert.equal(backgroundLayerStyle({ backgroundImage: 'a.png', bgBlur: 0 }).bleed, 0);
    assert.ok(backgroundLayerStyle({ backgroundImage: 'a.png', bgBlur: 6 }).bleed >= 12);
  });

  it('passes the size through, defaulting to cover', () => {
    assert.equal(backgroundLayerStyle({ backgroundImage: 'a.png' }).size, 'cover');
    assert.equal(
      backgroundLayerStyle({ backgroundImage: 'a.png', bgSize: 'contain' }).size,
      'contain'
    );
  });

  it('uses the mobile image when asked', () => {
    const style = backgroundLayerStyle(
      { backgroundImage: 'd.png', backgroundImageMobile: 'm.png' },
      { isMobile: true }
    );
    assert.equal(style.image, 'm.png');
  });
});

// This was a width threshold, and a phone held sideways is still narrower than
// a desktop — so rotating never reached the wide picture.
describe('which of the two images a screen gets', () => {
  it('gives a phone held upright the tall image', () => {
    assert.equal(usesPortraitBackground({ width: 412, height: 915 }), true);
  });

  it('gives the same phone turned sideways the wide one', () => {
    assert.equal(usesPortraitBackground({ width: 915, height: 412 }), false);
  });

  it('leaves a desktop on the wide image, however small the window', () => {
    assert.equal(usesPortraitBackground({ width: 1920, height: 1080 }), false);
    assert.equal(usesPortraitBackground({ width: 1100, height: 700 }), false);
  });

  it('lets a tablet follow how it is held, like the phone', () => {
    assert.equal(usesPortraitBackground({ width: 768, height: 1024 }), true);
    assert.equal(usesPortraitBackground({ width: 1024, height: 768 }), false);
  });

  it('does not call an exactly square window portrait', () => {
    assert.equal(usesPortraitBackground({ width: 800, height: 800 }), false);
  });

  it('falls back to the wide image on nonsense dimensions', () => {
    for (const bad of [{}, { width: 0, height: 0 }, { width: NaN, height: 500 }, undefined]) {
      assert.equal(usesPortraitBackground(bad), false);
    }
  });
});
