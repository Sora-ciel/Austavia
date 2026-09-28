// The always-on-top windows for a clock block's timer and alarm (Windows app).
//
// Asked for on 2026-09-28: "a pop-up for the timers that stays in front of
// every windowed app at all times on Windows, when you start a timer", then
// "think about what that little pop-up should have and how it should behave
// for maximum ease of use". The behaviour below is what was decided from that;
// each line of it was a choice, so change it as one.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  popupLabel,
  popupsWanted,
  hiddenToForget,
  keptToForget,
  popupPosition,
  timerFractionLeft,
  POPUP_WIDTH,
  POPUP_HEIGHT,
  POPUP_GAP,
  POPUP_MARGIN
} from '../src/utils/clockPopups.js';
import { readTimer, startTimer, pauseTimer } from '../src/utils/countdown.js';

const T = 1_790_000_000_000;
const MIN = 60_000;
const clock = (id, extra = {}) => ({ id, type: 'clock', ...extra });

describe('which pop-ups are open', () => {
  const running = { timer: startTimer(readTimer(null), T) };

  it('opens one when a timer starts', () => {
    const wanted = popupsWanted({ blocks: [clock('a')], devices: { a: running }, now: T + 1000 });
    assert.deepEqual(wanted.map(p => [p.blockId, p.kind]), [['a', 'timer']]);
  });

  it('keeps it while the timer is paused', () => {
    const devices = { a: { timer: pauseTimer(running.timer, T + MIN) } };
    assert.equal(popupsWanted({ blocks: [clock('a')], devices, now: T + 2 * MIN }).length, 1);
  });

  it('closes it when the timer is stopped or reset', () => {
    assert.equal(popupsWanted({ blocks: [clock('a')], devices: { a: {} }, now: T }).length, 0);
  });

  it('stays hidden for the run once hidden by hand', () => {
    const hidden = new Set([popupLabel('a', 'timer')]);
    assert.equal(popupsWanted({ blocks: [clock('a')], devices: { a: running }, now: T + 1000, hidden }).length, 0);
  });

  // The moment it exists for.
  it('comes back when time is up, even if it was hidden', () => {
    const hidden = new Set([popupLabel('a', 'timer')]);
    const wanted = popupsWanted({ blocks: [clock('a')], devices: { a: running }, now: T + 5 * MIN + 1000, hidden });
    assert.deepEqual(wanted.map(p => p.kind), ['timer']);
  });

  it('opens one for a ringing alarm, so it is not missed with the app minimised', () => {
    const at = new Date(2026, 8, 28, 7, 30).getTime();
    const blocks = [clock('b', { alarmTime: '07:30', alarmEnabled: true, hour12: true })];
    const wanted = popupsWanted({ blocks, devices: {}, now: at + 1000 });
    assert.deepEqual(wanted.map(p => [p.kind, p.time, p.hour12]), [['alarm', '07:30', true]]);
    assert.equal(popupsWanted({ blocks, devices: {}, now: at - 1000 }).length, 0);
  });

  it('gives each running timer its own window', () => {
    const wanted = popupsWanted({ blocks: [clock('a'), clock('b')], devices: { a: running, b: running }, now: T + 1 });
    assert.deepEqual(wanted.map(p => p.label), [popupLabel('a', 'timer'), popupLabel('b', 'timer')]);
  });

  it('ignores anything that is not a clock', () => {
    assert.equal(popupsWanted({ blocks: [{ id: 'x', type: 'text' }], devices: { x: running } }).length, 0);
  });
});

// Asked for once it had been tried: "clicking Stop on the pop-up shouldn't
// close the pop-up; it should put back the timer that was used at first so
// you can restart it from the pop-up itself."
describe('Stop in the pop-up keeps the pop-up', () => {
  const kept = new Set([popupLabel('a', 'timer')]);

  it('stays open, ready to start again, after its own Stop', () => {
    const wanted = popupsWanted({ blocks: [clock('a')], devices: { a: {} }, now: T, kept });
    assert.deepEqual(wanted.map(p => [p.blockId, p.kind]), [['a', 'timer']]);
  });

  it('still closes when stopped in the app, where nobody asked to keep it', () => {
    assert.equal(popupsWanted({ blocks: [clock('a')], devices: { a: {} }, now: T }).length, 0);
  });

  it('forgets the keep once the clock is gone', () => {
    assert.deepEqual(keptToForget({ blocks: [], kept }), [popupLabel('a', 'timer')]);
    assert.deepEqual(keptToForget({ blocks: [clock('a')], kept }), []);
  });
});

describe('hiding lasts one run', () => {
  it('forgets a hide once the timer it hid is no longer running', () => {
    const hidden = new Set([popupLabel('a', 'timer'), popupLabel('b', 'timer')]);
    const devices = { a: { timer: startTimer(readTimer(null), T) }, b: {} };
    assert.deepEqual(hiddenToForget({ blocks: [clock('a'), clock('b')], devices, now: T + 1, hidden }), [popupLabel('b', 'timer')]);
  });
});

describe('where it goes', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

  it('sits in the bottom-right corner, above the taskbar', () => {
    assert.deepEqual(popupPosition({ workArea }), {
      x: 1920 - POPUP_WIDTH - POPUP_MARGIN,
      y: 1040 - POPUP_HEIGHT - POPUP_MARGIN
    });
  });

  it('stacks the next ones upwards', () => {
    const first = popupPosition({ workArea, index: 0 });
    const second = popupPosition({ workArea, index: 1 });
    assert.equal(second.y, first.y - POPUP_HEIGHT - POPUP_GAP);
    assert.equal(second.x, first.x);
  });

  it('goes back where it was last dragged to', () => {
    assert.deepEqual(popupPosition({ workArea, saved: { x: 300, y: 200 } }), { x: 300, y: 200 });
  });

  it('never lands off the screen', () => {
    const off = popupPosition({ workArea, saved: { x: 5000, y: -300 } });
    assert.equal(off.x, 1920 - POPUP_WIDTH);
    assert.equal(off.y, 0);
  });
});

it('reads how much of a timer is left, for the bar', () => {
  assert.equal(timerFractionLeft(30_000, 60_000), 0.5);
  assert.equal(timerFractionLeft(0, 60_000), 0);
  assert.equal(timerFractionLeft(10, 0), 0);
});
