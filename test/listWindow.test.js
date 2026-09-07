import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OVERSCAN, windowRange } from '../src/utils/listWindow.js';

const ROW = 40;
const VIEW = 800; // 20 rows on screen

test('an empty list renders nothing and reserves nothing', () => {
  assert.deepEqual(windowRange({ count: 0, rowHeight: ROW, viewportHeight: VIEW }), {
    start: 0, end: 0, padTop: 0, padBottom: 0
  });
});

test('at the top it starts at the first row, never before it', () => {
  const { start, padTop } = windowRange({ scrollTop: 0, viewportHeight: VIEW, rowHeight: ROW, count: 5000 });
  assert.equal(start, 0, 'no negative start despite the overscan');
  assert.equal(padTop, 0);
});

test('it renders the screenful plus a margin, not the library', () => {
  const { start, end } = windowRange({ scrollTop: 0, viewportHeight: VIEW, rowHeight: ROW, count: 5000 });
  const rendered = end - start;
  assert.ok(rendered < 60, `expected a screenful, got ${rendered}`);
  assert.ok(rendered >= 20, `expected to cover the viewport, got ${rendered}`);
});

test('scrolling moves the window and the padding follows it', () => {
  const { start, end, padTop, padBottom } = windowRange({
    scrollTop: 40 * 100, viewportHeight: VIEW, rowHeight: ROW, count: 5000
  });
  assert.equal(start, 100 - OVERSCAN);
  assert.equal(padTop, (100 - OVERSCAN) * ROW);
  // the whole list keeps the height it would have had
  assert.equal(padTop + (end - start) * ROW + padBottom, 5000 * ROW);
});

test('the list can be scrolled to its very end', () => {
  const count = 5000;
  const { end, padBottom } = windowRange({
    scrollTop: count * ROW - VIEW, viewportHeight: VIEW, rowHeight: ROW, count
  });
  assert.equal(end, count, 'the last row must be reachable');
  assert.equal(padBottom, 0);
});

test('scrolling past the end does not run off the list', () => {
  const count = 100;
  const { start, end, padBottom } = windowRange({
    scrollTop: 999999, viewportHeight: VIEW, rowHeight: ROW, count
  });
  assert.ok(end <= count);
  assert.ok(start <= end);
  assert.equal(padBottom, 0);
});

test('a list shorter than the screen renders whole, with no padding', () => {
  const { start, end, padTop, padBottom } = windowRange({
    scrollTop: 0, viewportHeight: VIEW, rowHeight: ROW, count: 4
  });
  assert.equal(start, 0);
  assert.equal(end, 4);
  assert.equal(padTop, 0);
  assert.equal(padBottom, 0);
});

// Asked before anything has been measured; dividing by it would give Infinity.
test('an unmeasured row height renders a first screenful instead of NaN', () => {
  for (const bad of [0, -10, NaN, undefined, null, 'tall']) {
    const { start, end, padTop, padBottom } = windowRange({
      scrollTop: 0, viewportHeight: VIEW, rowHeight: bad, count: 5000
    });
    assert.equal(start, 0, `rowHeight ${bad}`);
    assert.ok(end > 0 && Number.isFinite(end), `rowHeight ${bad}`);
    assert.ok(Number.isFinite(padTop) && Number.isFinite(padBottom), `rowHeight ${bad}`);
  }
});

test('nonsense scroll positions are treated as the top', () => {
  const { start } = windowRange({ scrollTop: NaN, viewportHeight: VIEW, rowHeight: ROW, count: 500 });
  assert.equal(start, 0);
  const negative = windowRange({ scrollTop: -500, viewportHeight: VIEW, rowHeight: ROW, count: 500 });
  assert.equal(negative.start, 0);
});

test('called with nothing at all, it does not throw', () => {
  assert.deepEqual(windowRange(), { start: 0, end: 0, padTop: 0, padBottom: 0 });
});
