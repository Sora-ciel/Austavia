import { test } from 'node:test';
import assert from 'node:assert/strict';

import { goalTimers, withGoalTimers, goalKey, parseGoalKey, HABITS_OWNER } from '../src/utils/goalNotices.js';
import { timerNotice } from '../src/utils/timerChip.js';
import { setGoal, startTimer } from '../src/utils/taskGoals.js';
import { withHabitGoal } from '../src/utils/habitGoals.js';

// Reported 2026-10-28: "the notification pop-up doesn't show, like in timer. I
// asked for that, not just an in-app timer." Objectives go to the timer's own
// notification on the phone -- its countdown, its buttons and its "Time's up"
// with the app shut -- as one more entry beside the clock timers.

const SEC = 1000;
const t0 = new Date(2026, 9, 28, 9, 0).getTime();
const running = startTimer(setGoal({ id: 'study', text: '<p>Study</p>', done: false }, { kind: 'time', target: 1200 }, t0), t0);
const folder = task => [{ id: 'list', type: 'task', tasks: [task] }];

test('a running objective counts down in the notification, to when it will finish, under its own name', () => {
  const [entry] = goalTimers({ blocks: folder(running), now: t0 + 60 * SEC });
  assert.equal(entry.phase, 'running');
  assert.equal(entry.endsAt, t0 + 1200 * SEC);
  const notice = timerNotice([entry], {}, {});
  assert.equal(notice.title, 'Study');
  assert.equal(notice.endsAt, String(t0 + 1200 * SEC));
});

test('when it finishes it says Time\'s up there, until it is stopped', () => {
  const [entry] = goalTimers({ blocks: folder(running), now: t0 + 1201 * SEC });
  assert.equal(entry.phase, 'ringing');
  assert.equal(timerNotice([entry], {}, {}).text, "Time's up");
  assert.deepEqual(goalTimers({ blocks: folder(running), now: t0 + 1201 * SEC, answered: { [entry.ringKey]: t0 } }), []);
});

test('a habit\'s timer goes to the notification too', () => {
  let habits = withHabitGoal([{ id: 'read', name: 'Read', log: {} }], 'read', (t, at) => setGoal(t, { kind: 'time', target: 600 }, at), t0);
  habits = withHabitGoal(habits, 'read', (t, at) => startTimer(t, at), t0);
  const [entry] = goalTimers({ habits, now: t0 + SEC });
  assert.deepEqual(parseGoalKey(entry.blockId), { owner: HABITS_OWNER, taskId: 'read' });
  assert.equal(entry.title, 'Read');
});

test('a paused objective, or a count, is not in the shade', () => {
  const counting = setGoal({ id: 'draw', text: 'Draw' }, { kind: 'count', target: 3 }, t0);
  const paused = setGoal({ id: 'p', text: 'Paused' }, { kind: 'time', target: 600 }, t0);
  assert.deepEqual(goalTimers({ blocks: [{ id: 'l', type: 'task', tasks: [counting, paused] }], now: t0 }), []);
});

test('a ringing anything comes before a running one; among running, the soonest first', () => {
  const merged = withGoalTimers(
    [{ blockId: 'clock', phase: 'running', left: 5 * SEC }],
    [{ blockId: goalKey('list', 'a'), phase: 'running', left: 2 * SEC }, { blockId: goalKey('list', 'b'), phase: 'ringing', left: 0 }]
  );
  assert.deepEqual(merged.map(e => e.blockId), ['goal:list:b', 'goal:list:a', 'clock']);
});

test('a clock timer\'s id is never taken for an objective', () => {
  assert.equal(parseGoalKey('2f9c1e7a-clock-id'), null);
});
