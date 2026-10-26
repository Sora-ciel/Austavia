import { test } from 'node:test';
import assert from 'node:assert/strict';

import { periodRate, habitRates, yearGrid, periodStarts } from '../src/utils/habitStats.js';

// Agreed 2026-10-26: "A page for each habit: a year grid like GitHub's, your
// completion rate for the week, month and year." A rate reads the way the
// streak does: rest days, skipped days and today-not-yet-done are not owed.

const today = new Date(2026, 9, 26); // a Monday
const log = days => Object.fromEntries(days);

test('a rate is the days done out of the days owed, and today is not owed until done', () => {
  const habit = { log: log([['2026-10-21', 'done'], ['2026-10-22', 'missed']]) };
  const r = periodRate(habit, { from: new Date(2026, 9, 21), today });
  // 21..25 owed (5 days), today not yet; one done.
  assert.deepEqual(r, { done: 1, owed: 5, rate: 0.2, unit: 'days' });
});

test('rest days and skipped days are not owed', () => {
  const habit = {
    schedule: { kind: 'days', days: [1, 3, 5] },
    log: log([['2026-10-19', 'done'], ['2026-10-21', 'skipped'], ['2026-10-23', 'done']])
  };
  assert.deepEqual(periodRate(habit, { from: new Date(2026, 9, 19), today }), { done: 2, owed: 2, rate: 1, unit: 'days' });
});

test('a habit done on a rest day is a day done, but the rate stops at 100%', () => {
  const habit = { schedule: { kind: 'days', days: [1] }, log: log([['2026-10-19', 'done'], ['2026-10-20', 'done']]) };
  assert.equal(periodRate(habit, { from: new Date(2026, 9, 19), today }).rate, 1);
});

test('a habit kept so many times a week is rated in weeks, this week only once it is kept', () => {
  const habit = {
    schedule: { kind: 'weekly', times: 2 },
    log: log([['2026-10-13', 'done'], ['2026-10-15', 'done'], ['2026-10-20', 'done'], ['2026-10-26', 'done']])
  };
  assert.deepEqual(periodRate(habit, { from: new Date(2026, 9, 12), today }), { done: 1, owed: 2, rate: 0.5, unit: 'weeks' });
});

test('nothing owed yet is no rate, not 0%', () => {
  assert.equal(habitRates({ log: {} }, { today }).week.rate, null);
});

test('the periods are this week from Monday, this month and this year', () => {
  const s = periodStarts(new Date(2026, 9, 28));
  assert.equal(s.week.getDate(), 26);
  assert.equal(s.month.getDate(), 1);
  assert.equal(s.year.getMonth(), 0);
});

test('the year grid is weeks of Monday to Sunday, ending with the week of today', () => {
  const grid = yearGrid({ log: log([['2026-10-26', 'done']]), schedule: { kind: 'days', days: [1] } }, { today });
  assert.equal(grid.length, 53);
  const last = grid[grid.length - 1];
  assert.equal(last.days[0].key, '2026-10-26');
  assert.equal(last.days[0].isToday, true);
  assert.equal(last.days[0].mark, 'done');
  assert.equal(last.days[1].future, true);
  assert.equal(last.days[1].rest, true);
});

test('nothing is owed before the habit was first marked: a new habit is not 1% for the year', () => {
  const habit = { log: log([['2026-10-24', 'done'], ['2026-10-25', 'done']]) };
  const r = habitRates(habit, { today }).year;
  assert.deepEqual(r, { done: 2, owed: 2, rate: 1, unit: 'days' });
});
