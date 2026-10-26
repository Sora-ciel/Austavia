import { test } from 'node:test';
import assert from 'node:assert/strict';

import { currentStreak, bestStreak, habitStreaks } from '../src/utils/habitStreaks.js';

// Agreed 2026-10-26: "Streaks: '🔥 12 days' next to the name, plus your best
// streak." Worked out from the days each time, never counted up.

const today = new Date(2026, 9, 26);
const log = days => Object.fromEntries(days);

test('days done in a row up to today make the streak', () => {
  assert.equal(currentStreak(log([['2026-10-24', 'done'], ['2026-10-25', 'done'], ['2026-10-26', 'done']]), { today }), 3);
});

test('a streak does not drop to 0 in the morning, before today is ticked', () => {
  assert.equal(currentStreak(log([['2026-10-24', 'done'], ['2026-10-25', 'done']]), { today }), 2);
});

test('a ✕ today ends it, and so does a day with no mark', () => {
  assert.equal(currentStreak(log([['2026-10-25', 'done'], ['2026-10-26', 'missed']]), { today }), 0);
  assert.equal(currentStreak(log([['2026-10-23', 'done'], ['2026-10-25', 'done']]), { today }), 1);
});

test('the best streak is the longest run, across a month boundary too', () => {
  const days = log([
    ['2026-09-29', 'done'], ['2026-09-30', 'done'], ['2026-10-01', 'done'], ['2026-10-02', 'done'],
    ['2026-10-03', 'missed'], ['2026-10-25', 'done']
  ]);
  assert.equal(bestStreak(days), 4);
  assert.deepEqual(habitStreaks({ log: days }, { today }), { current: 1, best: 4, unit: 'days' });
});

test('a habit with nothing done has no streak', () => {
  assert.deepEqual(habitStreaks({ log: {} }, { today }), { current: 0, best: 0, unit: 'days' });
});

// Agreed the same day: "Days it isn't due show as rest days, not ✕, and don't
// break the streak", and "skip a day: a third mark for sick days or travel, so
// the streak doesn't break". 2026-10-26 is a Monday.

test('a rest day neither adds to the streak nor breaks it', () => {
  const monWedFri = { kind: 'days', days: [1, 3, 5] };
  // Fri 23, Wed 21, Mon 19 done; the days between are rest days.
  const days = log([['2026-10-19', 'done'], ['2026-10-21', 'done'], ['2026-10-23', 'done']]);
  assert.equal(habitStreaks({ log: days, schedule: monWedFri }, { today }).current, 3);
  // The same days on an every-day habit: the gaps break it.
  assert.equal(habitStreaks({ log: days }, { today }).current, 0);
});

test('a day it was due and left empty still breaks it', () => {
  const monWedFri = { kind: 'days', days: [1, 3, 5] };
  const days = log([['2026-10-19', 'done'], ['2026-10-23', 'done']]); // Wed 21 empty
  assert.equal(habitStreaks({ log: days, schedule: monWedFri }, { today }).current, 1);
});

test('a skipped day passes: sick on Saturday does not end a run', () => {
  const days = log([['2026-10-23', 'done'], ['2026-10-24', 'skipped'], ['2026-10-25', 'done']]);
  assert.equal(habitStreaks({ log: days }, { today }).current, 2);
});

test('a habit kept 3 times a week is counted in weeks, and this week passes until it is kept', () => {
  const thrice = { kind: 'weekly', times: 3 };
  const days = log([
    ['2026-10-13', 'done'], ['2026-10-15', 'done'], ['2026-10-17', 'done'], // week of 12th: kept
    ['2026-10-20', 'done'], ['2026-10-22', 'done'], ['2026-10-25', 'done'], // week of 19th: kept
    ['2026-10-26', 'done']                                                  // this week: 1 of 3
  ]);
  assert.deepEqual(habitStreaks({ log: days, schedule: thrice }, { today }), { current: 2, best: 2, unit: 'weeks' });
});

test('a week with days skipped needs fewer, and a week not kept breaks', () => {
  const thrice = { kind: 'weekly', times: 3 };
  const skippedMost = log([
    ['2026-10-19', 'skipped'], ['2026-10-20', 'skipped'], ['2026-10-21', 'skipped'], ['2026-10-22', 'skipped'], ['2026-10-23', 'skipped'],
    ['2026-10-24', 'done'], ['2026-10-25', 'done']
  ]);
  assert.equal(habitStreaks({ log: skippedMost, schedule: thrice }, { today }).current, 1);
  const short = log([['2026-10-13', 'done'], ['2026-10-20', 'done']]);
  assert.equal(habitStreaks({ log: short, schedule: thrice }, { today }).current, 0);
});
