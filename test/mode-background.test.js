import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKGROUND_DEFAULTS,
  normalizeBackgroundSettings,
  backgroundImageFor,
  noteImageFilter,
  noteImageFilterCss,
  usesPortraitBackground,
  backgroundLayerStyle,
  carryNotePictureSettings
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

// Pictures pasted into a note are whatever brightness they happened to be,
// which on a dark theme is usually a hole burned in the page.
describe('dimming pictures inside a note', () => {
  // Asked for on 2026-09-28: "make this setting unchecked by default". It was
  // on by default before.
  it('does not follow the wallpaper unless told to', () => {
    const out = noteImageFilter({ backgroundImage: 'data:w', bgOpacity: 40, imageOpacity: 70 });
    assert.equal(out.follows, false);
    assert.equal(out.opacity, 0.7);
  });

  it('follows the wallpaper once told to, so one pair of dials covers both', () => {
    const out = noteImageFilter({ backgroundImage: 'data:w', imagesFollowBackground: true, bgOpacity: 40, bgLuminosity: 60, imageOpacity: 100, imageLuminosity: 100 });
    assert.equal(out.follows, true);
    assert.equal(out.opacity, 0.4);
    assert.equal(out.brightness, 0.6);
  });

  it('uses its own dials once told not to follow', () => {
    const out = noteImageFilter({
      imagesFollowBackground: false,
      bgOpacity: 40, bgLuminosity: 60,
      imageOpacity: 90, imageLuminosity: 120
    });
    assert.equal(out.follows, false);
    assert.equal(out.opacity, 0.9);
    assert.equal(out.brightness, 1.2);
  });

  it('treats a folder that never said as not following', () => {
    const out = noteImageFilter({ backgroundImage: 'data:w', bgOpacity: 50, bgLuminosity: 100 });
    assert.equal(out.follows, false);
    assert.equal(out.opacity, 1);
  });

  // "Being able to change the opacity, luminosity etc. of images you add in
  // the note in Single Note mode -- you removed that option." With no
  // wallpaper, following left the pictures on dials nobody could see.
  it('gives the pictures their own dials when there is no wallpaper to follow', () => {
    const out = noteImageFilter({ bgOpacity: 20, imageOpacity: 60, imageLuminosity: 80 });
    assert.equal(out.follows, false);
    assert.equal(out.opacity, 0.6);
    assert.equal(out.brightness, 0.8);
  });

  it('follows on the phone picture too', () => {
    assert.equal(noteImageFilter({ backgroundImageMobile: 'data:w', imagesFollowBackground: true }).follows, true);
  });

  it('clamps nonsense rather than producing an invalid filter', () => {
    const out = noteImageFilter({
      imagesFollowBackground: false,
      imageOpacity: 5000, imageLuminosity: -40
    });
    assert.equal(out.opacity, 1);
    assert.equal(out.brightness, 0);
  });

  it('asks for no filter at all when nothing would change', () => {
    assert.equal(noteImageFilterCss({ bgOpacity: 100, bgLuminosity: 100 }), null,
      'a filter makes a stacking context even when it changes nothing');
    assert.equal(noteImageFilterCss({}), null);
  });

  it('writes a filter when something would change', () => {
    assert.equal(noteImageFilterCss({ imageOpacity: 50 }), 'opacity(0.5) brightness(1)');
  });

  it('normalising keeps the new dials and defaults them to not following', () => {
    const out = normalizeBackgroundSettings({});
    assert.equal(out.imageOpacity, 100);
    assert.equal(out.imageLuminosity, 100);
    assert.equal(out.imagesFollowBackground, false);
    assert.equal(normalizeBackgroundSettings({ imagesFollowBackground: true }).imagesFollowBackground, true);
  });
});

// Reported 2026-09-28: dropping Single Note's own settings took the dials for
// pictures in the note with it -- "the parameters for the images' opacity that
// you put in the note, not the background, you removed that." The wallpaper
// was meant to go; these were not.
describe('carryNotePictureSettings', () => {
  const legacy = {
    backgroundImage: 'data:old-wallpaper',
    imagesFollowBackground: false,
    imageOpacity: 40,
    imageLuminosity: 70
  };

  it('keeps the note-picture dials from Single Note\'s old settings', () => {
    const shared = carryNotePictureSettings({ backgroundImage: 'data:canvas' }, legacy);
    assert.equal(shared.imagesFollowBackground, false);
    assert.equal(shared.imageOpacity, 40);
    assert.equal(shared.imageLuminosity, 70);
  });

  it('does not bring the old wallpaper back', () => {
    const shared = carryNotePictureSettings({ backgroundImage: 'data:canvas' }, legacy);
    assert.equal(shared.backgroundImage, 'data:canvas');
    assert.equal(carryNotePictureSettings({}, legacy).backgroundImage, undefined);
  });

  it('lets a value set since the move win', () => {
    const shared = carryNotePictureSettings({ imageOpacity: 90 }, legacy);
    assert.equal(shared.imageOpacity, 90);
    assert.equal(shared.imageLuminosity, 70);
  });

  it('changes nothing when there are no old settings', () => {
    assert.deepEqual(carryNotePictureSettings({ bgOpacity: 50 }, null), { bgOpacity: 50 });
  });
});

// Every save writes the settings whole, so a folder that never touched the
// picture dials still holds them at their defaults -- that is not a choice.
it('carries the old dials over settings that only hold the defaults', () => {
  const saved = { imagesFollowBackground: false, imageOpacity: 100, imageLuminosity: 100 };
  const shared = carryNotePictureSettings(saved, { imagesFollowBackground: true, imageOpacity: 40 });
  assert.equal(shared.imagesFollowBackground, true);
  assert.equal(shared.imageOpacity, 40);
  assert.equal(shared.imageLuminosity, 100);
});
