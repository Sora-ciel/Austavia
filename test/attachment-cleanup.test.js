import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MODE_SETTINGS_BLOCK_ID,
  isSafeStorageSegment,
  orphanedAttachmentIds,
  staleWallpaperObjects
} from '../src/utils/attachmentCleanup.js';

describe('isSafeStorageSegment', () => {
  it('accepts an ordinary block id', () => {
    assert.equal(isSafeStorageSegment('block-42'), true);
  });

  // The caller is a delete, and `attachments/${fileId}/${blockId}` with a
  // blank blockId addresses every attachment in the folder.
  it('refuses an empty segment', () => {
    assert.equal(isSafeStorageSegment(''), false);
  });

  it('refuses a segment that would climb out of its prefix', () => {
    assert.equal(isSafeStorageSegment('..'), false);
    assert.equal(isSafeStorageSegment('.'), false);
    assert.equal(isSafeStorageSegment('a/b'), false);
  });

  it('refuses anything that is not a string', () => {
    assert.equal(isSafeStorageSegment(undefined), false);
    assert.equal(isSafeStorageSegment(null), false);
    assert.equal(isSafeStorageSegment(7), false);
  });
});

describe('orphanedAttachmentIds', () => {
  it('finds a folder no live block accounts for', () => {
    assert.deepEqual(
      orphanedAttachmentIds(['b1', 'b2', 'b3'], ['b1', 'b3']),
      ['b2']
    );
  });

  it('finds nothing when every folder is still in use', () => {
    assert.deepEqual(orphanedAttachmentIds(['b1', 'b2'], ['b1', 'b2']), []);
  });

  it('finds nothing in an empty account', () => {
    assert.deepEqual(orphanedAttachmentIds([], []), []);
    assert.deepEqual(orphanedAttachmentIds(undefined, undefined), []);
  });

  // Single Note backgrounds live in modeSettings, not on a block, so nothing
  // in `blocks` ever mentions them. Without the exemption they look orphaned
  // on every save and the background quietly disappears.
  it('never treats the mode-settings folder as an orphan', () => {
    assert.deepEqual(
      orphanedAttachmentIds([MODE_SETTINGS_BLOCK_ID, 'b1'], []),
      ['b1']
    );
  });

  it('keeps every block that is still present, even with none deleted', () => {
    const ids = ['b1', 'b2', 'b3'];
    assert.deepEqual(orphanedAttachmentIds(ids, ids), []);
  });

  // A stray folder with an unusable name is left alone rather than guessed at:
  // it cannot be addressed safely, and the alternative to skipping it is a
  // delete aimed at the wrong path.
  it('leaves a folder it could not address safely alone', () => {
    assert.deepEqual(orphanedAttachmentIds(['', '..', 'b9'], []), ['b9']);
  });

  it('copes with block ids that are numbers', () => {
    assert.deepEqual(orphanedAttachmentIds(['1', '2'], [1]), ['2']);
  });

  // The case that matters most: everything is gone from the note, so
  // everything but the background should go from storage.
  it('clears out a note whose blocks were all deleted', () => {
    assert.deepEqual(
      orphanedAttachmentIds(['b1', 'b2', MODE_SETTINGS_BLOCK_ID], []),
      ['b1', 'b2']
    );
  });
});

// Asked for on 2026-09-27: "make it so that the background that was used only
// on Single Note mode is actually deleted." Its setting leaving the folder was
// not enough -- the picture stayed in storage, under a folder the block sweep
// keeps whole, and so did every wallpaper ever chosen.
describe('staleWallpaperObjects', () => {
  const hashOf = value => `h${value.length}`;
  const root = 'users/u/attachments/f/mode-settings';
  const object = (field, name) => ({ field, name, fullPath: `${root}/${field}/${name}` });

  it('keeps the wallpaper this device chose, by the name its upload was given', () => {
    const current = { backgroundImage: 'data:abc' };
    const kept = object('backgroundImage', `${hashOf('data:abc')}.png`);
    assert.deepEqual(staleWallpaperObjects([kept], current, hashOf), []);
  });

  it('keeps the wallpaper another device chose, by the path in its link', () => {
    const kept = object('backgroundImage', 'h9.jpg');
    const current = { backgroundImage: `https://x/o/${encodeURIComponent(kept.fullPath)}?alt=media` };
    assert.deepEqual(staleWallpaperObjects([kept], current, hashOf), []);
  });

  it('removes a wallpaper that was replaced, and one that was removed', () => {
    const old = object('backgroundImage', 'h1.png');
    const oldPhone = object('backgroundImageMobile', 'h2.png');
    const current = { backgroundImage: 'data:new-one' };
    assert.deepEqual(staleWallpaperObjects([old, oldPhone], current, hashOf), [old, oldPhone]);
  });

  // The Single Note wallpaper was uploaded to the same fields, so once the
  // folder only holds Canvas's, it is simply one that is not in use.
  it("removes the old Single Note wallpaper once only Canvas's is kept", () => {
    const singleNotes = object('backgroundImage', 'h77.jpg');
    const canvas = object('backgroundImage', `${hashOf('data:canvas')}.png`);
    const stale = staleWallpaperObjects([singleNotes, canvas], { backgroundImage: 'data:canvas' }, hashOf);
    assert.deepEqual(stale, [singleNotes]);
  });

  it('leaves alone anything under a field it does not know', () => {
    assert.deepEqual(staleWallpaperObjects([object('somethingElse', 'x.png')], {}, hashOf), []);
  });
});
