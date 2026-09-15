import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  worthRemembering,
  recalledScroll,
  withScroll,
  withoutFile,
  modeSurfaceKey,
  REMEMBERED_FILES,
  REMEMBERED_SURFACES
} from '../src/utils/scrollMemory.js';

// Named after the request: "when it syncs it shouldn't reset the scrolls that
// you have, and when restarting it should remember the scrolls you were on as a
// per-device thing. Because having to scroll again all the way up after a sync
// or a restart is annoying."

test('where you had read up to comes back', () => {
  const store = withScroll({}, 'Arial', 'note-1', 1384);
  assert.equal(recalledScroll(store, 'Arial', 'note-1'), 1384);
});

test('it is kept per folder, so two folders do not share a position', () => {
  let store = withScroll({}, 'Arial', 'note-1', 900);
  store = withScroll(store, 'Swan', 'note-1', 200);
  assert.equal(recalledScroll(store, 'Arial', 'note-1'), 900);
  assert.equal(recalledScroll(store, 'Swan', 'note-1'), 200);
});

test('a folder never scrolled starts at the top', () => {
  assert.equal(recalledScroll({}, 'Arial', 'note-1'), 0);
  assert.equal(recalledScroll(null, 'Arial', 'note-1'), 0);
  assert.equal(recalledScroll({ Arial: {} }, 'Arial', 'note-1'), 0);
  assert.equal(recalledScroll(), 0);
});

test('a scroll to the top is not written down', () => {
  // The browser reports a scroll to 0 while a scroller is being torn down or
  // made unscrollable. Recording that is how the position gets lost at exactly
  // the moment it matters — which is what happened when this lived on the block.
  assert.equal(worthRemembering(0), null);
  assert.equal(worthRemembering(1), null, 'and near enough to the top is the top');
  assert.equal(worthRemembering(-40), null);
  assert.equal(worthRemembering('nonsense'), null);
  assert.equal(worthRemembering(null), null);
  assert.equal(worthRemembering(undefined), null);
});

test('a fraction of a pixel is not remembered as one', () => {
  // A fractional scrollTop is what made the synced version argue with itself:
  // 1384.177734375 came back from the database as 1384, for ever.
  assert.equal(worthRemembering(1384.177734375), 1384);
});

test('scrolling back to the top forgets rather than keeps a stale number', () => {
  let store = withScroll({}, 'Arial', 'note-1', 900);
  store = withScroll(store, 'Arial', 'note-1', 0);
  assert.equal(recalledScroll(store, 'Arial', 'note-1'), 0);
});

test('nothing is written when nothing would change', () => {
  // Called on every scroll event, and scroll events are not rare.
  const store = withScroll({}, 'Arial', 'note-1', 900);
  assert.equal(withScroll(store, 'Arial', 'note-1', 900), store);
  assert.equal(withScroll(store, 'Arial', 'note-1', 900.4), store, 'nor by a fraction');
});

test('a mode s own scroller is remembered without colliding with a block', () => {
  const key = modeSurfaceKey('default');
  assert.equal(key, 'mode:default');
  let store = withScroll({}, 'Arial', key, 500);
  store = withScroll(store, 'Arial', 'default', 700);
  assert.equal(recalledScroll(store, 'Arial', key), 500);
  assert.equal(recalledScroll(store, 'Arial', 'default'), 700);
  assert.equal(modeSurfaceKey(), 'mode:default');
});

test('only so many folders are remembered, and the oldest goes', () => {
  let store = {};
  for (let i = 1; i <= REMEMBERED_FILES + 4; i += 1) {
    store = withScroll(store, `folder-${i}`, 'note', 100 + i);
  }
  const files = Object.keys(store);
  assert.equal(files.length, REMEMBERED_FILES);
  assert.equal(files.at(-1), `folder-${REMEMBERED_FILES + 4}`, 'the newest is kept');
  assert.equal(recalledScroll(store, 'folder-1', 'note'), 0, 'the oldest is gone');
});

test('one folder cannot fill storage with every note it has', () => {
  let store = {};
  for (let i = 1; i <= REMEMBERED_SURFACES + 10; i += 1) {
    store = withScroll(store, 'Arial', `note-${i}`, 100 + i);
  }
  assert.equal(Object.keys(store.Arial).length, REMEMBERED_SURFACES);
  assert.equal(recalledScroll(store, 'Arial', 'note-1'), 0);
  assert.equal(
    recalledScroll(store, 'Arial', `note-${REMEMBERED_SURFACES + 10}`),
    100 + REMEMBERED_SURFACES + 10
  );
});

test('a folder that is gone takes its positions with it', () => {
  const store = withScroll({}, 'Arial', 'note-1', 900);
  assert.deepEqual(withoutFile(store, 'Arial'), {});
  assert.equal(withoutFile(store, 'Never'), store, 'and one that was never there changes nothing');
  assert.deepEqual(withoutFile(null, 'Arial'), {});
});

test('the store this all came out of is never part of the folder', () => {
  // The point of the whole module: where somebody has read up to is a fact
  // about this device, and a folder arriving from the cloud must not carry
  // another machine's idea of it. Nothing here takes or returns a payload.
  const store = withScroll({}, 'Arial', 'note-1', 900);
  assert.deepEqual(Object.keys(store), ['Arial']);
  assert.deepEqual(Object.keys(store.Arial), ['note-1']);
});
