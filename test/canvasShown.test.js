import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blocksOnCanvas, blocksOffCanvas, canvasChoice, CANVAS_CHOICE } from '../src/utils/canvasShown.js';
import { UNPLACED } from '../src/utils/canvasPlacement.js';

// Asked 2026-11-22, and wanted -- not an accident: "the block in page should
// by default stay as just a page block that shows all the blocks inside in
// canvas mode ... a way to easily make it so that in canvas it shows certains
// by the one you choose ... and if you want to show something that by default
// doesn't show on canvas then you can easily add a block". Decided with a live
// preview of the page (PENDING, "Pages on the Canvas").

const page = { id: 'page', type: 'page', rows: [{ cells: [{ blockId: 'inside', under: [{ blockId: 'under' }] }] }] };
const ids = list => list.map(block => block.id);

test('a block inside a page is not loose on the Canvas: its page block shows it', () => {
  const blocks = [page, { id: 'inside' }, { id: 'under' }, { id: 'loose' }];
  assert.deepEqual(ids(blocksOnCanvas(blocks)), ['page', 'loose']);
  assert.deepEqual(ids(blocksOffCanvas(blocks)), ['inside', 'under']);
});

test('a block chosen for the Canvas shows there, even inside a page', () => {
  const blocks = [page, { id: 'inside', [CANVAS_CHOICE]: true }];
  assert.deepEqual(ids(blocksOnCanvas(blocks)), ['page', 'inside']);
});

test('a block hidden from the Canvas is off it, but still in the folder', () => {
  const blocks = [{ id: 'loose', [CANVAS_CHOICE]: false }];
  assert.deepEqual(blocksOnCanvas(blocks), []);
  assert.deepEqual(ids(blocksOffCanvas(blocks)), ['loose'], 'offered back by From this folder');
});

test('a block shown again is placed clear of the rest, not where it last stood', () => {
  assert.deepEqual(canvasChoice(true), { [CANVAS_CHOICE]: true, [UNPLACED]: true });
  assert.deepEqual(canvasChoice(false), { [CANVAS_CHOICE]: false });
});

test("the folder's own page is the Canvas's level: what is on it stays on the Canvas", () => {
  // modeSettings.page is not a page block; only page blocks hold blocks away.
  assert.deepEqual(ids(blocksOnCanvas([{ id: 'home-text' }])), ['home-text']);
});
