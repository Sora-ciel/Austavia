// Outline, the see-through theme.
//
// Asked for on 2026-09-27: "a new base official theme that will be making
// invisible everything but the text and the shadows or outlines." These say
// that in its words, so a later tidy-up that gives a panel a "sensible"
// background has to read this first.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { OUTLINE_PRESET } from '../src/utils/outlineTheme.js';
import { BLOCK_THEME_DEFAULTS } from '../src/utils/themeDefaults.js';

const alphaOf = hex => (/^#[0-9a-f]{8}$/i.test(hex) ? parseInt(hex.slice(7), 16) : 255);

describe('Outline makes everything invisible but the text, the shadows and the outlines', () => {
  const { blockTheme, controlColors } = OUTLINE_PRESET;

  it('has invisible block surfaces and headers', () => {
    assert.equal(blockTheme.bgOpacity, 0);
    assert.equal(blockTheme.headerOpacity, 0);
  });

  it('has invisible panels, buttons and fields', () => {
    for (const side of ['left', 'right']) {
      assert.equal(alphaOf(controlColors[side].panelBg), 0, `${side} panel`);
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

// A theme field every block reads has to exist on every theme, or the ones
// that predate it would inherit whatever the page last set.
it('gives every theme a text shadow, none unless it asks for one', () => {
  assert.equal(BLOCK_THEME_DEFAULTS.textShadow, 'none');
});
