// The stopwatch page of the clock block.
//
// Asked for on 2026-09-27: "now let's add a chronometer mode that will be on
// the other corner to click on." The alarm has the top-right corner, so the
// stopwatch has the top-left, and it follows the alarm's rule: its corner shows
// the stopwatch everywhere except on its own page, where it shows the time and
// leads back to the clock. That was wanted -- change it as a decision.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_LAPS,
  readStopwatch,
  isRunning,
  elapsed,
  started,
  paused,
  lapped,
  reset,
  lapRows,
  stopwatchReading,
  stopwatchShort,
  msUntilStopwatchChange,
  stopwatchCorner
} from '../src/utils/stopwatch.js';
import { readClockDevice } from '../src/utils/alarm.js';

// Any real moment; 0 is not one, and a stopwatch started at it reads as stopped.
const T = 1_790_000_000_000;

describe('running the stopwatch', () => {
  it('counts from when it was started', () => {
    const watch = started(reset(), 1000);
    assert.equal(isRunning(watch), true);
    assert.equal(elapsed(watch, 6000), 5000);
  });

  it('stops counting while paused, and carries on from there when resumed', () => {
    let watch = started(reset(), 1000);
    watch = paused(watch, 4000);
    assert.equal(elapsed(watch, 60_000), 3000);

    watch = started(watch, 100_000);
    assert.equal(elapsed(watch, 102_000), 5000);
  });

  // Worked out from the moment it started rather than ticked up, so time that
  // passed with nobody counting -- a phone asleep, a reload -- is not lost.
  it('is right after a long gap nobody was watching', () => {
    const watch = readStopwatch(JSON.parse(JSON.stringify(started(reset(), 1000))));
    assert.equal(elapsed(watch, 1000 + 3 * 60 * 60 * 1000), 3 * 60 * 60 * 1000);
  });

  it('starting a running stopwatch does not restart it', () => {
    const watch = started(reset(), 1000);
    assert.equal(elapsed(started(watch, 5000), 9000), 8000);
  });

  it('resets to nothing', () => {
    const watch = reset();
    assert.equal(isRunning(watch), false);
    assert.equal(elapsed(watch, 99_999), 0);
    assert.deepEqual(watch.laps, []);
  });
});

describe('laps', () => {
  it('lists the laps newest first, each with its own length and the total', () => {
    let watch = started(reset(), T);
    watch = lapped(watch, T + 10_000);
    watch = lapped(watch, T + 25_000);

    assert.deepEqual(lapRows(watch), [
      { number: 2, split: 15_000, total: 25_000 },
      { number: 1, split: 10_000, total: 10_000 }
    ]);
  });

  it('takes no lap while stopped', () => {
    const watch = lapped(paused(started(reset(), T), T + 5000), T + 9000);
    assert.equal(watch.laps.length, 0);
  });

  it('keeps a bounded number of laps', () => {
    let watch = started(reset(), T);
    for (let i = 1; i <= MAX_LAPS + 5; i += 1) watch = lapped(watch, T + i * 1000);
    assert.equal(watch.laps.length, MAX_LAPS);
  });
});

describe('readStopwatch', () => {
  it('is a stopped, empty stopwatch when nothing sensible was stored', () => {
    for (const stored of [null, undefined, 'x', { runningSince: 'soon', banked: -4, laps: 'many' }]) {
      const watch = readStopwatch(stored);
      assert.equal(isRunning(watch), false);
      assert.equal(elapsed(watch, 1e12), 0);
    }
  });

  // On this device only, beside the page -- it lives in the same memory.
  it('is kept in the block\'s device memory, which now knows the stopwatch page', () => {
    const device = readClockDevice(JSON.stringify({ page: 'stopwatch', stopwatch: started(reset(), 500) }));
    assert.equal(device.page, 'stopwatch');
    assert.equal(elapsed(device.stopwatch, 1500), 1000);
  });
});

describe('readings', () => {
  it('reads to the hundredth on its own page', () => {
    assert.equal(stopwatchReading(0), '00:00.00');
    assert.equal(stopwatchReading(5370), '00:05.37');
    assert.equal(stopwatchReading(12 * 60_000 + 3_004), '12:03.00');
    assert.equal(stopwatchReading(3_723_450), '1:02:03.45');
  });

  // Cut, not rounded: 0.999s has not yet been a second.
  it('never shows a moment that has not happened yet', () => {
    assert.equal(stopwatchReading(999), '00:00.99');
    assert.equal(stopwatchShort(999), '0:00');
  });

  it('reads to the second in a corner', () => {
    assert.equal(stopwatchShort(5_370), '0:05');
    assert.equal(stopwatchShort(754_000), '12:34');
    assert.equal(stopwatchShort(3_723_000), '1:02:03');
  });
});

describe('msUntilStopwatchChange', () => {
  it('does not wake for a stopwatch that is not running', () => {
    assert.equal(msUntilStopwatchChange(reset()), null);
    assert.equal(msUntilStopwatchChange(paused(started(reset(), T), T + 500)), null);
  });

  it('redraws often on its own page, where hundredths show', () => {
    assert.ok(msUntilStopwatchChange(started(reset(), T), { now: T + 10, fine: true }) <= 50);
  });

  // Aimed at the stopwatch's own next second, which is not the wall clock's.
  it('wakes once a second for the corner, on the stopwatch\'s second', () => {
    const watch = started(reset(), T);
    const wait = msUntilStopwatchChange(watch, { now: T + 1_700 });
    assert.ok(wait > 300 && wait < 320, `waited ${wait}ms`);
  });
});

describe('stopwatchCorner', () => {
  // "...on the other corner to click on": the way in, from any other page.
  it('is the way to the stopwatch from the clock and the alarm', () => {
    assert.equal(stopwatchCorner({ page: 'clock', stopwatch: reset() }).kind, 'icon');
    assert.equal(stopwatchCorner({ page: 'alarm', stopwatch: reset() }).kind, 'icon');
  });

  it('shows a running stopwatch from the other pages, the way the alarm corner shows the alarm', () => {
    const corner = stopwatchCorner({ page: 'clock', stopwatch: started(reset(), T), now: T + 65_000 });
    assert.deepEqual(corner, { kind: 'stopwatch', text: '1:05', running: true });
  });

  it('still shows a paused figure, so a stopwatch left paused is not forgotten', () => {
    const corner = stopwatchCorner({ page: 'alarm', stopwatch: paused(started(reset(), T), T + 9_000) });
    assert.deepEqual(corner, { kind: 'stopwatch', text: '0:09', running: false });
  });

  it('shows the time on the stopwatch page, as the alarm corner does on the alarm page', () => {
    const corner = stopwatchCorner({ page: 'stopwatch', stopwatch: started(reset(), T), clockTime: '14:05' });
    assert.deepEqual(corner, { kind: 'time', text: '14:05', running: false });
  });
});
