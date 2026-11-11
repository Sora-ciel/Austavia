import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCrop, croppedAspect, movedCrop, resizedCrop, widthFromDrag } from '../src/utils/crop.js';
import { setCellWidth } from '../src/utils/pageLayout.js';

// Asked 2026-11-10: "an edit mode for that mode. where you can change the
// images size even crop it."

test('a crop keeps part of the picture, and the whole picture is no crop at all', () => {
  assert.deepEqual(normalizeCrop({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 }), { x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
  assert.equal(normalizeCrop({ x: 0, y: 0, w: 1, h: 1 }), null);
  assert.equal(normalizeCrop(null), null);
  assert.deepEqual(normalizeCrop({ x: 0.9, y: 0, w: 0.5, h: 1 }), { x: 0.9, y: 0, w: 0.09999999999999998, h: 1 });
});

test('a cropped picture takes the shape of what is kept', () => {
  assert.equal(croppedAspect(2, { x: 0, y: 0, w: 0.5, h: 1 }), 1);
  assert.equal(croppedAspect(2, null), 2);
});

test('the crop moves and stretches without leaving the picture or vanishing', () => {
  assert.deepEqual(movedCrop({ x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, 0.5, -1), { x: 0.6, y: 0, w: 0.4, h: 0.4 });
  const r = resizedCrop({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 }, 'se', 0.5, -0.9);
  assert.equal(r.x, 0.2);
  assert.equal(r.x + r.w, 1);
  assert.ok(r.h > 0.049);
});

test('a picture on a page is sized as a share of its row, and that size is kept on its cell', () => {
  assert.equal(widthFromDrag({ rowLeft: 0, rowWidth: 1000, cellLeft: 0, x: 400 }), 0.4);
  assert.equal(widthFromDrag({ rowLeft: 0, rowWidth: 1000, cellLeft: 0, x: 20 }), 0.15);
  const rows = [{ cells: [{ blockId: 'img' }, { blockId: 't' }] }];
  assert.deepEqual(setCellWidth(rows, 'img', 0.4)[0].cells[0], { blockId: 'img', width: 0.4 });
  assert.deepEqual(setCellWidth(rows, 'img', null)[0].cells[0], { blockId: 'img' });
});

// Reported 2026-11-11: opening the crop on a picture showed it cropped
// already, and after Reset it still looked cropped a bit.
import { startFrame } from '../src/utils/crop.js';

test('a picture with no crop opens in the crop editor with the frame round the whole of it', () => {
  assert.deepEqual(startFrame(null), { x: 0, y: 0, w: 1, h: 1 });
  assert.deepEqual(startFrame({ x: 0.2, y: 0.1, w: 0.5, h: 0.5 }), { x: 0.2, y: 0.1, w: 0.5, h: 0.5 });
});

test('Reset gives back the whole picture, which is saved as no crop at all', () => {
  assert.equal(normalizeCrop(startFrame(null)), null);
});
