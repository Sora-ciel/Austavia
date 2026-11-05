import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePageEntries, normalizePageSettings, blocksOnPage, blocksOffPage,
  tidyPage, putOnPage, takeOffPage, swapOnPage, samePage, blockPickName
} from '../src/utils/pageEntries.js';
import { normalizeModeSettings } from '../src/utils/modeSettings.js';

// Page mode, settled 2026-10-27 and started 2026-11-04 (PENDING, "Page mode,
// and nests"): "it doesn't show all blocks from the get go, but you can add
// blocks that already exist in the folder ... and then you should be able to
// see if you create a new one or show one that exists already."

const blocks = [{ id: 'a', type: 'text' }, { id: 'b', type: 'clock' }, { id: 'c', type: 'task', title: 'Courses' }];
const ids = list => list.map(item => item.id ?? item.blockId);

test('a page shows only the blocks put on it, in its own order', () => {
  const entries = [{ blockId: 'c' }, { blockId: 'a' }];
  assert.deepEqual(ids(blocksOnPage(entries, blocks)), ['c', 'a']);
});

test('the blocks offered as existing are the ones not on the page yet', () => {
  assert.deepEqual(ids(blocksOffPage([{ blockId: 'a' }], blocks)), ['b', 'c']);
});

test('a block put on a page goes after the one asked, or at the end, and only once', () => {
  let page = putOnPage([], 'a');
  page = putOnPage(page, 'c');
  page = putOnPage(page, 'b', { afterId: 'a' });
  assert.deepEqual(ids(page), ['a', 'b', 'c']);
  assert.deepEqual(ids(putOnPage(page, 'a')), ['a', 'b', 'c']);
});

test('taking a block off a page leaves the block itself alone', () => {
  const page = takeOffPage([{ blockId: 'a' }, { blockId: 'b' }], 'a');
  assert.deepEqual(ids(page), ['b']);
  assert.equal(blocks.length, 3);
});

test('moving a card trades the two places, as in Simple Note', () => {
  assert.deepEqual(ids(swapOnPage([{ blockId: 'a' }, { blockId: 'b' }, { blockId: 'c' }], 'a', 'c')), ['c', 'b', 'a']);
});

test('a deleted block is not shown, and stays listed until the page is changed, so Undo finds its place', () => {
  const entries = [{ blockId: 'gone' }, { blockId: 'a' }];
  assert.deepEqual(ids(blocksOnPage(entries, blocks)), ['a']);
  assert.deepEqual(ids(tidyPage(entries, blocks)), ['a']);
  assert.deepEqual(ids(putOnPage(entries, 'b', { blocks })), ['a', 'b']);
});

test('an entry from a newer build -- a block of another folder -- is kept, in its place, and not shown', () => {
  const entries = [{ blockId: 'x', folderId: 'other' }, { blockId: 'a', note: 'newer' }];
  const kept = normalizePageEntries(entries);
  assert.deepEqual(kept, [{ blockId: 'x', folderId: 'other' }, { blockId: 'a', note: 'newer' }]);
  assert.deepEqual(ids(blocksOnPage(kept, blocks)), ['a']);
  assert.deepEqual(ids(tidyPage(kept, blocks)), ['x', 'a']);
  assert.deepEqual(normalizePageSettings({ entries, layout: 'wide' }).layout, 'wide');
});

test('the page syncs with the folder: it is in the mode settings and survives a round trip', () => {
  const settings = normalizeModeSettings({ page: { entries: [{ blockId: 'a' }, { blockId: 'a' }, 'junk'] } });
  assert.deepEqual(settings.page.entries, [{ blockId: 'a' }]);
  assert.deepEqual(normalizeModeSettings(settings).page, settings.page);
  assert.deepEqual(normalizeModeSettings({}).page, { entries: [] });
});

test('an unchanged page is seen as unchanged', () => {
  assert.equal(samePage([{ blockId: 'a' }], [{ blockId: 'a' }]), true);
  assert.equal(samePage([{ blockId: 'a' }], [{ blockId: 'b' }]), false);
});

test('an existing block is offered under its title or first line', () => {
  assert.equal(blockPickName({ type: 'task', title: 'Courses' }), 'Courses');
  assert.equal(blockPickName({ type: 'text', content: '\n  Accueil \nsecond' }), 'Accueil');
  assert.equal(blockPickName({ type: 'text', content: '' }), 'Empty text');
});
