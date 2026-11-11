// Timed habits and objectives in the desktop pop-up, and how long a finished
// one sounds.
//
// Asked 2026-11-10, for Linux and Windows: "the same pop up of timer but pop
// up we can put for the timer of habits" -- the timer's pop-up, reused, not a
// second one. And for the sound: "make it a sound that continues till it's put
// close or 2min passed". Both were wanted; change them as decisions.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { popupsWanted, hiddenToForget, keptToForget, goalPopupLabel } from '../src/utils/clockPopups.js';
import { goalTimers, goalKey, HABITS_OWNER } from '../src/utils/goalNotices.js';
import { setGoal, startTimer, pauseTimer } from '../src/utils/taskGoals.js';
import { withHabitGoal } from '../src/utils/habitGoals.js';
import { stillSounding, RING_SOUND_MS } from '../src/utils/ringTone.js';

const SEC = 1000;
const t0 = new Date(2026, 10, 10, 9, 0).getTime();

function habitsWithTimer({ running = true } = {}) {
  let habits = withHabitGoal([{ id: 'read', name: 'Read', log: {} }], 'read', (t, at) => setGoal(t, { kind: 'time', target: 600 }, at), t0);
  habits = withHabitGoal(habits, 'read', (t, at) => startTimer(t, at), t0);
  if (!running) habits = withHabitGoal(habits, 'read', (t, at) => pauseTimer(t, at), t0 + 60 * SEC);
  return habits;
}
const key = goalKey(HABITS_OWNER, 'read');
const label = goalPopupLabel(key);

test('a habit with a running timer gets the timer\'s pop-up when Austavia is behind', () => {
  const goals = goalTimers({ habits: habitsWithTimer(), now: t0 + 30 * SEC });
  assert.deepEqual(popupsWanted({ goals, now: t0 + 30 * SEC }), [{ goalKey: key, kind: 'goal', label }]);
  assert.deepEqual(popupsWanted({ goals, now: t0 + 30 * SEC, appInFront: true }), []);
});

test('the habit\'s pop-up knows its whole length, for the bar along its bottom', () => {
  const [entry] = goalTimers({ habits: habitsWithTimer(), now: t0 + 30 * SEC });
  assert.equal(entry.duration, 600 * SEC);
  assert.equal(entry.endsAt, t0 + 600 * SEC);
});

test('hidden by its ×, it stays hidden while it runs and comes back when time is up', () => {
  const hidden = new Set([label]);
  const runningGoals = goalTimers({ habits: habitsWithTimer(), now: t0 + 30 * SEC });
  assert.deepEqual(popupsWanted({ goals: runningGoals, hidden }), []);
  const rungGoals = goalTimers({ habits: habitsWithTimer(), now: t0 + 601 * SEC });
  assert.equal(rungGoals[0].phase, 'ringing');
  assert.equal(popupsWanted({ goals: rungGoals, hidden }).length, 1);
  // Its hide is forgotten once the habit is no longer running or ringing.
  assert.deepEqual(hiddenToForget({ goals: [], hidden }), [label]);
  assert.deepEqual(hiddenToForget({ goals: runningGoals, hidden }), []);
});

test('paused from its own pop-up, it stays there, ready to resume', () => {
  const habits = habitsWithTimer({ running: false });
  assert.deepEqual(goalTimers({ habits, now: t0 + 90 * SEC }), [], 'a paused habit has no pop-up of its own accord');
  const kept = new Set([label]);
  const goals = goalTimers({ habits, now: t0 + 90 * SEC, keepPaused: k => kept.has(goalPopupLabel(k)) });
  assert.equal(goals[0].phase, 'paused');
  assert.equal(goals[0].left, 540 * SEC);
  assert.equal(popupsWanted({ goals, kept }).length, 1);
  assert.deepEqual(keptToForget({ goals, kept }), []);
  assert.deepEqual(keptToForget({ goals: [], kept }), [label], 'forgotten once the habit is done or gone');
});

test('a finished timer sounds until it is stopped, or for two minutes', () => {
  assert.equal(RING_SOUND_MS, 2 * 60 * SEC);
  assert.equal(stillSounding(t0, t0), true);
  assert.equal(stillSounding(t0, t0 + 119 * SEC), true);
  assert.equal(stillSounding(t0, t0 + 120 * SEC), false);
  assert.equal(stillSounding(t0, t0 - SEC), false, 'not before it has finished');
  assert.equal(stillSounding(0, t0), false);
});

// Linux made no window smaller than 200 by 200 (measured 2026-11-10), so the
// pop-up there is that window, see-through, with the card in its corner.
import { popupPosition, popupWindowSize, POPUP_WIDTH, POPUP_HEIGHT, POPUP_MARGIN } from '../src/utils/clockPopups.js';

test('on Linux the pop-up\'s card still sits in the bottom-right corner, where it does elsewhere', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
  const plain = popupPosition({ workArea, size: popupWindowSize(false) });
  const size = popupWindowSize(true);
  const linux = popupPosition({ workArea, size });
  // The card is the window's top-right corner, so its edges land where the plain window's do.
  assert.equal(linux.x + size.width, plain.x + POPUP_WIDTH);
  assert.equal(linux.y, plain.y);
  assert.equal(plain.y + POPUP_HEIGHT, workArea.height - POPUP_MARGIN);
});

test('on Linux the card can be put right up at the top of the screen', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
  const atTop = popupPosition({ workArea, size: popupWindowSize(true), saved: { x: 500, y: 0 } });
  assert.equal(atTop.y, 0);
  const atBottom = popupPosition({ workArea, size: popupWindowSize(true), saved: { x: 500, y: 2000 } });
  assert.equal(atBottom.y, workArea.height - POPUP_HEIGHT, 'and down to the bottom, its see-through part below the screen');
});

import { beepWav } from '../src/utils/ringTone.js';

test('the ring is the whole two minutes of beeps in one sound, so nothing repeating can slow it', () => {
  // Reported twice on 2026-11-10: the beeps slowed after a few seconds, first
  // started by a timer, then as a looping one-second sound.
  const rate = 8000;
  const whole = new DataView(beepWav(rate, RING_SOUND_MS / 1000).buffer);
  assert.equal(whole.getUint32(40, true) / 2, rate * 120, 'two minutes of it');
  const late = t => Math.abs(whole.getInt16(44 + Math.round(t * rate) * 2, true));
  let lastBeep = 0;
  for (let t = 119; t < 119.1; t += 1 / rate) lastBeep = Math.max(lastBeep, late(t));
  assert.ok(lastBeep > 1000, 'still beeping on time in the last second');

  const wav = beepWav(rate);
  const view = new DataView(wav.buffer);
  const at = seconds => Math.abs(view.getInt16(44 + Math.round(seconds * rate) * 2, true));
  const loudest = (from, to) => { let m = 0; for (let t = from; t < to; t += 1 / rate) m = Math.max(m, at(t)); return m; };
  assert.ok(loudest(0, 0.1) > 1000, 'a first beep');
  assert.ok(loudest(0.22, 0.32) > 1000, 'a second beep');
  assert.ok(loudest(0.5, 0.99) === 0, 'then quiet until it starts again');
});

import { RING_LOUDNESS } from '../src/utils/ringTone.js';

test('the ring is at 80% of full strength -- "make the ring volume be 80%"', () => {
  assert.equal(RING_LOUDNESS, 0.8);
  const view = new DataView(beepWav(22050).buffer);
  let loudest = 0;
  for (let i = 44; i < 44 + 22050 * 2; i += 2) loudest = Math.max(loudest, Math.abs(view.getInt16(i, true)));
  assert.ok(loudest > 0.75 * 32767 && loudest <= 0.8 * 32767 + 1, 'the beep itself peaks there');
});

// Asked 2026-11-11: "in habits when the habit is counted in time add a button
// to activate or deactivate pop up". On by default, per device, as the clock
// block's switch is.
import { goalPopupOn, setGoalPopup } from '../src/utils/clockPopups.js';

test('a timed habit\'s pop-up can be switched off, and then never opens -- not even at Time\'s up', () => {
  const store = new Map();
  const storage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  assert.equal(goalPopupOn(storage, key), true, 'on until it is switched off');
  setGoalPopup(storage, key, false);
  assert.equal(goalPopupOn(storage, key), false);
  const off = new Set([label]);
  assert.deepEqual(popupsWanted({ goals: goalTimers({ habits: habitsWithTimer(), now: t0 + 30 * SEC }), off }), []);
  assert.deepEqual(popupsWanted({ goals: goalTimers({ habits: habitsWithTimer(), now: t0 + 601 * SEC }), off }), []);
  setGoalPopup(storage, key, true);
  assert.equal(goalPopupOn(storage, key), true, 'and on again');
});
