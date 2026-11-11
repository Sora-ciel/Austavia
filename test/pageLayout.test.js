import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePageRows, normalizePageSettings, blocksOnPage, blocksOffPage,
  tidyPage, putOnPage, takeOffPage, placeOnPage, samePage, clickBelow, clickWrites, dropSide, blockPickName
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

// Asked 2026-11-10: "if i change for the blocks to be a certain way in phone,
// it won't change it for pc too."
import { rowsFor, editPage, stacked, isNarrow, samePageLayouts, setCellWidth } from '../src/utils/pageLayout.js';

test('a phone shows the computer\'s rows one block under another until it has a layout of its own', () => {
  const page = { rows: rowsOf(['a', 'b'], ['c']) };
  assert.deepEqual(shape(rowsFor(page, true)), ['a', 'b', 'c']);
  assert.deepEqual(shape(rowsFor(page, false)), ['a+b', 'c']);
  assert.deepEqual(shape(stacked(page.rows)), ['a', 'b', 'c']);
});

test('moving a block on a phone changes the phone\'s layout and not the computer\'s', () => {
  const page = { rows: rowsOf(['a', 'b'], ['c']) };
  const moved = editPage(page, { narrow: true, op: rows => placeOnPage(rows, 'c', { targetId: 'a', side: 'above' }) });
  assert.deepEqual(shape(rowsFor(moved, true)), ['c', 'a', 'b']);
  assert.deepEqual(shape(rowsFor(moved, false)), ['a+b', 'c']);
});

test('moving a block on a computer leaves a phone\'s own layout alone', () => {
  const page = { rows: rowsOf(['a'], ['b']), narrowRows: rowsOf(['b'], ['a']) };
  const moved = editPage(page, { narrow: false, op: rows => placeOnPage(rows, 'b', { targetId: 'a', side: 'right' }) });
  assert.deepEqual(shape(rowsFor(moved, false)), ['a+b']);
  assert.deepEqual(shape(rowsFor(moved, true)), ['b', 'a']);
});

test('putting a block on a page, or taking it off, shows on both', () => {
  const page = { rows: rowsOf(['a']), narrowRows: rowsOf(['a']) };
  const put = editPage(page, { content: true, op: rows => putOnPage(rows, 'b') });
  assert.deepEqual(shape(rowsFor(put, false)), ['a', 'b']);
  assert.deepEqual(shape(rowsFor(put, true)), ['a', 'b']);
  const off = editPage(put, { content: true, op: rows => takeOffPage(rows, 'a') });
  assert.deepEqual(shape(rowsFor(off, true)), ['b']);
  assert.equal(samePageLayouts(off, off), true);
  assert.equal(samePageLayouts(page, put), false);
});

test('a phone is up to 700px wide', () => {
  assert.equal(isNarrow(390), true);
  assert.equal(isNarrow(1280), false);
});

test('the phone\'s layout is kept by the mode settings', () => {
  const settings = normalizeModeSettings({ page: { rows: rowsOf(['a']), narrowRows: rowsOf(['a']) } });
  assert.deepEqual(shape(settings.page.narrowRows), ['a']);
  assert.equal('narrowRows' in normalizeModeSettings({ page: { rows: [] } }).page, false);
});

// Asked 2026-11-10: "if i want to put a block just after the end of another
// block when they are both on the right side of another longer block, it
// should be possible ... i want to have those three solutions."
test('next to a block beside a longer one, a block can go beside it, below the whole row, or under it in its column', () => {
  const page = rowsOf(['long', 'b']);
  const cols = rows => blocksOnPage(rows, [{ id: 'long' }, { id: 'b' }, { id: 'c' }, { id: 'd' }])
    .map(row => row.columns.map(col => col.blocks.map(b => b.id).join('/')).join('+'));
  assert.deepEqual(cols(placeOnPage(page, 'c', { targetId: 'b', side: 'right' })), ['long+b+c']);
  assert.deepEqual(cols(placeOnPage(page, 'c', { targetId: 'b', side: 'below' })), ['long+b', 'c']);
  const stackedUnder = placeOnPage(page, 'c', { targetId: 'b', side: 'under' });
  assert.deepEqual(cols(stackedUnder), ['long+b/c']);
  assert.deepEqual(cols(placeOnPage(stackedUnder, 'd', { targetId: 'c', side: 'over' })), ['long+b/d/c']);
});

test('a column\'s blocks come and go as any block does', () => {
  const page = [{ cells: [{ blockId: 'long' }, { blockId: 'b', under: [{ blockId: 'c' }], width: 0.3 }] }];
  assert.deepEqual(takeOffPage(page, 'b')[0].cells[1], { blockId: 'c', width: 0.3 });
  assert.deepEqual(blocksOffPage(page, [{ id: 'long' }, { id: 'b' }, { id: 'c' }, { id: 'x' }]).map(b => b.id), ['x']);
  assert.deepEqual(shape(stacked(page)), ['long', 'b', 'c']);
  assert.deepEqual(setCellWidth(page, 'c', 0.5)[0].cells[1].width, 0.5);
  const moved = placeOnPage(page, 'c', { targetId: 'long', side: 'below' });
  assert.deepEqual(moved.map(r => r.cells.map(c => [c.blockId, ...(c.under || []).map(u => u.blockId)].join('/')).join('+')), ['long+b', 'c']);
});

test('an older build reads the column\'s top block, and keeps the rest as a field it does not know', () => {
  const page = [{ cells: [{ blockId: 'b', under: [{ blockId: 'c', newer: 1 }] }] }];
  assert.deepEqual(normalizePageRows(page), page);
});

// Asked 2026-11-10: a crop and a nest's tile size per layout, "following the
// same rule as block moving"; and the title movable like a block.
import { setPlaceField, placesById, withTitle, TITLE_ID } from '../src/utils/pageLayout.js';

test('a picture is cropped on a phone without changing the computer\'s crop', () => {
  const page = { rows: rowsOf(['img', 't']) };
  const phone = editPage(page, { narrow: true, op: r => setPlaceField(r, 'img', 'crop', { x: 0, y: 0, w: 0.5, h: 1 }) });
  assert.deepEqual(placesById(rowsFor(phone, true)).get('img').crop, { x: 0, y: 0, w: 0.5, h: 1 });
  assert.equal(placesById(rowsFor(phone, false)).get('img').crop, undefined);
  const cleared = setPlaceField(rowsFor(phone, true), 'img', 'crop', null);
  assert.equal(placesById(cleared).get('img').crop, undefined);
});

test('a place\'s own fields go with it when it moves, inside a column too', () => {
  let rows = setPlaceField(rowsOf(['a', 'b']), 'b', 'tile', 220);
  rows = placeOnPage(rows, 'b', { targetId: 'a', side: 'under' });
  assert.equal(placesById(rows).get('b').tile, 220);
});

test('the title is first until it is moved, and then stays where it was put', () => {
  const rows = rowsOf(['a'], ['b']);
  assert.deepEqual(shape(withTitle(rows)), [TITLE_ID, 'a', 'b']);
  const moved = placeOnPage(withTitle(rows), TITLE_ID, { targetId: 'a', side: 'below' });
  assert.deepEqual(shape(withTitle(moved)), ['a', TITLE_ID, 'b']);
  assert.deepEqual(shape(tidyPage(moved, [{ id: 'a' }, { id: 'b' }])), ['a', TITLE_ID, 'b'], 'not tidied away as a missing block');
});

// Reported 2026-11-11: selecting writing and dragging past the block made the
// page jump, not following the selection -- the release on the empty page
// reached it as a click, and a click there writes.
test('selecting past a block does not write on the page; only a plain click on the empty page does', () => {
  assert.equal(clickWrites({ pressOnPage: true, moved: 0 }), true, 'a click on the empty page writes');
  assert.equal(clickWrites({ pressOnPage: false, moved: 200 }), false, 'a selection dragged out of a block');
  assert.equal(clickWrites({ pressOnPage: false, moved: 0 }), false, 'pressed in a block, let go on the page');
  assert.equal(clickWrites({ pressOnPage: true, moved: 40 }), false, 'a drag on the page');
});

// Reported 2026-11-11: "when moving things around etc. it seems that it
// creates easily text blocks. all the time."
test('a click beside a row or between two writes nothing; only a click below everything does', () => {
  assert.equal(clickWrites({ pressOnPage: true, moved: 0, below: false }), false);
  assert.equal(clickWrites({ pressOnPage: true, moved: 0, below: true }), true);
});

// Asked 2026-11-11: "make it easier to add an image or delete an image or
// block without having to go to edit mode, using for example a pop-up that
// comes after a long press" -- and a picture's size stays edit mode's.
import { pageBlockMenu, PICTURE_SIZES } from '../src/utils/pageLayout.js';

test('a long press on a picture offers to replace, crop, add below and delete it, without edit mode', () => {
  const ids = pageBlockMenu({ type: 'image' }).map(item => item.id);
  for (const id of ['replacePicture', 'crop', 'addPicture', 'addBlock', 'takeOff', 'delete']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.some(id => /size|width/i.test(id)), 'no sizing outside edit mode');
});

test('any other block offers to add a picture or a block below, and to delete it', () => {
  const ids = pageBlockMenu({ type: 'calendar' }).map(item => item.id);
  assert.deepEqual(ids, ['addPicture', 'addBlock', 'takeOff', 'delete']);
});

test('edit mode sizes a picture in one press: a third, half, three quarters, full, or natural', () => {
  assert.deepEqual(PICTURE_SIZES.map(s => s.width), [1 / 3, 0.5, 0.75, 1, null]);
});
