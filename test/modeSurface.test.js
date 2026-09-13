import { test } from 'node:test';
import assert from 'node:assert/strict';

import { surfaceBlock, surfaceColors } from '../src/utils/modeSurface.js';

// Named after the request: "like in Single Note mode, the Playlist mode should
// have a particular background, so that the opacity changes don't go to black
// but to the background colour it would have on that mode in Single Note mode."

const theme = { innerBg: '#101820', outerBg: '#000000', textColor: '#e8e8e8' };

test('with a music block in the folder, the playlist mode is the block’s colour', () => {
  const blocks = [{ type: 'text', bgColor: '#ff0000' }, { type: 'music', bgColor: '#3a1d18', textColor: '#ffddcc' }];
  const { bg, text } = surfaceColors(surfaceBlock(blocks, 'music'), theme);

  assert.equal(bg, '#3a1d18');
  assert.equal(text, '#ffddcc');
});

test('with no music block, it is the background the theme would give the mode', () => {
  const { bg } = surfaceColors(surfaceBlock([{ type: 'text' }], 'music'), theme);
  assert.equal(bg, theme.innerBg, 'not black, and not the colour behind everything');
});

test('with the blocks following the theme, that is the theme’s colour anyway', () => {
  // The switch paints the theme's colour into the block, so the block reports
  // it. There is no second branch for the checkbox, and this is the test that
  // says why.
  const themed = { type: 'music', bgColor: theme.innerBg, _themedBgColor: theme.innerBg };
  assert.equal(surfaceColors(themed, theme).bg, theme.innerBg);
});

test('a colour somebody picked is not overruled by the theme', () => {
  const picked = { type: 'music', bgColor: '#2b0b3a' };
  assert.equal(surfaceColors(picked, theme).bg, '#2b0b3a');
});

test('the first block of its kind is the one the mode stands in for', () => {
  const blocks = [
    { type: 'music', id: 'first', bgColor: '#111111' },
    { type: 'music', id: 'second', bgColor: '#222222' }
  ];
  assert.equal(surfaceBlock(blocks, 'music').id, 'first');
});

test('a note mode can ask for either kind of text block', () => {
  const blocks = [{ type: 'image' }, { type: 'cleantext', id: 'note' }];
  assert.equal(surfaceBlock(blocks, ['text', 'cleantext']).id, 'note');
});

test('writing stays readable when the block did not say what colour it is', () => {
  const onWhite = surfaceColors({ type: 'music', bgColor: '#ffffff' }, {});
  const onBlack = surfaceColors({ type: 'music', bgColor: '#000000' }, {});

  assert.notEqual(onWhite.text, onBlack.text);
});

test('with nothing at all it is still a colour, not undefined', () => {
  const { bg, text } = surfaceColors(null, {});
  assert.equal(bg, '#000000');
  assert.ok(text);
  assert.equal(surfaceBlock(), null);
  assert.equal(surfaceBlock([{ type: 'music' }]), null, 'asked for no kind, it picks nothing');
});
