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
  assert.deepEqual(habitStreaks({ log: days }, { today }), { current: 1, best: 4 });
});

test('a habit with nothing done has no streak', () => {
  assert.deepEqual(habitStreaks({ log: {} }, { today }), { current: 0, best: 0 });
});
