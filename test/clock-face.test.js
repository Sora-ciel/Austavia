// What a clock block says, and when it next has to say something different.
//
// Asked for on 2026-09-27: "a clock block that can be on all our modes apart
// from Task, Playlist and Birthday." It lands in Canvas and Simple Note, the
// two modes that hold blocks.
//
// Two things here are easy to get quietly wrong. The time has to be the one the
// person is living in — this app has already put tomorrow's date on a habit
// tick and a screenshot by reaching for UTC. And a clock that redraws every
// second to show hours and minutes wakes a phone sixty times for every change
// anybody can see.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { clockParts, clockDate, msUntilNextTick } from '../src/utils/clockFace.js';

// 27 September 2026, a Sunday, at 14:05:09.400 local time.
const AFTERNOON = new Date(2026, 8, 27, 14, 5, 9, 400);

describe('clockParts', () => {
  it('reads a 24-hour clock', () => {
    const parts = clockParts({ at: AFTERNOON });

    assert.equal(parts.time, '14:05');
    assert.equal(parts.period, '');
    assert.equal(parts.seconds, '');
  });

  it('reads a 12-hour clock, with the half of the day beside it', () => {
    const parts = clockParts({ at: AFTERNOON, hour12: true });

    assert.equal(parts.time, '2:05');
    assert.equal(parts.period, 'PM');
  });

  // "0:15 AM" is not a time anybody says.
  it('calls midnight and noon twelve on a 12-hour face', () => {
    assert.equal(clockParts({ at: new Date(2026, 8, 27, 0, 15), hour12: true }).time, '12:15');
    assert.equal(clockParts({ at: new Date(2026, 8, 27, 0, 15), hour12: true }).period, 'AM');
    assert.equal(clockParts({ at: new Date(2026, 8, 27, 12, 15), hour12: true }).time, '12:15');
    assert.equal(clockParts({ at: new Date(2026, 8, 27, 12, 15), hour12: true }).period, 'PM');
  });

  it('pads a 24-hour clock so it does not jump width at ten o\'clock', () => {
    assert.equal(clockParts({ at: new Date(2026, 8, 27, 9, 3) }).time, '09:03');
  });

  it('shows the seconds only when asked', () => {
    assert.equal(clockParts({ at: AFTERNOON, showSeconds: true }).seconds, '09');
    assert.equal(clockParts({ at: AFTERNOON }).seconds, '');
  });

  // The whole reason it is built from local parts: an evening reading must not
  // be a different day or hour because somewhere else it already is.
  it('tells the time where the person is, not in UTC', () => {
    const lateEvening = new Date(2026, 8, 27, 23, 30);
    assert.equal(clockParts({ at: lateEvening }).time, '23:30');
  });

  it('shows the time now rather than failing on a date it cannot read', () => {
    assert.match(clockParts({ at: 'not a date' }).time, /^\d{2}:\d{2}$/);
  });
});

describe('clockDate', () => {
  it('writes the day the way a person does', () => {
    assert.equal(clockDate(AFTERNOON), 'Sunday 27 September');
  });

  it('is still today late in the evening', () => {
    assert.equal(clockDate(new Date(2026, 8, 27, 23, 59)), 'Sunday 27 September');
  });
});

describe('msUntilNextTick', () => {
  // A face without seconds changes once a minute, so it wakes once a minute —
  // aimed at the start of the next one, not sixty times on the way there.
  it('wakes at the next minute when seconds are hidden', () => {
    const wait = msUntilNextTick({ now: AFTERNOON });
    // 9.4s into the minute, so about 50.6s to go.
    assert.ok(wait > 50_000 && wait < 51_000, `waited ${wait}ms`);
  });

  it('wakes every second when seconds are shown', () => {
    const wait = msUntilNextTick({ now: AFTERNOON, showSeconds: true });
    // 400ms into the second, so about 600ms to go.
    assert.ok(wait > 550 && wait < 700, `waited ${wait}ms`);
  });

  // Aimed just past the boundary: a timer that fires a hair early reads the
  // old minute and has to fire again at once.
  it('lands just after the boundary rather than on it', () => {
    const onTheMinute = new Date(2026, 8, 27, 14, 5, 0, 0);
    assert.ok(msUntilNextTick({ now: onTheMinute }) > 60_000);
  });

  it('never waits a negative or absurd amount', () => {
    for (const ms of [0, 1, 500, 999]) {
      const at = new Date(2026, 8, 27, 14, 5, 59, ms);
      const wait = msUntilNextTick({ now: at });
      assert.ok(wait > 0 && wait <= 60_100, `waited ${wait}ms at ${ms}ms`);
    }
  });
});
