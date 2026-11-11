// Timed habits and objectives in the desktop pop-up, and how long a finished
// one sounds.
//
// Asked 2026-11-10, for Linux and Windows: "the same pop up of timer but pop
// up we can put for the timer of habits" -- the timer's pop-up, reused, not a
// second one. And for the sound: "make it a sound that continues till it's put
// close or 2min passed". Both were wanted; change them as decisions.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { popupsWanted, hiddenToForget, keptToForget, goalPopupLabel } from '../src/utils/clockPopups.js';
import { goalTimers, goalKey, HABITS_OWNER } from '../src/utils/goalNotices.js';
import { setGoal, startTimer, pauseTimer } from '../src/utils/taskGoals.js';
import { withHabitGoal } from '../src/utils/habitGoals.js';
import { stillSounding, RING_SOUND_MS } from '../src/utils/ringTone.js';

const SEC = 1000;
const t0 = new Date(2026, 10, 10, 9, 0).getTime();

function habitsWithTimer({ running = true } = {}) {
  let habits = withHabitGoal([{ id: 'read', name: 'Read', log: {} }], 'read', (t, at) => setGoal(t, { kind: 'time', target: 600 }, at), t0);
  habits = withHabitGoal(habits, 'read', (t, at) => startTimer(t, at), t0);
  if (!running) habits = withHabitGoal(habits, 'read', (t, at) => pauseTimer(t, at), t0 + 60 * SEC);
  return habits;
}
const key = goalKey(HABITS_OWNER, 'read');
const label = goalPopupLabel(key);

test('a habit with a running timer gets the timer\'s pop-up when Austavia is behind', () => {
  const goals = goalTimers({ habits: habitsWithTimer(), now: t0 + 30 * SEC });
  assert.deepEqual(popupsWanted({ goals, now: t0 + 30 * SEC }), [{ goalKey: key, kind: 'goal', label }]);
  assert.deepEqual(popupsWanted({ goals, now: t0 + 30 * SEC, appInFront: true }), []);
});

test('the habit\'s pop-up knows its whole length, for the bar along its bottom', () => {
  const [entry] = goalTimers({ habits: habitsWithTimer(), now: t0 + 30 * SEC });
  assert.equal(entry.duration, 600 * SEC);
  assert.equal(entry.endsAt, t0 + 600 * SEC);
});

test('hidden by its ×, it stays hidden while it runs and comes back when time is up', () => {
  const hidden = new Set([label]);
  const runningGoals = goalTimers({ habits: habitsWithTimer(), now: t0 + 30 * SEC });
  assert.deepEqual(popupsWanted({ goals: runningGoals, hidden }), []);
  const rungGoals = goalTimers({ habits: habitsWithTimer(), now: t0 + 601 * SEC });
  assert.equal(rungGoals[0].phase, 'ringing');
  assert.equal(popupsWanted({ goals: rungGoals, hidden }).length, 1);
  // Its hide is forgotten once the habit is no longer running or ringing.
  assert.deepEqual(hiddenToForget({ goals: [], hidden }), [label]);
  assert.deepEqual(hiddenToForget({ goals: runningGoals, hidden }), []);
});

test('paused from its own pop-up, it stays there, ready to resume', () => {
  const habits = habitsWithTimer({ running: false });
  assert.deepEqual(goalTimers({ habits, now: t0 + 90 * SEC }), [], 'a paused habit has no pop-up of its own accord');
  const kept = new Set([label]);
  const goals = goalTimers({ habits, now: t0 + 90 * SEC, keepPaused: k => kept.has(goalPopupLabel(k)) });
  assert.equal(goals[0].phase, 'paused');
  assert.equal(goals[0].left, 540 * SEC);
  assert.equal(popupsWanted({ goals, kept }).length, 1);
  assert.deepEqual(keptToForget({ goals, kept }), []);
  assert.deepEqual(keptToForget({ goals: [], kept }), [label], 'forgotten once the habit is done or gone');
});

test('a finished timer sounds until it is stopped, or for two minutes', () => {
  assert.equal(RING_SOUND_MS, 2 * 60 * SEC);
  assert.equal(stillSounding(t0, t0), true);
  assert.equal(stillSounding(t0, t0 + 119 * SEC), true);
  assert.equal(stillSounding(t0, t0 + 120 * SEC), false);
  assert.equal(stillSounding(t0, t0 - SEC), false, 'not before it has finished');
  assert.equal(stillSounding(0, t0), false);
});
