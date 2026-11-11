import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  readLayout, writeLayout, normalizeLayout, orderedModes, offeredModes, neighbourMode,
  movedMode, withModeHidden, swipeDirection, DEFAULT_LAYOUT
} from '../src/utils/controlsLayout.js';

// Asked 2026-11-10: the bar at the bottom on a phone, a column of modes on a
// computer, modes in order or hidden -- and "controls layout ... where for
// phone and pc we can change the layout and basically go back to the way
// things were before our update ... saved per device for now."

const MODES = ['default', 'simple', 'single', 'page', 'habit', 'task', 'calendar', 'playlist'];
function memoryStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

test('the new layout is the default, and the old one can be chosen back, on this device', () => {
  const storage = memoryStorage();
  assert.deepEqual(readLayout(storage), { ...DEFAULT_LAYOUT });
  writeLayout(storage, { phone: 'top', computer: 'top' });
  assert.equal(readLayout(storage).phone, 'top');
  assert.equal(readLayout(storage).computer, 'top');
  assert.equal(normalizeLayout({ phone: 'sideways' }).phone, 'bottom');
});

test('modes can be put in order, and a mode added later still shows, after them', () => {
  const layout = movedMode(MODES, {}, 'calendar', -1);
  assert.deepEqual(orderedModes(MODES, layout).slice(5, 7), ['calendar', 'task']);
  assert.deepEqual(orderedModes([...MODES, 'newmode'], { order: ['playlist'] })[0], 'playlist');
  assert.equal(orderedModes([...MODES, 'newmode'], { order: ['playlist'] }).at(-1), 'newmode');
});

test('a hidden mode is not offered -- unless it is the one open', () => {
  const layout = withModeHidden(MODES, {}, 'habit', true);
  assert.ok(!offeredModes(MODES, layout, 'default').includes('habit'));
  assert.ok(offeredModes(MODES, layout, 'habit').includes('habit'));
  const all = MODES.reduce((l, id) => withModeHidden(MODES, l, id, true), {});
  assert.equal(all.hidden.length, MODES.length - 1, 'one always stays');
});

test('a swipe along the bar goes to the next or previous mode, round the ends, skipping hidden ones', () => {
  const layout = withModeHidden(MODES, {}, 'simple', true);
  assert.equal(neighbourMode(MODES, layout, 'default', 1), 'single');
  assert.equal(neighbourMode(MODES, layout, 'default', -1), 'playlist');
  assert.equal(swipeDirection(-80, 10), 1);
  assert.equal(swipeDirection(80, 10), -1);
  assert.equal(swipeDirection(30, 5), 0, 'too short');
  assert.equal(swipeDirection(70, 60), 0, 'more down than across');
});

import { slideSteps, modeAfterSteps } from '../src/utils/controlsLayout.js';

// Asked 2026-11-10: "slide through multiple modes in one movement if we do it
// slow. and show the name of the mode we'll use with its icon while we slide."
test('a slide along the bar goes through a mode for every step of it, either way', () => {
  assert.equal(slideSteps(-30, 2), 0);
  assert.equal(slideSteps(-70, 2), 1);
  assert.equal(slideSteps(-200, 5), 3);
  assert.equal(slideSteps(140, 5), -2);
  assert.equal(slideSteps(-20, 80), null, 'more down than across is not a slide');
  assert.equal(modeAfterSteps(MODES, {}, 'default', 3), 'page');
  assert.equal(modeAfterSteps(MODES, {}, 'default', -1), 'playlist');
  assert.equal(modeAfterSteps(MODES, {}, 'task', 0), 'task');
});

// Asked 2026-11-10: two ways to change mode from the bar, to compare --
// "always at the same place each mode and if you went back to the middle you
// stay on the mode you were", or "a slide from the controls but then up and
// it shows all the modes ... you just have to let go your finger on the mode".
import { stripLayout, stripPick, gestureStart } from '../src/utils/controlsLayout.js';

test('in the strip every mode is always at the same place, in order, with a space in the middle that keeps the open one', () => {
  const layout = stripLayout(8, 390);
  assert.equal(layout.slots.length, 8);
  const middle = (layout.space.left + layout.space.right) / 2;
  assert.equal(stripPick(middle, layout), null, 'the space: stay where you are');
  assert.equal(stripPick(layout.slots[0].left + 2, layout), 0);
  assert.equal(stripPick(layout.slots[3].left + 2, layout), 3);
  assert.equal(stripPick(layout.slots[4].left + 2, layout), 4, 'the first after the space');
  assert.equal(stripPick(1000, layout), 7);
  assert.ok(layout.slots[3].left + layout.slots[3].width <= layout.space.left + 0.001);
  assert.ok(layout.slots[4].left >= layout.space.right - 0.001);
  // The same places whatever mode is open: nothing here depends on it.
  assert.deepEqual(stripLayout(8, 390), layout);
});

test('a finger going up from the bar opens the sheet, across the strip', () => {
  assert.equal(gestureStart(3, -4), null);
  assert.equal(gestureStart(4, -40), 'up');
  assert.equal(gestureStart(-40, -6), 'across');
  assert.equal(gestureStart(2, 40), null, 'down is nothing');
  assert.equal(normalizeLayout({ modeGesture: 'sheet' }).modeGesture, 'sheet');
  assert.equal(normalizeLayout({ modeGesture: 'wiggle' }).modeGesture, 'sheet', 'the default, the slide up');
  assert.equal(normalizeLayout({ computer: 'auto' }).computer, 'auto', 'the column that hides is a choice');
});
