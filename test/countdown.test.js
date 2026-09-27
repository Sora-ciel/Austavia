// The timer page of the clock block.
//
// Asked for on 2026-09-27: "and now the timer, let's add a timer, on the
// bottom left corner probably." The third corner after the alarm (top right)
// and the stopwatch (top left), and the same rule as both: its corner shows the
// timer from the other pages, and on its own page shows the time and leads back
// to the clock. That was wanted -- change it as a decision, not a tidy-up.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DURATION_MS,
  MAX_DURATION_MS,
  RING_WINDOW_MS,
  readTimer,
  timerState,
  timeLeft,
  startTimer,
  pauseTimer,
  resetTimer,
  setDuration,
  oneMoreMinute,
  parseDuration,
  timerReading,
  msUntilTimerChange,
  msUntilTimerRingChange,
  timerCorner
} from '../src/utils/countdown.js';
import { readClockDevice, RING_WINDOW_MS as ALARM_RING_WINDOW_MS } from '../src/utils/alarm.js';

// Any real moment.
const T = 1_790_000_000_000;
const MIN = 60_000;

describe('running the timer', () => {
  it('starts at five minutes, set and not running', () => {
    const timer = readTimer(null);
    assert.equal(timer.duration, DEFAULT_DURATION_MS);
    assert.equal(timerState(timer, T), 'idle');
    assert.equal(timeLeft(timer, T), 5 * MIN);
  });

  it('counts down from when it was started', () => {
    const timer = startTimer(setDuration(readTimer(null), 2 * MIN, T), T);
    assert.equal(timerState(timer, T + 30_000), 'running');
    assert.equal(timeLeft(timer, T + 30_000), 90_000);
  });

  it('holds still while paused, and carries on from there', () => {
    let timer = startTimer(readTimer(null), T);
    timer = pauseTimer(timer, T + MIN);
    assert.equal(timerState(timer, T + 10 * MIN), 'paused');
    assert.equal(timeLeft(timer, T + 10 * MIN), 4 * MIN);

    timer = startTimer(timer, T + 20 * MIN);
    assert.equal(timeLeft(timer, T + 21 * MIN), 3 * MIN);
  });

  // Kept as the moment it ends, so a timer that ran out while nobody was
  // looking -- a phone asleep, a reload -- is found run out, and rings.
  it('is found run out after a gap nobody was watching, and rings', () => {
    const stored = JSON.parse(JSON.stringify(startTimer(readTimer(null), T)));
    assert.equal(timerState(stored, T + 5 * MIN + 30_000), 'ringing');
    assert.equal(timeLeft(stored, T + 5 * MIN + 30_000), 0);
  });

  it('rings when it runs out, for as long as an alarm would, then goes quiet', () => {
    const timer = startTimer(readTimer(null), T);
    assert.equal(timerState(timer, T + 5 * MIN - 1), 'running');
    assert.equal(timerState(timer, T + 5 * MIN), 'ringing');
    assert.equal(timerState(timer, T + 5 * MIN + RING_WINDOW_MS), 'done');
  });

  it('rings as long as the alarm does', () => {
    assert.equal(RING_WINDOW_MS, ALARM_RING_WINDOW_MS);
  });

  it('stopping a ringing timer sets it back to its length, ready again', () => {
    const timer = resetTimer(startTimer(setDuration(readTimer(null), 3 * MIN, T), T));
    assert.equal(timerState(timer, T + 10 * MIN), 'idle');
    assert.equal(timeLeft(timer, T + 10 * MIN), 3 * MIN);
  });

  it('gives one more minute from now when it has just gone off', () => {
    const rang = startTimer(readTimer(null), T);
    const more = oneMoreMinute(rang, T + 6 * MIN);
    assert.equal(timerState(more, T + 6 * MIN), 'running');
    assert.equal(timeLeft(more, T + 6 * MIN), MIN);
  });

  it('adds the minute to what is left while it is still running', () => {
    const timer = oneMoreMinute(startTimer(readTimer(null), T), T + MIN);
    assert.equal(timeLeft(timer, T + MIN), 5 * MIN);
  });

  // A running timer is not re-aimed under somebody.
  it('changes its length only while it is not in use', () => {
    const running = startTimer(readTimer(null), T);
    assert.equal(setDuration(running, 10 * MIN, T + 1000).duration, DEFAULT_DURATION_MS);
    assert.equal(setDuration(readTimer(null), 10 * MIN, T).duration, 10 * MIN);
  });

  it('starting a running timer does not restart it', () => {
    const timer = startTimer(readTimer(null), T);
    assert.equal(timeLeft(startTimer(timer, T + MIN), T + MIN), 4 * MIN);
  });
});

describe('readTimer', () => {
  it('is a stopped five-minute timer when nothing sensible was stored', () => {
    for (const stored of [null, 'x', { duration: -3, endsAt: 'soon', remaining: NaN }]) {
      const timer = readTimer(stored);
      assert.equal(timerState(timer, T), 'idle');
      assert.equal(timer.duration, DEFAULT_DURATION_MS);
    }
  });

  it('never holds more than the reading can show', () => {
    assert.equal(readTimer({ duration: 1e12 }).duration, MAX_DURATION_MS);
  });

  // On this device only, beside the page and the stopwatch.
  it('is kept in the block\'s device memory, which now knows the timer page', () => {
    const device = readClockDevice(JSON.stringify({ page: 'timer', timer: startTimer(readTimer(null), T) }));
    assert.equal(device.page, 'timer');
    assert.equal(timerState(device.timer, T + 1000), 'running');
  });
});

describe('parseDuration', () => {
  it('reads a bare number as minutes -- what a timer is usually set in', () => {
    assert.equal(parseDuration('5'), 5 * MIN);
    assert.equal(parseDuration('1.5'), 90_000);
  });

  it('reads minutes and seconds, and hours, minutes and seconds', () => {
    assert.equal(parseDuration('1:30'), 90_000);
    assert.equal(parseDuration('0:45'), 45_000);
    assert.equal(parseDuration('1:02:03'), 3_723_000);
    assert.equal(parseDuration(' 25:00 '), 25 * MIN);
  });

  it('refuses what is not a length rather than guessing', () => {
    for (const bad of ['', 'soon', '1:75', '1:60:00', '1:2:3:4', '-5', '0', '0:00', ':30']) {
      assert.equal(parseDuration(bad), 0, `for ${bad}`);
    }
  });
});

describe('timerReading', () => {
  it('reads the way a timer does', () => {
    assert.equal(timerReading(5 * MIN), '5:00');
    assert.equal(timerReading(7_000), '0:07');
    assert.equal(timerReading(3_723_000), '1:02:03');
  });

  // Rounded up: half a second left is not 0:00 yet.
  it('does not say 0:00 until it is', () => {
    assert.equal(timerReading(500), '0:01');
    assert.equal(timerReading(0), '0:00');
  });
});

describe('msUntilTimerChange', () => {
  it('wakes on the timer\'s next second while it runs', () => {
    const timer = startTimer(readTimer(null), T);
    const wait = msUntilTimerChange(timer, T + 1_300);
    assert.ok(wait >= 700 && wait < 720, `waited ${wait}ms`);
  });

  it('wakes when the ringing gives up, so the banner goes away', () => {
    const timer = startTimer(readTimer(null), T);
    const wait = msUntilTimerChange(timer, T + 5 * MIN + RING_WINDOW_MS - 2000);
    assert.ok(wait >= 2000 && wait < 2020, `waited ${wait}ms`);
  });

  it('does not wake for a timer that is not in use', () => {
    assert.equal(msUntilTimerChange(readTimer(null), T), null);
    assert.equal(msUntilTimerChange(pauseTimer(startTimer(readTimer(null), T), T + 1000), T + 2000), null);
  });
});

describe('msUntilTimerRingChange', () => {
  // The ringer wakes for the end, not for every second of the count.
  it('wakes the ringer when the timer runs out, not every second', () => {
    const timer = startTimer(readTimer(null), T);
    const wait = msUntilTimerRingChange(timer, T + MIN);
    assert.ok(wait >= 4 * MIN && wait < 4 * MIN + 20, `waited ${wait}ms`);
  });

  it('wakes the ringer when the ringing gives up', () => {
    const timer = startTimer(readTimer(null), T);
    const wait = msUntilTimerRingChange(timer, T + 5 * MIN + 1000);
    assert.ok(wait >= RING_WINDOW_MS - 1000 && wait < RING_WINDOW_MS, `waited ${wait}ms`);
  });

  it('has nothing to wait for when the timer is not in use', () => {
    assert.equal(msUntilTimerRingChange(readTimer(null), T), null);
  });
});

describe('timerCorner', () => {
  // "...on the bottom left corner": the way in, from any other page.
  it('is the way to the timer from the other pages', () => {
    for (const page of ['clock', 'alarm', 'stopwatch']) {
      assert.equal(timerCorner({ page, timer: readTimer(null), now: T }).kind, 'icon');
    }
  });

  it('shows what is left from the other pages while it runs or is paused', () => {
    const running = startTimer(readTimer(null), T);
    assert.deepEqual(timerCorner({ page: 'clock', timer: running, now: T + MIN }), { kind: 'timer', text: '4:00', ringing: false });
    const held = pauseTimer(running, T + 2 * MIN);
    assert.equal(timerCorner({ page: 'alarm', timer: held, now: T + 9 * MIN }).text, '3:00');
  });

  it('says it is ringing from the other pages', () => {
    const rang = startTimer(readTimer(null), T);
    assert.deepEqual(timerCorner({ page: 'clock', timer: rang, now: T + 5 * MIN + 1 }), { kind: 'timer', text: '0:00', ringing: true });
  });

  it('shows the time on the timer page, as the other corners do on theirs', () => {
    const corner = timerCorner({ page: 'timer', timer: startTimer(readTimer(null), T), now: T, clockTime: '14:05' });
    assert.deepEqual(corner, { kind: 'time', text: '14:05', ringing: false });
  });
});
