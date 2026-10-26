import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  setGoal,
  removeGoal,
  startTimer,
  pauseTimer,
  addProgress,
  settleTask,
  goalNow,
  goalLabel,
  goalFinishMoment,
  parseTarget,
  normalizeGoal,
  formatDuration,
  dayKey
} from '../src/utils/taskGoals.js';

// Asked 2026-10-25: "In task mode, have objective task, where you can add an
// amount of time to do" -- then: "it's going to be time that fills up, but
// you'll also be able to count how many times, for example if you want to
// draw 20 times, and both you will be able to log by hand", and whether it
// resets each day "should depend ... on the right click you choose which type".
// And 2026-10-26: "objectives should be able to have seconds", and "a sound
// when they finish and a popup".

const SEC = 1000;
const MIN = 60 * SEC;
const H = 3600;
const day1 = new Date(2026, 9, 25, 10, 0).getTime();
const day1Late = new Date(2026, 9, 25, 23, 50).getTime();
const day2 = new Date(2026, 9, 26, 9, 0).getTime();

const plain = { id: 't', text: 'Study Japanese', done: false };

test('a task can be given a time to do, and the time fills up as the timer runs', () => {
  let task = setGoal(plain, { kind: 'time', target: 2 * H }, day1);
  task = startTimer(task, day1);
  assert.equal(goalLabel(task.goal, day1 + 30 * MIN), '30m / 2h');
  assert.equal(goalNow(task.goal, day1 + 30 * MIN).fraction, 0.25);
});

test('sessions add up: pausing keeps the time, starting again carries on', () => {
  let task = setGoal(plain, { kind: 'time', target: 2 * H }, day1);
  task = startTimer(task, day1);
  task = pauseTimer(task, day1 + 20 * MIN);
  assert.equal(goalLabel(task.goal, day1 + 60 * MIN), '20m / 2h');
  task = startTimer(task, day1 + 60 * MIN);
  task = pauseTimer(task, day1 + 100 * MIN);
  assert.equal(goalLabel(task.goal, day1 + 200 * MIN), '1h / 2h');
});

test('a running timer is stored as when it started, so a restart loses nothing', () => {
  let task = setGoal(plain, { kind: 'time', target: 2 * H }, day1);
  task = startTimer(task, day1);
  const reloaded = JSON.parse(JSON.stringify(task));
  assert.equal(goalLabel(reloaded.goal, day1 + 45 * MIN), '45m / 2h');
});

test('reaching the time moves the task to Done and stops the timer there', () => {
  let task = setGoal(plain, { kind: 'time', target: H }, day1);
  task = startTimer(task, day1);
  task = settleTask(task, day1 + 75 * MIN);
  assert.equal(task.done, true);
  assert.equal(task.goal.runningSince, null);
  assert.equal(goalLabel(task.goal, day1 + 90 * MIN), '1h / 1h');
});

test('a goal can have seconds, and the timer counts them', () => {
  let task = setGoal(plain, { kind: 'time', target: 90 }, day1);
  task = startTimer(task, day1);
  assert.equal(goalLabel(task.goal, day1 + 45 * SEC), '45s / 1m 30s');
  task = settleTask(task, day1 + 91 * SEC);
  assert.equal(task.done, true);
});

test('a 30-second goal survives an older build, which reads whole minutes only', () => {
  const task = setGoal(plain, { kind: 'time', target: 30 }, day1);
  assert.equal(task.goal.targetSeconds, 30);
  assert.equal(task.goal.target, 1);
});

test('a time goal written before seconds is read in minutes, as it was', () => {
  const old = normalizeGoal({ kind: 'time', target: 120, progress: 0 });
  assert.equal(old.targetSeconds, 2 * H);
  assert.equal(goalLabel(old, day1), '0s / 2h');
});

test('a task can count how many times instead: draw 20 times', () => {
  let task = setGoal({ ...plain, text: 'Draw' }, { kind: 'count', target: 20 }, day1);
  task = addProgress(task, 1, day1);
  task = addProgress(task, 1, day1);
  assert.equal(goalLabel(task.goal, day1), '2 / 20');
  assert.equal(task.done, false);
});

test('the twentieth time moves it to Done', () => {
  let task = setGoal({ ...plain, text: 'Draw' }, { kind: 'count', target: 20 }, day1);
  task = addProgress(task, 19, day1);
  assert.equal(task.done, false);
  task = addProgress(task, 1, day1);
  assert.equal(task.done, true);
});

test('time can be logged by hand too, adding to whatever the timer counted', () => {
  let task = setGoal(plain, { kind: 'time', target: 2 * H }, day1);
  task = startTimer(task, day1);
  task = addProgress(task, 30 * 60, day1 + 10 * MIN);
  assert.equal(goalLabel(task.goal, day1 + 10 * MIN), '40m / 2h');
  assert.equal(goalNow(task.goal, day1 + 10 * MIN).running, true);
});

test('a log that was a mistake can be taken back, never below zero', () => {
  let task = setGoal({ ...plain, text: 'Draw' }, { kind: 'count', target: 20 }, day1);
  task = addProgress(task, 3, day1);
  task = addProgress(task, -5, day1);
  assert.equal(goalLabel(task.goal, day1), '0 / 20');
});

test('a daily objective starts from zero the next day and comes back to To Do', () => {
  let task = setGoal(plain, { kind: 'count', target: 2, daily: true }, day1);
  task = addProgress(task, 2, day1);
  assert.equal(task.done, true);
  task = settleTask(task, day2);
  assert.equal(task.done, false);
  assert.equal(goalLabel(task.goal, day2), '0 / 2');
  assert.equal(task.goal.day, dayKey(day2));
  assert.equal(task.goal.finishedAt, null);
});

test('one that is not daily keeps adding up across days', () => {
  let task = setGoal(plain, { kind: 'time', target: 10 * H }, day1);
  task = addProgress(task, 90 * 60, day1);
  task = settleTask(task, day2);
  assert.equal(goalLabel(task.goal, day2), '1h 30m / 10h');
});

test('a daily timer left running past midnight counts only today from midnight', () => {
  let task = setGoal(plain, { kind: 'time', target: 2 * H, daily: true }, day1);
  task = startTimer(task, day1Late);
  const nineAm = goalNow(task.goal, day2);
  assert.equal(Math.round(nineAm.value / MIN), 9 * 60);
});

test('settling a task with nothing to change gives the same task back, so nothing is saved', () => {
  const task = setGoal(plain, { kind: 'count', target: 5 }, day1);
  assert.equal(settleTask(task, day1), task);
  assert.equal(settleTask(plain, day1), plain);
});

test('lowering a goal keeps the work already done', () => {
  let task = setGoal(plain, { kind: 'time', target: 2 * H }, day1);
  task = addProgress(task, 50 * 60, day1);
  task = setGoal(task, { kind: 'time', target: H }, day1);
  assert.equal(goalLabel(task.goal, day1), '50m / 1h');
});

test('an objective can be taken off, leaving an ordinary task', () => {
  const task = removeGoal(setGoal(plain, { kind: 'count', target: 5 }, day1));
  assert.equal('goal' in task, false);
  assert.equal(task.text, 'Study Japanese');
});

// The ring needs to know when a goal finished, or will.

test('a running timer knows when it will finish, before anything is saved', () => {
  let task = setGoal(plain, { kind: 'time', target: 90 }, day1);
  task = addProgress(task, 30, day1);
  task = startTimer(task, day1 + MIN);
  assert.equal(goalFinishMoment(task.goal), day1 + MIN + 60 * SEC);
});

test('a timer that finished records the moment it reached its goal, not when it was noticed', () => {
  let task = setGoal(plain, { kind: 'time', target: 60 }, day1);
  task = startTimer(task, day1);
  task = settleTask(task, day1 + 10 * MIN);
  assert.equal(task.goal.finishedAt, day1 + 60 * SEC);
  assert.equal(goalFinishMoment(task.goal), day1 + 60 * SEC);
});

test('a count reaching its goal records when, and one not reached has no finish', () => {
  let task = setGoal({ ...plain, text: 'Draw' }, { kind: 'count', target: 2 }, day1);
  task = addProgress(task, 1, day1);
  assert.equal(goalFinishMoment(task.goal), null);
  task = addProgress(task, 1, day1 + 5 * SEC);
  assert.equal(goalFinishMoment(task.goal), day1 + 5 * SEC);
});

test('a goal is typed the way people say it, to the second', () => {
  assert.equal(parseTarget('2h', 'time'), 2 * H);
  assert.equal(parseTarget('90m', 'time'), 90 * 60);
  assert.equal(parseTarget('45s', 'time'), 45);
  assert.equal(parseTarget('1m30', 'time'), 90);
  assert.equal(parseTarget('1m 30s', 'time'), 90);
  assert.equal(parseTarget('1h30', 'time'), 90 * 60);
  assert.equal(parseTarget('1:30', 'time'), 90 * 60);
  assert.equal(parseTarget('1:05:10', 'time'), H + 5 * 60 + 10);
  assert.equal(parseTarget('1h 5m 10s', 'time'), H + 5 * 60 + 10);
  assert.equal(parseTarget('45', 'time'), 45 * 60);
  assert.equal(parseTarget('1.5h', 'time'), 90 * 60);
  assert.equal(parseTarget('20', 'count'), 20);
  assert.equal(parseTarget('soon', 'time'), null);
  assert.equal(parseTarget('0', 'count'), null);
  assert.equal(parseTarget('2.5', 'count'), null);
});

test('durations read the way they are said', () => {
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(727), '12m 07s');
  assert.equal(formatDuration(3907), '1h 05m 07s');
  assert.equal(formatDuration(7200), '2h');
  assert.equal(formatDuration(0), '0s');
});

test('a goal written by another build or by hand is cleaned, or dropped', () => {
  assert.equal(normalizeGoal({ kind: 'weight', target: 5 }), null);
  assert.equal(normalizeGoal({ kind: 'count', target: 0 }), null);
  assert.equal(normalizeGoal({ kind: 'count', target: 5, progress: -3 }).progress, 0);
  assert.equal(normalizeGoal({ kind: 'count', target: 5, runningSince: 123 }).runningSince, null);
});
