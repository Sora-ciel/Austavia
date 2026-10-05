// The timer on the app's toolbar.
//
// Asked for on 2026-09-29: "it would be great for the timer to be on the
// controls when you're in the app, and if you click on it, it shows the
// buttons." What shows, and in what order, was decided from that.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { activeTimers, timerPlace, timerNotice, sameNotice, PHONE_WIDTH } from '../src/utils/timerChip.js';
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

// Asked for on 2026-09-29: "on phone I believe the timer should be a
// notification instead, but not show on controls, cause that would take too
// much space".
describe('where the timer shows', () => {
  it('on the toolbar on a computer', () => {
    assert.equal(timerPlace({ width: 1400 }), 'toolbar');
  });

  it('in the notification shade in the Android app, never on the toolbar', () => {
    assert.equal(timerPlace({ nativeAndroid: true, width: 400 }), 'notification');
    assert.equal(timerPlace({ nativeAndroid: true, width: 1400 }), 'notification');
  });

  it('not on the toolbar of a phone-sized browser either', () => {
    assert.equal(timerPlace({ width: PHONE_WIDTH }), 'none');
  });
});

describe('what the notification says', () => {
  it('nothing when no timer is in use', () => {
    assert.equal(timerNotice([], {}), null);
  });

  it('a running timer as the moment it ends, for Android to count down to', () => {
    const timer = startTimer(readTimer(null), T);
    const timers = activeTimers({ blocks: [clock('a')], devices: { a: { timer } }, now: T + MIN });
    assert.deepEqual(timerNotice(timers, { a: { timer } }), {
      blockId: 'a', phase: 'running', endsAt: String(T + 5 * MIN), title: 'Timer', text: '',
      remaining: '', background: '', textColor: '', accent: ''
    });
  });

  it('a paused one with what it has left, and the others counted in the title', () => {
    const devices = {
      a: { timer: pauseTimer(startTimer(readTimer(null), T), T + MIN) },
      b: { timer: pauseTimer(startTimer(readTimer(null), T), T + 2 * MIN) }
    };
    const timers = activeTimers({ blocks: [clock('a'), clock('b')], devices, now: T + 3 * MIN });
    const notice = timerNotice(timers, devices);
    assert.equal(notice.blockId, 'b');
    assert.equal(notice.text, 'Paused · 3:00');
    assert.equal(notice.remaining, '3:00', 'shown where the countdown would be');
    assert.equal(notice.title, 'Timer (+1 more)');
    assert.equal(notice.endsAt, '0');
  });

  it("says Time's up when one is ringing", () => {
    const devices = { a: { timer: startTimer({ duration: MIN }, T) } };
    const timers = activeTimers({ blocks: [clock('a')], devices, now: T + MIN + 1000 });
    assert.equal(timerNotice(timers, devices).text, "Time's up");
  });

  it('a stopped one kept in the toolbar panel is not in the shade', () => {
    assert.equal(timerNotice([{ blockId: 'a', phase: 'stopped', left: MIN }], {}), null);
  });

  // Asked for on 2026-10-05: "hopefully it follows the colour of the themes".
  it("carries the theme's dialog colours, solid, for Android to paint with", () => {
    const timer = startTimer(readTimer(null), T);
    const timers = activeTimers({ blocks: [clock('a')], devices: { a: { timer } }, now: T + MIN });
    const notice = timerNotice(timers, { a: { timer } }, { bg: 'rgba(12, 12, 14, 0.78)', text: '#ff5cc8', accent: '#fff' });
    assert.deepEqual([notice.background, notice.textColor, notice.accent], ['#FF0C0C0E', '#FFFF5CC8', '#FFFFFFFF']);
  });

  it('a theme change redraws the notification', () => {
    const a = { blockId: 'a', phase: 'running', endsAt: '5', title: 'Timer', text: '', background: '#FF000000' };
    assert.ok(!sameNotice(a, { ...a, background: '#FF111111' }));
  });

  it('tells two notices that draw the same apart from two that do not', () => {
    const a = { blockId: 'a', phase: 'running', endsAt: '5', title: 'Timer', text: '' };
    assert.ok(sameNotice(a, { ...a }));
    assert.ok(!sameNotice(a, { ...a, endsAt: '6' }));
    assert.ok(sameNotice(null, null));
    assert.ok(!sameNotice(a, null));
  });
});
