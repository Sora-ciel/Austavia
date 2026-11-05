import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePageRows, normalizePageSettings, blocksOnPage, blocksOffPage,
  tidyPage, putOnPage, takeOffPage, placeOnPage, samePage, clickBelow, dropSide, blockPickName
} from '../src/utils/pageLayout.js';
import { normalizeModeSettings } from '../src/utils/modeSettings.js';

// Page mode, settled 2026-10-27 (PENDING, "Page mode, and nests"): "it
// doesn't show all blocks from the get go, but you can add blocks that
// already exist in the folder ... and then you should be able to see if you
// create a new one or show one that exists already."
//
// Redirected 2026-11-04: "the page wherever you click, it's basically a line
// and you can directly write something ... on one line or multiple lines we
// can have multiple blocks sharing the width etc."

const blocks = [{ id: 'a', type: 'text' }, { id: 'b', type: 'clock' }, { id: 'c', type: 'task', title: 'Courses' }];
const rowsOf = (...rows) => rows.map(ids => ({ cells: ids.map(blockId => ({ blockId })) }));
const shape = rows => rows.map(row => row.cells.map(cell => cell.blockId).join('+'));
const shown = rows => blocksOnPage(rows, blocks).map(row => row.blocks.map(b => b.id).join('+'));

test('a page shows only the blocks put on it, row by row, in its own order', () => {
  assert.deepEqual(shown(rowsOf(['c'], ['a'])), ['c', 'a']);
});

test('several blocks can share a row, side by side', () => {
  assert.deepEqual(shown(rowsOf(['a', 'b'], ['c'])), ['a+b', 'c']);
});

test('the blocks offered as existing are the ones not on the page yet', () => {
  assert.deepEqual(blocksOffPage(rowsOf(['a', 'c']), blocks).map(b => b.id), ['b']);
});

test('a block put on a page gets a row of its own, after the one asked or at the end, and only once', () => {
  let page = putOnPage([], 'a');
  page = putOnPage(page, 'c');
  page = putOnPage(page, 'b', { afterId: 'a' });
  assert.deepEqual(shape(page), ['a', 'b', 'c']);
  assert.deepEqual(shape(putOnPage(page, 'a')), ['a', 'b', 'c']);
});

test('dropped on the side of a block, a block goes beside it; above or below, on a row of its own', () => {
  const page = rowsOf(['a'], ['b'], ['c']);
  assert.deepEqual(shape(placeOnPage(page, 'c', { targetId: 'a', side: 'right' })), ['a+c', 'b']);
  assert.deepEqual(shape(placeOnPage(page, 'c', { targetId: 'a', side: 'left' })), ['c+a', 'b']);
  assert.deepEqual(shape(placeOnPage(page, 'c', { targetId: 'a', side: 'above' })), ['c', 'a', 'b']);
  assert.deepEqual(shape(placeOnPage(rowsOf(['a', 'b'], ['c']), 'b', { targetId: 'c', side: 'below' })), ['a', 'c', 'b']);
});

test('taking a block off a page leaves the block itself alone, and a row left empty goes', () => {
  assert.deepEqual(shape(takeOffPage(rowsOf(['a'], ['b', 'c']), 'a')), ['b+c']);
  assert.equal(blocks.length, 3);
});

test('a deleted block is not shown, and stays listed until the page is changed, so Undo finds its place', () => {
  const rows = rowsOf(['gone', 'a']);
  assert.deepEqual(shown(rows), ['a']);
  assert.deepEqual(shape(tidyPage(rows, blocks)), ['a']);
  assert.deepEqual(shape(putOnPage(rows, 'b', { blocks })), ['a', 'b']);
});

test('a click below everything writes: into the writing the page ends with, or a new text block', () => {
  assert.deepEqual(clickBelow(blocksOnPage(rowsOf(['c'], ['a']), blocks)), { focus: 'a' });
  assert.deepEqual(clickBelow(blocksOnPage(rowsOf(['a'], ['c']), blocks)), { add: 'text' });
  assert.deepEqual(clickBelow(blocksOnPage(rowsOf(['a', 'b']), blocks)), { add: 'text' });
  assert.deepEqual(clickBelow([]), { add: 'text' });
});

test('dropping near the left or right edge of a block is beside it; elsewhere is above or below', () => {
  const box = { left: 0, right: 400, top: 0, bottom: 100 };
  assert.equal(dropSide({ ...box, x: 50, y: 50 }), 'left');
  assert.equal(dropSide({ ...box, x: 380, y: 50 }), 'right');
  assert.equal(dropSide({ ...box, x: 200, y: 10 }), 'above');
  assert.equal(dropSide({ ...box, x: 200, y: 90 }), 'below');
});

test('rows and cells from a newer build -- another folder\'s block, fields not known -- are kept in place, and not shown', () => {
  const rows = [{ cells: [{ blockId: 'x', folderId: 'other' }, { blockId: 'a', width: 0.3 }], gap: 2 }];
  const kept = normalizePageRows(rows);
  assert.deepEqual(kept, rows);
  assert.deepEqual(shown(kept), ['a']);
  assert.deepEqual(shape(tidyPage(kept, blocks)), ['x+a']);
  assert.equal(normalizePageSettings({ rows, layout: 'wide' }).layout, 'wide');
});

test('the page syncs with the folder: it is in the mode settings and survives a round trip', () => {
  const settings = normalizeModeSettings({ page: { rows: [{ cells: [{ blockId: 'a' }, { blockId: 'a' }, 'junk'] }, { cells: [] }] } });
  assert.deepEqual(settings.page.rows, [{ cells: [{ blockId: 'a' }] }]);
  assert.deepEqual(normalizeModeSettings(settings).page, settings.page);
  assert.deepEqual(normalizeModeSettings({}).page, { rows: [] });
});

test('an unchanged page is seen as unchanged', () => {
  assert.equal(samePage(rowsOf(['a']), rowsOf(['a'])), true);
  assert.equal(samePage(rowsOf(['a', 'b']), rowsOf(['a'], ['b'])), false);
});

test('an existing block is offered under its title or first line', () => {
  assert.equal(blockPickName({ type: 'task', title: 'Courses' }), 'Courses');
  assert.equal(blockPickName({ type: 'text', content: '\n  Accueil \nsecond' }), 'Accueil');
  assert.equal(blockPickName({ type: 'text', content: '' }), 'Empty text');
});
