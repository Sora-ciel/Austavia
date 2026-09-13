import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fitControls, CONTROL_PRIORITY, CONTROL_ORDER } from '../src/utils/controlsOverflow.js';

// Named after the request: "as the screen size gets smaller, more and more
// buttons should go to the menu button — at first the ones that are least
// likely to be used", down to phone size, without the bar ever taking two
// lines.

const widths = {
  mode: 146,
  addBlock: 122,
  undo: 88,
  redo: 85,
  fileName: 135,
  moveBlock: 116,
  bg: 45,
  export: 96,
  import: 142,
  clear: 85
};
const present = Object.keys(widths);
const at = (available) => fitControls({ present, widths, available, gap: 8, menuWidth: 90 });

test('on a wide screen every control is on the bar', () => {
  const { bar, menu } = at(4000);
  assert.deepEqual(menu, []);
  assert.equal(bar.length, present.length);
});

test('as the screen narrows, more of the bar goes behind the menu', () => {
  const counts = [1400, 1200, 1000, 800, 600].map((w) => at(w).menu.length);
  for (let i = 1; i < counts.length; i += 1) {
    assert.ok(counts[i] >= counts[i - 1], `narrower must never show more: ${counts}`);
  }
  assert.ok(counts.at(-1) > counts[0], 'and a small screen must hide more than a large one');
});

test('the bar reads the same order however many controls are on it', () => {
  for (const width of [4000, 1400, 1200, 1000, 900, 800]) {
    const { bar } = at(width);
    const places = bar.map((id) => CONTROL_ORDER.indexOf(id));
    assert.deepEqual(
      places,
      [...places].sort((a, b) => a - b),
      `at ${width}px the bar rearranged itself: ${bar.join(', ')}`
    );
  }
});

test('the least likely to be used are the first to go', () => {
  // Just too narrow for everything: whatever leaves is the tail of the priority
  // list, and Clear — the rarest, and the destructive one — is always in it.
  const full = fitControls({ present, widths, available: 4000 });
  const total = Object.values(widths).reduce((a, b) => a + b, 0) + 8 * (present.length - 1);
  const { menu } = at(total - 1);

  assert.equal(full.menu.length, 0);
  assert.ok(menu.length >= 1);
  assert.ok(menu.includes('clear'));

  const byPriority = [...menu].sort(
    (a, b) => CONTROL_PRIORITY.indexOf(a) - CONTROL_PRIORITY.indexOf(b)
  );
  assert.deepEqual(byPriority, CONTROL_PRIORITY.slice(-menu.length));
});

test('a rare button never sits on the bar while a common one is in the menu', () => {
  for (const width of [1400, 1200, 1100, 1000, 900, 800, 700, 600, 500]) {
    const { bar, menu } = at(width);
    const lastOnBar = Math.max(...bar.map((id) => CONTROL_PRIORITY.indexOf(id)));
    for (const id of menu) {
      assert.ok(
        CONTROL_PRIORITY.indexOf(id) > lastOnBar,
        `at ${width}px, ${id} is in the menu but something less used is on the bar`
      );
    }
  }
});

test('what stays on the bar fits on one line, menu button included', () => {
  for (const width of [1400, 1200, 1100, 1000, 900, 800, 700]) {
    const { bar, menu } = at(width);
    const used = bar.reduce((total, id, i) => total + widths[id] + (i ? 8 : 0), 0);
    const needed = menu.length ? used + 8 + 90 : used;
    assert.ok(
      needed <= width || bar.length === 1,
      `at ${width}px the bar needs ${needed}px and would wrap`
    );
  }
});

test('the bar is never empty, however narrow the window', () => {
  const { bar } = at(10);
  assert.deepEqual(bar, ['mode'], 'getting to another mode is the one thing that must stay');
});

test('before anything has been measured, everything is shown', () => {
  const { bar, menu } = fitControls({ present, widths: {}, available: 300 });
  assert.deepEqual(menu, [], 'showing too much for one frame beats hiding what would have fitted');
  assert.equal(bar.length, present.length);
});

test('a control this mode does not have is not placed anywhere', () => {
  const { bar, menu } = fitControls({
    present: ['mode', 'addBlock'],
    widths,
    available: 4000
  });
  assert.deepEqual(bar, ['mode', 'addBlock']);
  assert.deepEqual(menu, []);
});

test('a control nobody has ranked keeps its place on the bar', () => {
  const { bar } = fitControls({
    present: ['mode', 'somethingNew'],
    widths: { mode: 100, somethingNew: 100 },
    available: 4000
  });
  assert.ok(bar.includes('somethingNew'), 'new is more likely than unimportant');
});

test('called with nothing, it decides nothing', () => {
  const { bar, menu } = fitControls();
  assert.deepEqual(bar, []);
  assert.deepEqual(menu, []);
});
