// Asked for on 2026-10-06: "our official themes aren't entirely redoable in
// the custom theme page. They should be." A copy of a see-through theme came
// out different from the original -- the list that opens from Modes had lost
// its backing -- because a custom theme kept only its panel and block colours.
// See src/utils/themeExtras.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extrasOf, withExtras, lookOf, THEME_EXTRA_FIELDS } from '../src/utils/themeExtras.js';
import { SEE_THROUGH_PRESETS, LIME_WIRE_PRESET } from '../src/utils/outlineTheme.js';
import { EXTRA_PRESETS } from '../src/utils/extraThemes.js';
import { HATO_PRESETS } from '../src/utils/hatoTheme.js';
import { themeForSync, themeFromSync } from '../src/utils/themeSync.js';
import { parseCssColor, formatCssColor, solidColor } from '../src/utils/cssColor.js';

const official = [...EXTRA_PRESETS, ...HATO_PRESETS, ...SEE_THROUGH_PRESETS];

describe('a copy of an official theme', () => {
  it('looks exactly like the original, for every official theme', () => {
    for (const theme of official) {
      const copy = { id: 'copy', name: `${theme.name} Copy`, ...lookOf(theme) };
      for (const field of ['controlColors', 'blockTheme', 'previewBg', ...THEME_EXTRA_FIELDS]) {
        assert.deepEqual(copy[field], theme[field], `${theme.name}: ${field}`);
      }
    }
  });

  it('keeps a see-through theme’s pop-up backing, so the Modes list is not invisible', () => {
    assert.ok(LIME_WIRE_PRESET.popupBg);
    assert.equal(lookOf(LIME_WIRE_PRESET).popupBg, LIME_WIRE_PRESET.popupBg);
  });

  it('keeps Mr.Lee’s toolbar characters, which used to follow the theme’s id', () => {
    for (const theme of HATO_PRESETS) assert.equal(lookOf(theme).buddyIcons, true);
  });

  it('arrives on another device the same, through the cloud', () => {
    for (const theme of official) {
      const back = themeFromSync(themeForSync({ ...theme, id: 'copy', createdAt: 1 }));
      assert.deepEqual(lookOf(back), lookOf(theme), theme.name);
    }
  });
});

describe('editing a theme', () => {
  it('an extra cleared in the editor is gone, not kept from before', () => {
    const before = { name: 'Mine', popupBg: '#000000c7', playerVeil: '#000000' };
    const after = withExtras(before, { popupBg: '', playerVeil: '#111111' });
    assert.equal('popupBg' in after, false);
    assert.equal(after.playerVeil, '#111111');
  });

  it('a half-filled pair keeps the half that is set', () => {
    assert.deepEqual(extrasOf({ blockDefaults: { bgColor: '', textColor: '#ffffff' } }), { blockDefaults: { textColor: '#ffffff' } });
    assert.deepEqual(extrasOf({ blockDefaults: { bgColor: '', textColor: '' } }), {});
  });
});

// The colour picker has no alpha, and a see-through theme's panels are
// eight-digit hex at zero alpha: editing one used to flatten it to opaque.
describe('a colour in the editor keeps how see-through it is', () => {
  it('reads a see-through panel’s colour and its opacity', () => {
    assert.deepEqual(parseCssColor('#0c120000'), { hex: '#0c1200', alpha: 0, form: 'hex' });
    assert.deepEqual(parseCssColor('rgba(12, 18, 0, 0.78)'), { hex: '#0c1200', alpha: 0.78, form: 'rgba' });
  });

  it('puts it back in the form it was written in', () => {
    assert.equal(formatCssColor('#0c1200', 0, 'hex'), '#0c120000');
    assert.equal(formatCssColor('#0c1200', 0.78, 'rgba'), 'rgba(12, 18, 0, 0.78)');
    assert.equal(formatCssColor('#0c1200', 1, 'hex'), '#0c1200');
  });

  it('leaves gradients and variables to the text field', () => {
    assert.equal(parseCssColor('linear-gradient(red, blue)'), null);
    assert.equal(parseCssColor('var(--bg)'), null);
  });
});

// Reported on 2026-10-06: on see-through themes a pressed button such as Bin
// swapped its writing to the panel colour, which is clear -- so the writing
// vanished. It now swaps to the panel colour at full opacity.
describe('writing on a button filled with the text colour', () => {
  it('takes the panel colour at full opacity, so a see-through theme can still read it', () => {
    assert.equal(solidColor('#0c120000'), '#0c1200');
    assert.equal(solidColor('rgba(12, 18, 0, 0.78)'), '#0c1200');
    assert.equal(solidColor('#222222'), '#222222');
  });

  it('leaves what is not a plain colour to the fallback', () => {
    assert.equal(solidColor('linear-gradient(red, blue)', '#17171a'), '#17171a');
  });
});
