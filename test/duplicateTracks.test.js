import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  sizeGroups,
  clustersFromHashes,
  chooseSurvivor,
  planDeduplication
} from '../src/utils/duplicateTracks.js';

// Named after the request: "if there's one or more copy of a music, like the
// same exact file, then we can remove the clones."

test('one or more copies of the same file leave one', () => {
  const library = {
    tracks: [{ id: 'a', title: 'Song' }, { id: 'b' }, { id: 'c' }],
    playlists: []
  };
  const plan = planDeduplication(library, [['a', 'b', 'c']]);

  assert.equal(plan.tracks.length, 1);
  assert.equal(plan.removedCount, 2);
  assert.ok(!plan.removedIds.includes(plan.tracks[0].id), 'the copy that stays is never deleted');
});

test('the same exact file means the same bytes, not the same length', () => {
  const clusters = clustersFromHashes([
    { id: 'a', size: 4_200_000, hash: 'aaa' },
    { id: 'b', size: 4_200_000, hash: 'bbb' }
  ]);
  assert.deepEqual(clusters, [], 'two different songs that happen to weigh the same are two songs');
});

test('only files that share a length are ever read', () => {
  const groups = sizeGroups([
    { id: 'a', size: 100 },
    { id: 'b', size: 100 },
    { id: 'c', size: 200 }
  ]);
  assert.deepEqual(groups, [['a', 'b']]);
});

test('a library with no repeated length costs nothing to scan', () => {
  assert.deepEqual(sizeGroups([{ id: 'a', size: 1 }, { id: 'b', size: 2 }]), []);
});

test('a file that could not be read is never treated as a duplicate', () => {
  const clusters = clustersFromHashes([
    { id: 'a', size: 10, hash: null },
    { id: 'b', size: 10, hash: null }
  ]);
  assert.deepEqual(clusters, [], 'unreadable is not evidence; deleting on a maybe is the one thing to avoid');
});

test('the copy that knows its title and artist is the one that stays', () => {
  const library = {
    tracks: [
      { id: 'bare' },
      { id: 'tagged', title: 'Song', artist: 'Someone', album: 'Record' }
    ],
    playlists: []
  };
  assert.equal(chooseSurvivor(['bare', 'tagged'], library), 'tagged');

  const plan = planDeduplication(library, [['bare', 'tagged']]);
  assert.deepEqual(plan.removedIds, ['bare']);
});

test('the copy you are listening to is the one that stays', () => {
  const library = {
    tracks: [{ id: 'playing' }, { id: 'tagged', title: 'Song', artist: 'Someone' }],
    playlists: []
  };
  assert.equal(
    chooseSurvivor(['playing', 'tagged'], { ...library, playingId: 'playing' }),
    'playing',
    'a tidy-up that stops the music is a worse trade than a better-labelled copy'
  );

  const plan = planDeduplication(library, [['playing', 'tagged']], { playingId: 'playing' });
  assert.deepEqual(plan.removedIds, ['tagged']);
});

test('with nothing to choose between them, the one added first stays', () => {
  const library = { tracks: [{ id: 'first' }, { id: 'second' }], playlists: [] };
  assert.equal(chooseSurvivor(['second', 'first'], library), 'first');
});

test('a playlist holding a clone keeps the copy that stays, in its place', () => {
  const library = {
    tracks: [{ id: 'keep', title: 'Song' }, { id: 'clone' }],
    playlists: [{ id: 'p', name: 'Mix', trackIds: ['other', 'clone', 'another'] }]
  };
  const plan = planDeduplication(library, [['keep', 'clone']]);

  assert.deepEqual(plan.playlists[0].trackIds, ['other', 'keep', 'another']);
});

test('a playlist that held both copies ends up holding one', () => {
  const library = {
    tracks: [{ id: 'keep', title: 'Song' }, { id: 'clone' }],
    playlists: [{ id: 'p', name: 'Mix', trackIds: ['keep', 'clone'] }]
  };
  const plan = planDeduplication(library, [['keep', 'clone']]);

  assert.deepEqual(plan.playlists[0].trackIds, ['keep']);
});

test('nothing is touched when every file is different', () => {
  const library = {
    tracks: [{ id: 'a' }, { id: 'b' }],
    playlists: [{ id: 'p', name: 'Mix', trackIds: ['a', 'b'] }]
  };
  const plan = planDeduplication(library, []);

  assert.equal(plan.changed, false);
  assert.equal(plan.removedCount, 0);
  assert.equal(plan.tracks, library.tracks, 'the same array, so nothing is saved and nothing syncs');
  assert.equal(plan.playlists, library.playlists);
});

test('running it a second time finds nothing to do', () => {
  const library = {
    tracks: [{ id: 'keep', title: 'Song' }, { id: 'clone' }],
    playlists: [{ id: 'p', name: 'Mix', trackIds: ['clone'] }]
  };
  const first = planDeduplication(library, [['keep', 'clone']]);
  const second = planDeduplication(first, []);

  assert.equal(second.changed, false);
  assert.deepEqual(second.tracks.map((t) => t.id), ['keep']);
  assert.deepEqual(second.playlists[0].trackIds, ['keep']);
});

test('a cluster naming a track the library has never heard of is survivable', () => {
  const library = { tracks: [{ id: 'a' }], playlists: [] };
  const plan = planDeduplication(library, [['a', 'ghost']]);

  assert.deepEqual(plan.tracks.map((t) => t.id), ['a']);
  assert.deepEqual(plan.removedIds, ['ghost'], 'its audio is still worth deleting');
});

test('called with nothing, it does nothing', () => {
  const plan = planDeduplication();
  assert.equal(plan.changed, false);
  assert.deepEqual(plan.tracks, []);
  assert.deepEqual(plan.removedIds, []);
  assert.deepEqual(sizeGroups(), []);
  assert.deepEqual(clustersFromHashes(), []);
});
