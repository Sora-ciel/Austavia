// Outline, the see-through theme.
//
// Asked for on 2026-09-27: "a new base official theme that will be making
// invisible everything but the text and the shadows or outlines." These say
// that in its words, so a later tidy-up that gives a panel a "sensible"
// background has to read this first.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { OUTLINE_PRESET, seeThroughPreset, SEE_THROUGH_PRESETS } from '../src/utils/outlineTheme.js';
import { BLOCK_THEME_DEFAULTS } from '../src/utils/themeDefaults.js';

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

// Asked for afterwards: "make it so that controls background is also a black
// at the same opacity" as the pop-ups.
it('puts the toolbar on the same black as the pop-ups', () => {
  for (const side of ['left', 'right']) {
    const panel = OUTLINE_PRESET.controlColors[side].panelBg;
    assert.equal(panel.slice(0, 7), '#000000', `${side} is black`);
    assert.ok(Math.abs(alphaOf(panel) / 255 - 0.78) < 0.01, `${side} alpha ${alphaOf(panel) / 255}`);
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

// "Make 3 other themes that are a bit like Outline, with different colours
// and levels of 'this will not have opacity, or this will have more'."
describe('the other see-through themes', () => {
  const others = SEE_THROUGH_PRESETS.filter(theme => theme !== OUTLINE_PRESET);
  const alpha = rgba => Number(/, ([\d.]+)\)$/.exec(rgba)?.[1]);

  it('are three, each its own theme', () => {
    assert.equal(others.length, 3);
    const ids = SEE_THROUGH_PRESETS.map(theme => theme.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('come from the same template, with their own colours', () => {
    for (const theme of others) {
      assert.ok(theme.popupBg, `${theme.id} has a pop-up backing`);
      assert.equal(alphaOf(theme.controlColors.left.buttonBg), 0, `${theme.id} buttons are clear`);
      assert.notEqual(theme.blockTheme.headerText, OUTLINE_PRESET.blockTheme.headerText, `${theme.id} has its own ink`);
    }
  });

  it('go further than Outline in one direction and less far in another', () => {
    const [amber, frost, chalk] = others;
    // No backing on the toolbar at all.
    assert.equal(alphaOf(amber.controlColors.left.panelBg), 0);
    // Blocks keep some of their surface, headers more.
    assert.ok(frost.blockTheme.bgOpacity > 0 && frost.blockTheme.headerOpacity > frost.blockTheme.bgOpacity);
    // Pop-ups more opaque than Outline's.
    assert.ok(alpha(frost.popupBg) > alpha(OUTLINE_PRESET.popupBg));
    assert.ok(alpha(chalk.popupBg) > alpha(OUTLINE_PRESET.popupBg));
    assert.ok(chalk.blockTheme.bgOpacity > 0);
  });
});
