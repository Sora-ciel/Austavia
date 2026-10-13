import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  themeKey,
  needsFullRepaint,
  needsPaint,
  paintAll,
  paintStale,
  unpaintAll
} from '../src/utils/themePainting.js';

const THEME = { bgColor: '#101014', textColor: '#ffffff' };
const OTHER = { bgColor: '#f8efe3', textColor: '#4a3725' };

const block = (over = {}) => ({
  id: 'b1',
  bgColor: '#000000',
  textColor: '#ffffff',
  ...over
});

test('the theme is compared by its colours, not by the object holding them', () => {
  assert.equal(themeKey({ ...THEME }), themeKey({ ...THEME }));
  assert.notEqual(themeKey(THEME), themeKey(OTHER));
});

test('turning the switch on repaints, because nothing has been painted yet', () => {
  assert.equal(needsFullRepaint(null, THEME), true);
});

test('the same theme twice does not repaint', () => {
  assert.equal(needsFullRepaint(themeKey(THEME), { ...THEME }), false);
});

test('a theme whose colours moved repaints', () => {
  assert.equal(needsFullRepaint(themeKey(THEME), OTHER), true);
});

test('painting records both what was there before and what was put on', () => {
  const [out] = paintAll([block()], THEME);
  assert.equal(out.bgColor, THEME.bgColor);
  assert.equal(out.textColor, THEME.textColor);
  assert.equal(out._baseBgColor, '#000000', 'so the switch can be turned off');
  assert.equal(out._baseTextColor, '#ffffff');
  assert.equal(out._themedBgColor, THEME.bgColor, 'so paint can be told from a choice');
  assert.equal(out._themedTextColor, THEME.textColor);
});

test('painting an already-painted block again changes nothing at all', () => {
  const once = paintAll([block()], THEME);
  assert.equal(paintAll(once, THEME), once, 'the same array back: no history entry');
});

test('the original colour is never overwritten by a second theme', () => {
  const once = paintAll([block()], THEME);
  const [out] = paintAll(once, OTHER);
  assert.equal(out.bgColor, OTHER.bgColor);
  assert.equal(out._baseBgColor, '#000000');
  assert.equal(out._themedBgColor, OTHER.bgColor, 'the stamp follows the new theme');
});

// This used to be the opposite -- "painting bumps the version, so a block that
// caches its colours redraws". Changed on purpose on 2026-10-05: a rebuild made
// text blocks with pictures jump on every theme change, so blocks now follow
// their colours live (test/block-versions.test.js checks they do) and a
// repaint leaves the version alone.
test('painting does not rebuild a block -- its colours are followed live', () => {
  const [out] = paintAll([block({ _version: 3 })], THEME);
  assert.equal(out._version, 3);
});

// ── the pass that runs when the blocks change ─────────────────────

// The colour picker bug: a hand-picked colour must survive a block change.
test('a colour the user picked is left alone', () => {
  const [afterPaint] = paintAll([block()], THEME);
  const hand = { ...afterPaint, bgColor: '#cc2929' };
  const blocks = [hand];

  const next = paintStale(blocks, THEME);

  assert.equal(next, blocks, 'nothing should have been rewritten');
  assert.equal(next[0].bgColor, '#cc2929', 'the picked colour must survive');
});

// The folder bug: opening a folder painted under another theme must repaint.
test('a folder painted under another theme is brought to this one', () => {
  const [fromOtherFolder] = paintAll([block()], OTHER);
  assert.equal(fromOtherFolder.bgColor, OTHER.bgColor);

  const [out] = paintStale([fromOtherFolder], THEME);

  assert.equal(out.bgColor, THEME.bgColor, 'it must follow the theme now in force');
  assert.equal(out._themedBgColor, THEME.bgColor);
  assert.equal(out._baseBgColor, '#000000', 'and still remember its own colour');
});

test('a block already wearing this theme is not touched when blocks change', () => {
  const painted = paintAll([block()], THEME);
  assert.equal(paintStale(painted, THEME), painted);
});

test('a block that has never been painted joins the theme', () => {
  const fresh = block({ id: 'new', bgColor: '#123456' });
  const [out] = paintStale([fresh], THEME);
  assert.equal(out.bgColor, THEME.bgColor);
  assert.equal(out._baseBgColor, '#123456');
});

test('a new block is caught without disturbing the ones beside it', () => {
  const [old] = paintAll([block({ id: 'old' })], THEME);
  const hand = { ...old, bgColor: '#cc2929' };
  const fresh = block({ id: 'new', bgColor: '#123456' });

  const next = paintStale([hand, fresh], THEME);

  assert.equal(next[0].bgColor, '#cc2929');
  assert.equal(next[1].bgColor, THEME.bgColor);
});

test('a block from a build with no paint record is painted once, then exact', () => {
  // painted by an older build: it stashed the original but recorded no paint
  const legacy = { ...block(), _baseBgColor: '#222222', bgColor: OTHER.bgColor, textColor: OTHER.textColor };
  assert.equal(needsPaint(legacy, THEME), true);

  const [out] = paintStale([legacy], THEME);
  assert.equal(out.bgColor, THEME.bgColor);
  assert.equal(out._baseBgColor, '#222222', 'the older stash is kept, not overwritten');

  // now it carries a record, so a hand change on it is respected
  const hand = { ...out, bgColor: '#cc2929' };
  assert.equal(needsPaint(hand, THEME), false);
});

test('the pass settles: running it twice is the same as running it once', () => {
  const blocks = [block({ id: 'a' }), block({ id: 'b', bgColor: '#123456' })];
  const once = paintStale(blocks, THEME);
  assert.equal(paintStale(once, THEME), once, 'no second rewrite, so no loop');
});

test('nothing throws on an empty or missing block list', () => {
  assert.deepEqual(paintStale([], THEME), []);
  assert.deepEqual(paintAll([], THEME), []);
  // untouched means the caller gets back exactly what it passed, so the
  // `next === blocks` check at the call site still skips the write
  assert.equal(paintStale(null, THEME), null);
  assert.equal(paintAll(undefined, THEME), undefined);
});

// Asked for 2026-10-12: "when removing all folders wide themes, the blocks
// don't go back to their chosen colors." Turning the switch off only ever
// restored the open folder; a folder saved painted opened painted for good.
// unpaintAll is what runs whenever the blocks change with the switch off.

const OWN = { bgColor: '#ff0000', textColor: '#ffffff' };

test('a folder saved painted goes back to its own colours when opened with the switch off', () => {
  const savedPainted = paintAll([{ id: 'a', ...OWN }], THEME);
  const [block] = unpaintAll(savedPainted);
  assert.equal(block.bgColor, OWN.bgColor);
  assert.equal(block.textColor, OWN.textColor);
});

test('it comes back plain, with no record of having been painted', () => {
  const [block] = unpaintAll(paintAll([{ id: 'a', ...OWN }], THEME));
  for (const key of ['_baseBgColor', '_baseTextColor', '_themedBgColor', '_themedTextColor']) {
    assert.equal(block[key], undefined, key);
  }
});

test('a colour picked while the theme was on is the user\'s, and stays', () => {
  const [painted] = paintAll([{ id: 'a', ...OWN }], THEME);
  const picked = { ...painted, bgColor: '#00ff00' };
  const [block] = unpaintAll([picked]);
  assert.equal(block.bgColor, '#00ff00');
  assert.equal(block._baseBgColor, undefined);
});

test('a block painted by an older build, with no record of the paint, is put back as before', () => {
  const legacy = { id: 'a', bgColor: THEME.bgColor, textColor: THEME.textColor, _baseBgColor: '#ff0000', _baseTextColor: '#ffffff' };
  const [block] = unpaintAll([legacy]);
  assert.equal(block.bgColor, '#ff0000');
});

test('a folder that was never painted is left exactly as it is', () => {
  const blocks = [{ id: 'a', ...OWN }];
  assert.equal(unpaintAll(blocks), blocks);
});
