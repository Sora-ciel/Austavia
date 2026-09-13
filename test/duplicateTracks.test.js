import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  sizeGroups,
  clustersFromHashes,
  chooseSurvivor,
  planDeduplication,
  sameNameClusters,
  SAME_NAME
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

// The wider net, asked for as: "if they have the exact same name, then delete
// the one with the least amount of bytes — to remove the lesser quality
// duplicate when the music is supposed to be the same."

test('the same name at two qualities leaves the bigger file', () => {
  const tracks = [
    { id: 'small', title: 'Nightcall' },
    { id: 'big', title: 'Nightcall' }
  ];
  const clusters = sameNameClusters(tracks);
  const plan = planDeduplication({ tracks }, clusters, {
    sizes: { small: 3_000_000, big: 9_000_000 }
  });

  assert.deepEqual(plan.removedIds, ['small']);
  assert.deepEqual(plan.tracks.map((t) => t.id), ['big']);
  assert.equal(plan.sameNameCount, 1);
  assert.equal(plan.identicalCount, 0);
});

test('the same name is the same name whatever the spacing and the case', () => {
  const clusters = sameNameClusters([
    { id: 'a', title: 'Nightcall' },
    { id: 'b', title: '  nightcall ' }
  ]);
  assert.deepEqual(clusters, [{ ids: ['a', 'b'], rule: SAME_NAME }]);
});

test('two songs called the same thing by two artists are left alone', () => {
  const clusters = sameNameClusters([
    { id: 'a', title: 'Intro', artist: 'One Band' },
    { id: 'b', title: 'Intro', artist: 'Another Band' }
  ]);
  assert.deepEqual(clusters, [], 'an artist that disagrees is evidence they are different songs');
});

test('an artist nobody filled in does not split a group', () => {
  const clusters = sameNameClusters([
    { id: 'a', title: 'Intro', artist: 'One Band' },
    { id: 'b', title: 'Intro' }
  ]);
  assert.equal(clusters.length, 1, 'a missing artist is not evidence either way');
});

test('a track with no name at all is never matched on it', () => {
  assert.deepEqual(sameNameClusters([{ id: 'a' }, { id: 'b' }]), []);
  assert.deepEqual(sameNameClusters([{ id: 'a', title: '   ' }, { id: 'b', title: '' }]), []);
});

test('the file name stands in until the tags have been read', () => {
  const clusters = sameNameClusters([
    { id: 'a', fileName: 'Nightcall' },
    { id: 'b', title: 'nightcall' }
  ]);
  assert.equal(clusters.length, 1);
});

test('a pair caught by both passes is decided once, not twice', () => {
  // Byte-identical files also share a name, so the same pair arrives from both.
  const tracks = [{ id: 'a', title: 'Song' }, { id: 'b', title: 'Song' }];
  const plan = planDeduplication(
    { tracks },
    [['a', 'b'], { ids: ['a', 'b', 'c'], rule: SAME_NAME }],
    { sizes: { a: 10, b: 20, c: 5 } }
  );

  assert.equal(plan.removedCount, 2);
  assert.ok(!plan.removedIds.includes('b'), 'the biggest file stays, and stays once');
  assert.equal(new Set(plan.removedIds).size, plan.removedIds.length);
  assert.ok(!plan.removedIds.includes(plan.tracks[0]?.id ?? ''), 'never delete the copy that stays');
});

test('with the wider net switched off, only identical files go', () => {
  const tracks = [
    { id: 'a', title: 'Song' },
    { id: 'b', title: 'Song' }
  ];
  const plan = planDeduplication({ tracks }, clustersFromHashes([
    { id: 'a', size: 10, hash: 'aaa' },
    { id: 'b', size: 20, hash: 'bbb' }
  ]));

  assert.equal(plan.changed, false, 'a shared name is not a reason unless it was asked for');
});

test('the one you are listening to survives the wider net too', () => {
  const tracks = [{ id: 'small', title: 'Song' }, { id: 'big', title: 'Song' }];
  const plan = planDeduplication({ tracks }, sameNameClusters(tracks), {
    sizes: { small: 1, big: 100 },
    playingId: 'small'
  });

  assert.deepEqual(plan.removedIds, ['big']);
});
