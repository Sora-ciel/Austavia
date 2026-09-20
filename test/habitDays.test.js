import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dayKey,
  recentDays,
  daysToShow,
  DAYS_ON_PHONE,
  DAYS_ON_DESKTOP
} from '../src/utils/habitDays.js';

// Named after the request: "make it so one habit just takes around the height
// of two lines, and that the days to press for it to be done are small enough
// to see THE LAST 7 DAYS -- right now it's not workable."
//
// The sizing is CSS. What is testable is the window itself, which was pointing
// the wrong way, and the day key, which was in the wrong timezone.

test('a phone shows the last week, a computer the last fortnight', () => {
  assert.equal(daysToShow({ width: 390 }), DAYS_ON_PHONE);
  assert.equal(daysToShow({ width: 1024 }), DAYS_ON_PHONE, 'the breakpoint itself is compact');
  assert.equal(daysToShow({ width: 1440 }), DAYS_ON_DESKTOP);
  assert.equal(daysToShow(), DAYS_ON_DESKTOP, 'an unknown width is not a small one');
});

test('the window ends today and runs backwards', () => {
  // It used to run *forwards*: today and the next thirteen days. So every
  // square on screen was a day that had not happened, and yesterday -- the one
  // most often needed, because it was forgotten -- could not be reached at all.
  const today = new Date(2026, 8, 20); // 20 September 2026, local
  const days = recentDays({ today, count: 7 });

  assert.equal(days.length, 7);
  assert.equal(days.at(-1).key, '2026-09-20', 'today is last');
  assert.equal(days[0].key, '2026-09-14', 'and the window starts six days earlier');
  assert.equal(days.at(-1).isToday, true);
  assert.equal(days[0].isToday, false);
});

test('the days come out in order, with no gaps and no repeats', () => {
  const days = recentDays({ today: new Date(2026, 8, 20), count: 14 });
  const keys = days.map((d) => d.key);
  assert.equal(new Set(keys).size, 14, 'no repeats');
  assert.deepEqual(keys, [...keys].sort(), 'oldest first');
});

test('a day is the day you are living in, not the day it is in Greenwich', () => {
  // The bug this was written from. The key came from toISOString(), which is
  // UTC: at 22:24 in New York that reads as the *next* day, so a habit ticked
  // after dinner was written against tomorrow -- every evening, silently.
  const lateEvening = new Date(2026, 8, 18, 22, 24);
  assert.equal(dayKey(lateEvening), '2026-09-18');
  assert.equal(dayKey(new Date(2026, 8, 18, 23, 59)), '2026-09-18', 'right up to midnight');
  assert.equal(dayKey(new Date(2026, 8, 19, 0, 1)), '2026-09-19', 'and over it');
});

test('months and years are crossed properly', () => {
  assert.deepEqual(
    recentDays({ today: new Date(2026, 9, 2), count: 4 }).map((d) => d.key),
    ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']
  );
  assert.deepEqual(
    recentDays({ today: new Date(2027, 0, 1), count: 3 }).map((d) => d.key),
    ['2026-12-30', '2026-12-31', '2027-01-01']
  );
});

test('a leap day is neither skipped nor invented', () => {
  assert.deepEqual(
    recentDays({ today: new Date(2028, 2, 1), count: 3 }).map((d) => d.key),
    ['2028-02-28', '2028-02-29', '2028-03-01']
  );
});

test('the day is stepped by whole days, so the clocks changing cannot eat one', () => {
  // Subtracting 24 hours of milliseconds repeatedly loses or repeats a day
  // across a daylight-saving boundary. Stepping the date does not.
  const days = recentDays({ today: new Date(2026, 10, 3), count: 7 });
  assert.equal(days.length, 7);
  assert.equal(new Set(days.map((d) => d.key)).size, 7);
});

test('nonsense in gives nothing out, rather than a row of Invalid Date', () => {
  assert.deepEqual(recentDays({ today: new Date('nope'), count: 7 }), []);
  assert.equal(dayKey('nope'), '');
  assert.equal(dayKey(null), '');
  assert.equal(recentDays({ today: new Date(2026, 8, 20), count: 0 }).length, 1, 'at least today');
  assert.equal(recentDays({ today: new Date(2026, 8, 20), count: -5 }).length, 1);
});
