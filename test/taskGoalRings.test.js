import { test } from 'node:test';
import assert from 'node:assert/strict';

import { setGoal, startTimer, addProgress } from '../src/utils/taskGoals.js';
import {
  goalRings,
  msUntilGoalRingChange,
  answerRing,
  readAnswered,
  ringKey,
  RING_WINDOW_MS,
  CHIME_MS
} from '../src/utils/taskGoalRings.js';

// Asked 2026-10-26: objectives "should have a sound when they finish and a
// popup -- reuse the timer's, for all types of devices."

const SEC = 1000;
const t0 = new Date(2026, 9, 26, 10, 0).getTime();

function folderWith(task) {
  return [{ id: 'list', type: 'task', tasks: [task] }, { id: 'note', type: 'text' }];
}

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

const timed = startTimer(setGoal({ id: 'study', text: 'Study', done: false }, { kind: 'time', target: 60 }, t0), t0);

test('a time objective rings when its timer reaches the goal, even before anything is saved', () => {
  assert.deepEqual(goalRings({ blocks: folderWith(timed), now: t0 + 30 * SEC }), []);
  const [ring] = goalRings({ blocks: folderWith(timed), now: t0 + 61 * SEC });
  assert.equal(ring.taskId, 'study');
  assert.equal(ring.loud, true);
  assert.equal(ring.finishedAt, t0 + 60 * SEC);
});

test('it rings until stopped, like a timer -- for up to the timer\'s window', () => {
  assert.equal(goalRings({ blocks: folderWith(timed), now: t0 + 60 * SEC + RING_WINDOW_MS - SEC }).length, 1);
  assert.equal(goalRings({ blocks: folderWith(timed), now: t0 + 60 * SEC + RING_WINDOW_MS + SEC }).length, 0);
});

test('stopping it on this device stops it, and keeps it stopped', () => {
  const storage = memoryStorage();
  const [ring] = goalRings({ blocks: folderWith(timed), now: t0 + 61 * SEC });
  answerRing(storage, ring.key, t0 + 62 * SEC);
  assert.deepEqual(goalRings({ blocks: folderWith(timed), now: t0 + 70 * SEC, answered: readAnswered(storage) }), []);
});

test('a count objective, finished by a tap, chimes once and its banner goes by itself', () => {
  let task = setGoal({ id: 'draw', text: 'Draw', done: false }, { kind: 'count', target: 1 }, t0);
  task = addProgress(task, 1, t0);
  const [ring] = goalRings({ blocks: folderWith(task), now: t0 + SEC });
  assert.equal(ring.loud, false);
  assert.equal(goalRings({ blocks: folderWith(task), now: t0 + CHIME_MS + SEC }).length, 0);
});

test('the ringer knows how long to sleep until a timer finishes', () => {
  assert.equal(msUntilGoalRingChange({ blocks: folderWith(timed), now: t0 + 20 * SEC }), 40 * SEC);
});

test('a task finishing again later rings again: a ring is the task and its moment', () => {
  assert.notEqual(ringKey('study', 1), ringKey('study', 2));
});

test('nothing to ring in a folder without objectives', () => {
  assert.deepEqual(goalRings({ blocks: [{ id: 'list', type: 'task', tasks: [{ id: 'a', text: 'x' }] }], now: t0 }), []);
  assert.equal(msUntilGoalRingChange({ blocks: [], now: t0 }), null);
});

test('a ring is over at the very moment its time is up, the moment the ringer wakes for', () => {
  let task = setGoal({ id: 'draw', text: 'Draw', done: false }, { kind: 'count', target: 1 }, t0);
  task = addProgress(task, 1, t0);
  const end = t0 + CHIME_MS;
  assert.equal(msUntilGoalRingChange({ blocks: folderWith(task), now: t0 }), CHIME_MS);
  assert.equal(goalRings({ blocks: folderWith(task), now: end }).length, 0);
});
