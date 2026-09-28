// Outline, the see-through theme.
//
// Asked for on 2026-09-27: "a new base official theme that will be making
// invisible everything but the text and the shadows or outlines." These say
// that in its words, so a later tidy-up that gives a panel a "sensible"
// background has to read this first.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  OUTLINE_PRESET,
  seeThroughPreset,
  SEE_THROUGH_PRESETS,
  SEE_THROUGH_CORE,
  SEE_THROUGH_EXPERIMENTS,
  INDIGO_GILT_GLASS_PRESET
} from '../src/utils/outlineTheme.js';
import { BLOCK_THEME_DEFAULTS } from '../src/utils/themeDefaults.js';
import { EXTRA_PRESETS, INDIGO_GILT_PRESET } from '../src/utils/extraThemes.js';

const alphaOf = hex => (/^#[0-9a-f]{8}$/i.test(hex) ? parseInt(hex.slice(7), 16) : 255);

describe('Outline makes everything invisible but the text, the shadows and the outlines', () => {
  const { blockTheme, controlColors } = OUTLINE_PRESET;

  it('has invisible block surfaces and headers', () => {
    assert.equal(blockTheme.bgOpacity, 0);
    assert.equal(blockTheme.headerOpacity, 0);
  });

  it('has invisible buttons and fields', () => {
    for (const side of ['left', 'right']) {
      assert.equal(alphaOf(controlColors[side].buttonBg), 0, `${side} buttons`);
    }
    assert.equal(alphaOf(controlColors.left.inputBg), 0, 'fields');
  });

  it('keeps the text fully visible', () => {
    assert.equal(blockTheme.textOpacity, 100);
    assert.equal(alphaOf(controlColors.left.textColor), 255);
    assert.equal(alphaOf(controlColors.right.textColor), 255);
  });

  it('keeps the outlines and the shadows', () => {
    assert.notEqual(blockTheme.borderColor, 'transparent');
    assert.ok(parseFloat(blockTheme.borderWidth) > 0);
    assert.notEqual(blockTheme.shadow, 'none');
    assert.notEqual(blockTheme.textShadow, 'none');
    assert.ok(alphaOf(controlColors.left.borderColor) > 0);
  });
});

// The toolbar went on the pop-ups' 78% black for a while, and then came back
// off: "I really love the opacity settings of Amber Wire, so I would like all
// the Outline themes to follow those." Amber Wire's toolbar is fully clear.
it('leaves the toolbar clear, as Amber Wire does', () => {
  for (const side of ['left', 'right']) {
    assert.equal(alphaOf(OUTLINE_PRESET.controlColors[side].panelBg), 0, side);
  }
});

// Asked for once it had been tried: pop-ups "should have a black background
// with a certain opacity, so it will always be easily readable above all
// images." Black, and neither solid nor see-through.
it('puts pop-ups on black with some opacity, so they read over any wallpaper', () => {
  const match = /^rgba\(0, 0, 0, ([\d.]+)\)$/.exec(OUTLINE_PRESET.popupBg);
  assert.ok(match, `popupBg is ${OUTLINE_PRESET.popupBg}`);
  const alpha = Number(match[1]);
  // "Around 78", once 72 had been seen.
  assert.equal(alpha, 0.78);
});

// "When we do other themes that are as invisible as Outline, we'll take
// Outline's opacity etc. as the default template for those."
describe('Outline is the template for later see-through themes', () => {
  const later = seeThroughPreset({ id: 'later', name: 'Later', ink: '#ffe066' });

  it("starts from exactly Outline's opacities, shape and backings", () => {
    for (const key of ['bgOpacity', 'headerOpacity', 'textOpacity', 'borderWidth', 'borderRadius']) {
      assert.equal(later.blockTheme[key], OUTLINE_PRESET.blockTheme[key], key);
    }
    assert.equal(later.popupBg, OUTLINE_PRESET.popupBg);
    assert.equal(later.controlColors.left.panelBg, OUTLINE_PRESET.controlColors.left.panelBg);
    assert.equal(later.controlColors.right.panelBg, OUTLINE_PRESET.controlColors.right.panelBg);
  });

  it('takes its own colours for the writing and the edges', () => {
    assert.equal(later.blockTheme.headerText, '#ffe066');
    assert.equal(later.controlColors.left.textColor, '#ffe066');
    assert.equal(later.blockTheme.borderColor, 'rgba(255, 224, 102, 0.7)');
  });

  it('lets a theme change anything it wants different', () => {
    const rounder = seeThroughPreset({ id: 'r', name: 'R', blockTheme: { borderRadius: '20px' } });
    assert.equal(rounder.blockTheme.borderRadius, '20px');
    assert.equal(rounder.blockTheme.bgOpacity, 0);
  });
});

// A theme field every block reads has to exist on every theme, or the ones
// that predate it would inherit whatever the page last set.
it('gives every theme a text shadow, none unless it asks for one', () => {
  assert.equal(BLOCK_THEME_DEFAULTS.textShadow, 'none');
});

// "I really love the opacity settings of Amber Wire, so I would like all the
// Outline themes to follow those" -- and "make it so that there's as much
// normal as low opacity ones", with the see-through ones kept together.
describe('the see-through family', () => {
  const amber = SEE_THROUGH_PRESETS.find(theme => theme.id === 'amber-wire');
  const levels = theme => ({
    surface: theme.blockTheme.bgOpacity,
    header: theme.blockTheme.headerOpacity,
    toolbarLeft: alphaOf(theme.controlColors.left.panelBg),
    toolbarRight: alphaOf(theme.controlColors.right.panelBg),
    popup: /, ([\d.]+)\)$/.exec(theme.popupBg)?.[1]
  });

  it("all follow Amber Wire's opacity settings", () => {
    for (const theme of SEE_THROUGH_CORE) {
      assert.deepEqual(levels(theme), levels(amber), theme.id);
    }
  });

  it('each have their own colour', () => {
    const inks = SEE_THROUGH_PRESETS.map(theme => theme.blockTheme.headerText);
    assert.equal(new Set(inks).size, inks.length);
  });

  // "Remove Chalk, Coral Wire and Rose Wire."
  it('no longer has the three that were taken out', () => {
    const ids = SEE_THROUGH_PRESETS.map(theme => theme.id);
    for (const gone of ['chalk', 'coral-wire', 'rose-wire']) assert.ok(!ids.includes(gone), gone);
  });

  // "Even see-throughs with different levels of opacity on things we haven't
  // yet tested" -- each experiment is only worth having if it differs.
  it("has experiments that each vary something from Amber Wire's levels", () => {
    for (const theme of SEE_THROUGH_EXPERIMENTS) {
      // The same colours on the family's own levels, for comparison.
      const plain = seeThroughPreset({
        id: theme.id,
        name: theme.name,
        description: theme.description,
        ink: theme.blockTheme.headerText,
        backing: theme.blockDefaults.bgColor
      });
      const shape = t => JSON.stringify([t.blockTheme, t.controlColors, t.popupBg]);
      assert.notEqual(shape(theme), shape(plain), `${theme.id} is just a colour`);
    }
  });

  it('are marked as one family, so the list can show where they start', () => {
    for (const theme of SEE_THROUGH_PRESETS) assert.equal(theme.family, 'see-through', theme.id);
    for (const theme of EXTRA_PRESETS) assert.notEqual(theme.family, 'see-through', theme.id);
  });

  // Seven ordinary themes live in App.svelte; with the ones in
  // extraThemes.js that is as many as the see-through family.
  it('are matched by as many ordinary themes', () => {
    assert.equal(7 + EXTRA_PRESETS.length, SEE_THROUGH_PRESETS.length);
  });

  it('never share an id with an ordinary theme', () => {
    const ids = [...SEE_THROUGH_PRESETS, ...EXTRA_PRESETS].map(theme => theme.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

// Asked for on 2026-09-28: Indigo Gilt's block writing in "the same colour as
// you use on the buttons in the controls", and "one like Indigo Gilt but with
// transparency for the backgrounds".
describe('Indigo Gilt', () => {
  it("writes in its buttons' gold", () => {
    assert.equal(INDIGO_GILT_PRESET.blockDefaults.textColor, INDIGO_GILT_PRESET.controlColors.left.buttonText);
  });

  it('has a see-through twin in the same gold, with its backgrounds partly clear', () => {
    assert.equal(INDIGO_GILT_GLASS_PRESET.blockTheme.headerText, INDIGO_GILT_PRESET.blockTheme.headerText);
    const { bgOpacity, headerOpacity } = INDIGO_GILT_GLASS_PRESET.blockTheme;
    assert.ok(bgOpacity > 0 && bgOpacity < 100, `surface ${bgOpacity}`);
    assert.ok(headerOpacity > 0 && headerOpacity < 100, `header ${headerOpacity}`);
  });
});
