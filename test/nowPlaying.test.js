import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nowPlayingRecord, tracksTheLibraryLacks, playableIds } from '../src/utils/nowPlaying.js';

// Named after the request: "even while still importing I can see the player
// when I start a music."

test('a track still being imported can still show the player', () => {
  const record = nowPlayingRecord('pending', [], [{ id: 'pending', title: 'New song' }]);
  assert.equal(record?.title, 'New song');
});

test('once the library has the track, the library is what the player shows', () => {
  const record = nowPlayingRecord(
    'song',
    [{ id: 'song', title: 'With its tags read' }],
    [{ id: 'song', title: 'As it was mid-import' }]
  );
  assert.equal(record.title, 'With its tags read');
});

test('an id nothing knows about shows no player', () => {
  assert.equal(nowPlayingRecord('gone', [{ id: 'other' }], [{ id: 'another' }]), null);
  assert.equal(nowPlayingRecord(null, [{ id: 'song' }]), null);
  assert.equal(nowPlayingRecord(), null);
});

test('only the tracks the library is missing travel with the play', () => {
  const tracks = [
    { id: 'old', title: 'Already saved' },
    { id: 'new', title: 'Still importing' }
  ];
  const carried = tracksTheLibraryLacks(['old', 'new'], tracks, [{ id: 'old', title: 'Already saved' }]);

  assert.deepEqual(carried, [{ id: 'new', title: 'Still importing' }]);
});

test('on an ordinary day nothing travels at all', () => {
  const tracks = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(tracksTheLibraryLacks(['a', 'b'], tracks, tracks), []);
});

test('what travels is the name of the track, not the whole record', () => {
  const [carried] = tracksTheLibraryLacks(
    ['x'],
    [{ id: 'x', title: 'T', artist: 'A', album: 'R', duration: 100, lyrics: 'a novel', _huge: 'x' }],
    []
  );
  assert.deepEqual(Object.keys(carried).sort(), ['album', 'artist', 'duration', 'id', 'title']);
});

test('nothing in the queue means nothing to carry', () => {
  assert.deepEqual(tracksTheLibraryLacks([], [{ id: 'a' }], []), []);
  assert.deepEqual(tracksTheLibraryLacks(), []);
});

test('a file just copied in can be played before the store has listed it', () => {
  const ids = playableIds(['old'], [{ id: 'just-copied' }]);
  assert.equal(ids.has('just-copied'), true, 'we wrote it; we do not need the listing to agree yet');
  assert.equal(ids.has('old'), true);
});

test('with no import running, what the store says is the whole answer', () => {
  assert.deepEqual([...playableIds(['a', 'b'])], ['a', 'b']);
  assert.deepEqual([...playableIds()], []);
});
