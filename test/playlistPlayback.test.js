import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_MUSIC,
  findPlaylist,
  resolveQueue,
  playlistLabel,
  stepTrack,
  isQueuePlaying,
  playbackPool,
  openingPlaylist
} from '../src/utils/playlistPlayback.js';

const t = (id, title = id) => ({ id, title });

const LIBRARY = {
  tracks: [t('a'), t('b'), t('c'), t('d')],
  playlists: [
    { id: 'p1', name: 'Evening', trackIds: ['c', 'a'] },
    { id: 'p2', name: 'Empty', trackIds: [] }
  ]
};

test('no playlist chosen means the whole library, in library order', () => {
  const { tracks, missing } = resolveQueue(LIBRARY, ALL_MUSIC);
  assert.deepEqual(tracks.map((x) => x.id), ['a', 'b', 'c', 'd']);
  assert.equal(missing, false);
});

test('a playlist plays in its own order, not the library’s', () => {
  const { tracks } = resolveQueue(LIBRARY, 'p1');
  assert.deepEqual(tracks.map((x) => x.id), ['c', 'a']);
});

test('a playlist naming a track the library lost just skips it', () => {
  const lib = { ...LIBRARY, playlists: [{ id: 'p3', name: 'Stale', trackIds: ['a', 'gone', 'b'] }] };
  const { tracks, missing } = resolveQueue(lib, 'p3');
  assert.deepEqual(tracks.map((x) => x.id), ['a', 'b']);
  assert.equal(missing, false, 'the playlist is still itself');
});

test('a deleted playlist is reported, not quietly turned into every song', () => {
  const { tracks, missing } = resolveQueue(LIBRARY, 'deleted');
  assert.deepEqual(tracks, []);
  assert.equal(missing, true);
});

test('an empty or malformed library does not throw', () => {
  for (const lib of [undefined, null, {}, { tracks: null, playlists: 'no' }]) {
    const { tracks } = resolveQueue(lib, ALL_MUSIC);
    assert.deepEqual(tracks, [], `library ${JSON.stringify(lib)}`);
  }
});

test('the block is labelled by what it plays', () => {
  assert.equal(playlistLabel(LIBRARY, ALL_MUSIC), 'All music');
  assert.equal(playlistLabel(LIBRARY, 'p1'), 'Evening');
  assert.equal(playlistLabel(LIBRARY, 'deleted'), 'Missing playlist');
});

test('findPlaylist is honest about nothing', () => {
  assert.equal(findPlaylist(LIBRARY, ''), null);
  assert.equal(findPlaylist(LIBRARY, 'nope'), null);
  assert.equal(findPlaylist(LIBRARY, 'p1').name, 'Evening');
});

test('next and previous walk the queue', () => {
  const { tracks } = resolveQueue(LIBRARY, ALL_MUSIC);
  assert.equal(stepTrack(tracks, 'b', 1).id, 'c');
  assert.equal(stepTrack(tracks, 'b', -1).id, 'a');
});

test('the queue wraps at both ends rather than stopping', () => {
  const { tracks } = resolveQueue(LIBRARY, ALL_MUSIC);
  assert.equal(stepTrack(tracks, 'd', 1).id, 'a');
  assert.equal(stepTrack(tracks, 'a', -1).id, 'd');
});

test('pressing next on a block that is not playing starts its queue', () => {
  const { tracks } = resolveQueue(LIBRARY, 'p1');
  assert.equal(stepTrack(tracks, 'something-else', 1).id, 'c', 'from the top');
  assert.equal(stepTrack(tracks, null, 1).id, 'c');
  assert.equal(stepTrack(tracks, 'something-else', -1).id, 'a', 'from the end');
});

test('stepping an empty queue has no answer, and says so', () => {
  assert.equal(stepTrack([], 'a', 1), null);
  assert.equal(stepTrack(null, 'a', 1), null);
});

// One audio element, several blocks: only the one holding the track is playing.
test('a block shows as playing only when the track is one of its own', () => {
  const evening = resolveQueue(LIBRARY, 'p1').tracks; // c, a
  assert.equal(isQueuePlaying(evening, 'c', true), true);
  assert.equal(isQueuePlaying(evening, 'b', true), false, 'another block’s track');
  assert.equal(isQueuePlaying(evening, 'c', false), false, 'paused');
  assert.equal(isQueuePlaying(evening, null, true), false);
});

// Named after the request: "make it so that even if you search a music, the
// music your autoplay chooses on are still the playlist you are in's pool.
// Because if not, then you can end up with only one music going in loop, and so
// far this is not our aim." And: "keep in memory the last music you listened to,
// so that when you go back it's actually the music you listened to and not
// another one."

const song = (id, title = id) => ({ id, title });

test('searching for one song does not leave it playing on loop', () => {
  // The bug in one line. Playing handed the queue whatever was listed, and a
  // search filters the listing — so finding exactly what you wanted was the
  // surest way to hear nothing else afterwards.
  const playlist = [song('a'), song('b'), song('c')];
  const listed = [song('b')]; // what a search for "b" left on screen
  const queue = playbackPool({ pool: playlist, chosen: listed[0] });

  assert.equal(queue.length, 3);
  assert.notDeepEqual(queue.map((t) => t.id), ['b']);
  assert.equal(stepTrack(queue, 'b', 1).id, 'c', 'and next goes on through the playlist');
});

test('a search narrows what you see, never what plays next', () => {
  const playlist = [song('a'), song('b'), song('c')];
  assert.deepEqual(
    playbackPool({ pool: playlist, chosen: song('a') }).map((t) => t.id),
    ['a', 'b', 'c']
  );
});

test('the whole library is a pool like any other', () => {
  // With no playlist open, what you are looking at is everything, and that is
  // what should carry on playing.
  const library = [song('a'), song('b')];
  assert.deepEqual(playbackPool({ pool: library }).map((t) => t.id), ['a', 'b']);
});

test('pressing play on a track always plays that track', () => {
  // Nothing should produce a chosen track outside its own pool today. It costs
  // one comparison to make it impossible tomorrow.
  const queue = playbackPool({ pool: [song('a')], chosen: song('z') });
  assert.deepEqual(queue.map((t) => t.id), ['z', 'a']);
});

test('an empty pool is an empty queue, not a crash', () => {
  assert.deepEqual(playbackPool({ pool: [] }), []);
  assert.deepEqual(playbackPool({}), []);
  assert.deepEqual(playbackPool(), []);
  assert.deepEqual(playbackPool({ pool: [null, undefined] }), []);
});

test('the playlist you were in is the one you come back to', () => {
  const library = { tracks: [], playlists: [{ id: 'p1', name: 'Night', trackIds: [] }] };
  assert.equal(openingPlaylist(library, 'p1'), 'p1');
});

test('a playlist that is gone opens on all music rather than on nothing', () => {
  // Deleted here or on another device. Pointing at a playlist that is not there
  // is how the mode would come back empty with no way to say why.
  const library = { tracks: [], playlists: [{ id: 'p1', name: 'Night', trackIds: [] }] };
  assert.equal(openingPlaylist(library, 'gone'), null);
  assert.equal(openingPlaylist(library, null), null);
  assert.equal(openingPlaylist(library, undefined), null);
  assert.equal(openingPlaylist({ playlists: [] }, 'p1'), null);
});
