import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  stepShuffle,
  rememberPlayed,
  canGoBack,
  prunePath,
  readPath,
  pathToStore,
  MAX_REMEMBERED,
  TRIM_BATCH,
  EMPTY
} from '../src/utils/shuffleHistory.js';

// Named after the request: "the random button, when activated, should remember
// the music it puts — so that when you go back on it, it should be the music you
// listened to before and not a random music. Because otherwise it's a very weird
// behaviour and you can't go back to a music you liked."

const queue = ['a', 'b', 'c', 'd', 'e'];
/** A predictable stand-in for the random pick, so a path can be written down. */
const takeFirst = (candidates) => candidates[0];

test('going back plays what was actually played before', () => {
  // The whole complaint. Back used to pick at random, so the one thing it is
  // for — hearing again what just played — was the one thing it could not do.
  let state = rememberPlayed({ ...EMPTY, trackId: 'c' });
  state = stepShuffle({ ...state, queue, currentId: 'c', delta: 1, pick: takeFirst });
  assert.equal(state.trackId, 'a');

  const back = stepShuffle({ ...state, queue, currentId: 'a', delta: -1 });
  assert.equal(back.trackId, 'c', 'back to the track that was playing before');
});

test('going back twice walks two steps back, in order', () => {
  let state = rememberPlayed({ ...EMPTY, trackId: 'a' });
  state = { ...state, ...rememberPlayed({ ...state, trackId: 'b' }) };
  state = { ...state, ...rememberPlayed({ ...state, trackId: 'c' }) };

  const once = stepShuffle({ ...state, queue, currentId: 'c', delta: -1 });
  assert.equal(once.trackId, 'b');
  const twice = stepShuffle({ ...once, queue, currentId: 'b', delta: -1 });
  assert.equal(twice.trackId, 'a');
});

test('forward after going back re-walks what was heard, rather than picking again', () => {
  // Back three and forward one should land on the track from two ago, not on a
  // stranger.
  let state = rememberPlayed({ ...EMPTY, trackId: 'a' });
  state = rememberPlayed({ ...state, trackId: 'b' });
  state = rememberPlayed({ ...state, trackId: 'c' });

  const back = stepShuffle({ ...state, queue, currentId: 'c', delta: -1 });
  assert.equal(back.trackId, 'b');

  const forward = stepShuffle({ ...back, queue, currentId: 'b', delta: 1, pick: takeFirst });
  assert.equal(forward.trackId, 'c', 'the one that was actually next, not a new pick');
  assert.deepEqual(forward.played, ['a', 'b', 'c'], 'and nothing was added');
});

test('forward at the end picks something new, which is what shuffle is for', () => {
  const state = rememberPlayed({ ...EMPTY, trackId: 'a' });
  const next = stepShuffle({ ...state, queue, currentId: 'a', delta: 1, pick: takeFirst });
  assert.equal(next.trackId, 'b', 'never the track already playing');
  assert.deepEqual(next.played, ['a', 'b']);
  assert.equal(next.position, 1);
});

test('shuffle never picks the track that is already playing', () => {
  // A queue of two has to alternate rather than repeat itself.
  const state = rememberPlayed({ ...EMPTY, trackId: 'a' });
  for (let i = 0; i < 20; i += 1) {
    const next = stepShuffle({ ...state, queue: ['a', 'b'], currentId: 'a', delta: 1 });
    assert.equal(next.trackId, 'b');
  }
});

test('at the very beginning, back does nothing rather than inventing a past', () => {
  const state = rememberPlayed({ ...EMPTY, trackId: 'a' });
  const back = stepShuffle({ ...state, queue, currentId: 'a', delta: -1 });
  assert.equal(back.trackId, null, 'nothing to go back to');
  assert.deepEqual(back.played, ['a'], 'and the path is untouched');
  assert.equal(canGoBack(state), false);
  assert.equal(canGoBack({ position: 2 }), true);
});

test('picking a track by hand starts a new branch', () => {
  // Following a link after going back, in a browser, drops whatever was ahead.
  // Keeping it would leave "forward" pointing somewhere unrelated to what is
  // playing now.
  let state = rememberPlayed({ ...EMPTY, trackId: 'a' });
  state = rememberPlayed({ ...state, trackId: 'b' });
  state = rememberPlayed({ ...state, trackId: 'c' });
  const back = stepShuffle({ ...state, queue, currentId: 'c', delta: -1 });
  assert.equal(back.position, 1);

  const chosen = rememberPlayed({ ...back, trackId: 'e' });
  assert.deepEqual(chosen.played, ['a', 'b', 'e']);
  assert.equal(chosen.position, 2);
});

test('pressing play on what is already playing does not lengthen the path', () => {
  const state = rememberPlayed({ ...EMPTY, trackId: 'a' });
  const again = rememberPlayed({ ...state, trackId: 'a' });
  assert.deepEqual(again.played, ['a']);
  assert.equal(again.position, 0);
});

test('the path is bounded, and it is the oldest that goes', () => {
  // Never more than the ceiling, whatever happens on the way -- but not pinned
  // to it either, because trimming now happens in batches rather than one song
  // at a time, so the length sits somewhere between the batch and the ceiling.
  let state = { ...EMPTY };
  for (let i = 0; i < MAX_REMEMBERED + 25; i += 1) {
    state = rememberPlayed({ ...state, trackId: `track-${i}` });
    assert.ok(
      state.played.length <= MAX_REMEMBERED,
      `path reached ${state.played.length} after ${i + 1} songs`
    );
  }
  assert.equal(state.played.at(-1), `track-${MAX_REMEMBERED + 24}`, 'the newest is kept');
  assert.equal(state.position, state.played.length - 1, 'and that is where you are standing');
  assert.equal(state.played[0], `track-${TRIM_BATCH}`, 'the oldest batch went');
});

test('an empty queue changes nothing rather than throwing', () => {
  const state = rememberPlayed({ ...EMPTY, trackId: 'a' });
  const stepped = stepShuffle({ ...state, queue: [], currentId: 'a', delta: 1 });
  assert.equal(stepped.trackId, null);
  assert.deepEqual(stepped.played, ['a']);
  assert.equal(stepShuffle().trackId, null);
  assert.deepEqual(rememberPlayed().played, []);
});

// Asked for after the first version: "make it stay on restart bro, and make it
// so that the max it remembers is 200 songs, and make it delete in batch 50 of
// the oldest songs remembered. So basically 199 - 200 - 150 - 151."

test('the path is full at 200 and drops fifty at once, not one at a time', () => {
  let state = { ...EMPTY };
  for (let i = 1; i <= 200; i += 1) state = rememberPlayed({ ...state, trackId: `s${i}` });
  assert.equal(state.played.length, 200, 'full, and nothing dropped yet');
  assert.equal(state.played[0], 's1');

  // The one that tips it over.
  state = rememberPlayed({ ...state, trackId: 's201' });
  assert.equal(state.played.length, 151, '200 becomes 151, not 200');
  assert.equal(state.played[0], 's51', 'and it is the oldest fifty that went');
  assert.equal(state.played.at(-1), 's201');
  assert.equal(state.position, 150);
});

test('the next forty-nine songs are a plain append, with no trimming', () => {
  let state = { ...EMPTY };
  for (let i = 1; i <= 201; i += 1) state = rememberPlayed({ ...state, trackId: `s${i}` });
  assert.equal(state.played.length, 151);

  for (let i = 202; i <= 250; i += 1) state = rememberPlayed({ ...state, trackId: `s${i}` });
  assert.equal(state.played.length, 200, 'back to full, having dropped nothing on the way');
  assert.equal(state.played[0], 's51');
});

test('a path written down comes back the same', () => {
  let state = { ...EMPTY };
  for (const id of ['a', 'b', 'c']) state = rememberPlayed({ ...state, trackId: id });
  const back = readPath(pathToStore(state));
  assert.deepEqual(back.played, ['a', 'b', 'c']);
  assert.equal(back.position, 2);
});

test('a position that points outside the path is brought back inside it', () => {
  // Worse than no position: back and forward would disagree about where they
  // are standing.
  assert.deepEqual(readPath('{"played":["a","b"],"position":9}'), { played: ['a', 'b'], position: 1 });
  assert.deepEqual(readPath('{"played":["a","b"],"position":-5}'), { played: ['a', 'b'], position: -1 });
});

test('a stored path that cannot be read starts empty rather than throwing', () => {
  assert.deepEqual(readPath('not json'), { played: [], position: -1 });
  assert.deepEqual(readPath(''), { played: [], position: -1 });
  assert.deepEqual(readPath(null), { played: [], position: -1 });
  assert.deepEqual(readPath('{"played":"nope"}'), { played: [], position: -1 });
  assert.deepEqual(readPath('{"played":[1,2,null,"a"]}'), { played: ['a'], position: 0 });
});

test('songs deleted since last time are taken out of the path', () => {
  // A path kept across a restart can name a track that has been deleted, and
  // walking back onto one would stop with a message about missing audio.
  const pruned = prunePath({
    played: ['a', 'gone', 'b', 'c'],
    position: 3,
    known: new Set(['a', 'b', 'c'])
  });
  assert.deepEqual(pruned.played, ['a', 'b', 'c']);
  assert.equal(pruned.position, 2, 'still standing on c');
});

test('when the song you were on is the deleted one, you land behind it', () => {
  const pruned = prunePath({
    played: ['a', 'b', 'gone'],
    position: 2,
    known: new Set(['a', 'b'])
  });
  assert.deepEqual(pruned.played, ['a', 'b']);
  assert.equal(pruned.position, 1);
});

test('pruning with nothing to prune against leaves the path alone', () => {
  const path = { played: ['a', 'b'], position: 1 };
  assert.deepEqual(prunePath(path), path);
  assert.deepEqual(prunePath({ ...path, known: new Set(['a', 'b']) }), path);
});
