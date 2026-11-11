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
