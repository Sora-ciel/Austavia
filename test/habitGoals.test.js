import { test } from 'node:test';
import assert from 'node:assert/strict';

import { withHabitGoal, settleHabits } from '../src/utils/habitGoals.js';
import { setGoal, addProgress, startTimer } from '../src/utils/taskGoals.js';
import { goalRings } from '../src/utils/taskGoalRings.js';
import { normalizeHabits } from '../src/utils/habitStore.js';

// Agreed 2026-10-26: "Amounts, not just ✓: 'Drink water, 8 glasses' or 'Read
// 20 min'. This could reuse the Task-mode objectives (count and time, +1, the
// timer, the ring when done), so it's mostly a link rather than new code."

const SEC = 1000;
const t0 = new Date(2026, 9, 26, 9, 0).getTime();
const water = { id: 'water', name: 'Drink water', log: {} };

const withGoal = (habit, goal) => withHabitGoal([habit], habit.id, (t, at) => setGoal(t, goal, at), t0);

test('a habit takes a Task-mode objective, always for the day', () => {
  const [h] = withGoal(water, { kind: 'count', target: 8 });
  assert.equal(h.goal.kind, 'count');
  assert.equal(h.goal.target, 8);
  assert.equal(h.goal.daily, true);
  assert.deepEqual(normalizeHabits([h])[0].goal, h.goal, 'and the store keeps it');
});

test('reaching the amount ticks the day; falling short leaves it as it was', () => {
  let list = withGoal(water, { kind: 'count', target: 2 });
  list = withHabitGoal(list, 'water', (t, at) => addProgress(t, 1, at), t0 + SEC);
  assert.equal(list[0].log['2026-10-26'], undefined);
  list = withHabitGoal(list, 'water', (t, at) => addProgress(t, 1, at), t0 + 2 * SEC);
  assert.equal(list[0].log['2026-10-26'], 'done');
});

test('a timer reaching its time ticks the day, and the next day starts from nothing', () => {
  let list = withGoal({ id: 'read', name: 'Read', log: {} }, { kind: 'time', target: 60 });
  list = withHabitGoal(list, 'read', (t, at) => startTimer(t, at), t0);
  list = settleHabits(list, t0 + 61 * SEC);
  assert.equal(list[0].log['2026-10-26'], 'done');
  const tomorrow = settleHabits(list, t0 + 24 * 3600 * SEC);
  assert.equal(tomorrow[0].goal.progress, 0);
  assert.equal(tomorrow[0].log['2026-10-26'], 'done', 'yesterday keeps its tick');
});

test('settling a list with nothing to do gives the same list back, so nothing is saved', () => {
  const list = [water];
  assert.equal(settleHabits(list, t0), list);
});

test('a habit reaching its time rings like a task does', () => {
  let list = withGoal({ id: 'read', name: 'Read', log: {} }, { kind: 'time', target: 60 });
  list = withHabitGoal(list, 'read', (t, at) => startTimer(t, at), t0);
  const [ring] = goalRings({ blocks: [], habits: list, now: t0 + 61 * SEC });
  assert.equal(ring.taskId, 'read');
  assert.equal(ring.loud, true);
});
