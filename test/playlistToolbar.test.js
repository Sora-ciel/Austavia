import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAYLIST_ACTIONS,
  ALWAYS_MENU,
  COMPACT_WIDTH,
  isCompactToolbar,
  toolbarLayout
} from '../src/utils/playlistToolbar.js';

// Named after what was asked for, not after how it is built. The request was
// "the UI for mobile because there's too much button taking too much space",
// with the playlist names not to create a scroll. If one of these is red, that
// is the behaviour going — it is not an implementation detail.

test('on a phone the toolbar keeps four buttons, not nine', () => {
  const { bar } = toolbarLayout({ compact: true });
  assert.deepEqual(bar, ['add', 'play', 'shuffle', 'select']);
});

test('a wide screen keeps everything else on the bar', () => {
  const { bar, strip } = toolbarLayout({ compact: false });
  assert.deepEqual(bar, ['add', 'newPlaylist', 'play', 'shuffle', 'select', 'scan', 'export', 'import']);
  assert.deepEqual(strip, []);
});

test('housekeeping is behind one button however much room there is', () => {
  assert.deepEqual(toolbarLayout({ compact: false }).menu, ALWAYS_MENU);
  for (const id of ALWAYS_MENU) {
    assert.ok(
      toolbarLayout({ compact: true }).menu.includes(id),
      `${id} is done once in a while and never in a hurry`
    );
  }
});

test('making a playlist moves next to the playlists, not into the menu', () => {
  const { strip, menu, bar } = toolbarLayout({ compact: true });
  assert.deepEqual(strip, ['newPlaylist']);
  assert.ok(!menu.includes('newPlaylist'));
  assert.ok(!bar.includes('newPlaylist'));
});

test('nothing the toolbar hides is lost — every action is somewhere', () => {
  for (const compact of [false, true]) {
    const { bar, strip, menu } = toolbarLayout({ compact });
    const placed = [...bar, ...strip, ...menu];
    assert.deepEqual(
      [...placed].sort(),
      [...PLAYLIST_ACTIONS].sort(),
      `${compact ? 'compact' : 'wide'} layout must place every action`
    );
    assert.equal(placed.length, new Set(placed).size, 'and place it only once');
  }
});

test('a phone is compact and a desktop window is not', () => {
  assert.equal(isCompactToolbar({ width: 375 }), true);
  assert.equal(isCompactToolbar({ width: COMPACT_WIDTH }), true);
  assert.equal(isCompactToolbar({ width: COMPACT_WIDTH + 1 }), false);
  assert.equal(isCompactToolbar({ width: 1440 }), false);
});

test('asked about a width it cannot read, it does not collapse the toolbar', () => {
  assert.equal(isCompactToolbar(), false);
  assert.equal(isCompactToolbar({}), false);
  assert.equal(isCompactToolbar({ width: null }), false);
});
