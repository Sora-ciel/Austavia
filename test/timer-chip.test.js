// The timer on the app's toolbar.
//
// Asked for on 2026-09-29: "it would be great for the timer to be on the
// controls when you're in the app, and if you click on it, it shows the
// buttons." What shows, and in what order, was decided from that.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { activeTimers } from '../src/utils/timerChip.js';
import { readTimer, startTimer, pauseTimer } from '../src/utils/countdown.js';

const T = 1_790_000_000_000;
const MIN = 60_000;
const clock = id => ({ id, type: 'clock' });

describe('activeTimers', () => {
  it('shows nothing when no timer is in use -- a timer set but not started included', () => {
    assert.deepEqual(activeTimers({ blocks: [clock('a')], devices: { a: { timer: readTimer(null) } }, now: T }), []);
  });

  it('shows a running timer with what it has left', () => {
    const devices = { a: { timer: startTimer(readTimer(null), T) } };
    assert.deepEqual(activeTimers({ blocks: [clock('a')], devices, now: T + MIN }), [
      { blockId: 'a', phase: 'running', left: 4 * MIN, duration: 5 * MIN }
    ]);
  });

  it('puts the most pressing first: ringing, then the soonest to end, then paused', () => {
    const devices = {
      paused: { timer: pauseTimer(startTimer(readTimer(null), T), T + MIN) },
      later: { timer: startTimer({ duration: 10 * MIN }, T) },
      sooner: { timer: startTimer(readTimer(null), T) },
      rung: { timer: startTimer({ duration: MIN }, T - 2 * MIN) }
    };
    const blocks = ['paused', 'later', 'sooner', 'rung'].map(clock);
    assert.deepEqual(activeTimers({ blocks, devices, now: T + 2 * MIN }).map(t => t.blockId), ['rung', 'sooner', 'later', 'paused']);
  });

  it("a timer stopped from the open panel stays in it, set back, so it can be started again", () => {
    const devices = { a: { timer: readTimer(null) }, b: { timer: startTimer(readTimer(null), T) } };
    const blocks = [clock('a'), clock('b')];
    assert.deepEqual(activeTimers({ blocks, devices, now: T + MIN, keep: ['a'] }), [
      { blockId: 'b', phase: 'running', left: 4 * MIN, duration: 5 * MIN },
      { blockId: 'a', phase: 'stopped', left: 5 * MIN, duration: 5 * MIN }
    ]);
    assert.deepEqual(activeTimers({ blocks, devices, now: T + MIN }).map(t => t.blockId), ['b']);
  });

  it('ignores anything that is not a clock', () => {
    const devices = { x: { timer: startTimer(readTimer(null), T) } };
    assert.deepEqual(activeTimers({ blocks: [{ id: 'x', type: 'text' }], devices, now: T + 1 }), []);
  });
});
