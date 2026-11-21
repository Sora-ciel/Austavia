import { test } from 'node:test';
import assert from 'node:assert/strict';

import { editToolsShown } from '../src/utils/pageLayout.js';
import { PAGE_SCROLLBAR_IDLE_MS } from '../src/utils/idleScrollbar.js';

// Both asked 2026-11-21, in Page mode, and wanted -- not accidents:
//   "the options of size on images should show after you changed or touched
//   the image in edit mode. it shouldn't be there just from putting edit
//   mode. because it makes it hard to handle."
//   "the scrollwheel in page mode should disappear after 0.8sec of not
//   scrolling"

test('a picture shows its size options only after it was touched in edit mode, not from turning edit mode on', () => {
  assert.equal(editToolsShown({ editMode: true, touchedId: null, blockId: 'pic' }), false);
  assert.equal(editToolsShown({ editMode: true, touchedId: 'pic', blockId: 'pic' }), true);
});

test('touching another block takes them off the picture; outside edit mode they never show', () => {
  assert.equal(editToolsShown({ editMode: true, touchedId: 'other', blockId: 'pic' }), false);
  assert.equal(editToolsShown({ editMode: false, touchedId: 'pic', blockId: 'pic' }), false);
});

test("page mode's scrollbar goes 0.8 seconds after the scrolling stops", () => {
  assert.equal(PAGE_SCROLLBAR_IDLE_MS, 800);
});
