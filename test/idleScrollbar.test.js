import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scrollbarAlpha, installIdleScrollbars, SCROLLBAR_IDLE_MS, SCROLLBAR_FADE_MS } from '../src/utils/idleScrollbar.js';

// Asked 2026-11-21, and wanted -- not an accident: "the scrollbar thing
// should change to 0.2s and be the case for everywhere." Then, the same day:
// "make the scroll bar disappear in 0 sec and make the fade go a bit faster.
// like half time." (The fade had been 0.7 s; before that day it was 0.8 s in
// Page mode and 5 s in Single Note.)

test('a scrollbar starts to go as soon as the scrolling stops', () => {
  assert.equal(SCROLLBAR_IDLE_MS, 0);
  assert.equal(scrollbarAlpha(0), 1);
  assert.ok(scrollbarAlpha(50) < 1);
});

test('and fades out in 0.35 seconds, half the fade it had', () => {
  assert.equal(SCROLLBAR_FADE_MS, 350);
  const midway = scrollbarAlpha(SCROLLBAR_IDLE_MS + SCROLLBAR_FADE_MS / 2);
  assert.ok(midway > 0.3 && midway < 0.7, `half way through the fade it is half there (${midway})`);
  assert.equal(scrollbarAlpha(SCROLLBAR_IDLE_MS + SCROLLBAR_FADE_MS), 0);
});

// The deciding is not the doing (CLAUDE.md): what makes it real is the
// scroller being given its --sb-alpha, which app.css draws the thumb with.
function fakePage() {
  const listeners = {};
  const on = (type, fn) => { (listeners[type] ||= []).push(fn); };
  const off = (type, fn) => { listeners[type] = (listeners[type] || []).filter(f => f !== fn); };
  const element = () => {
    const props = {};
    return {
      nodeType: 1,
      parentElement: null,
      style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: k => { delete props[k]; } },
      props
    };
  };
  const view = { addEventListener: on, removeEventListener: off, getComputedStyle: () => ({ overflowY: 'auto', overflowX: 'hidden' }) };
  const doc = { defaultView: view, addEventListener: on, removeEventListener: off, scrollingElement: element() };
  const fire = (type, event) => (listeners[type] || []).forEach(fn => fn(event));
  return { doc, element, fire };
}

test('every scroller in the app shows its bar while scrolled, and only that one; then it goes', () => {
  const { doc, element, fire } = fakePage();
  let clock = 0;
  const frames = [];
  const stop = installIdleScrollbars(doc, { now: () => clock, frame: cb => frames.push(cb) });
  const runFrames = () => { while (frames.length) frames.shift()(); };

  const list = element();
  const other = element();
  fire('scroll', { target: list });
  assert.equal(list.props['--sb-alpha'], '1');
  assert.equal(other.props['--sb-alpha'], undefined);

  clock = SCROLLBAR_IDLE_MS + SCROLLBAR_FADE_MS / 2;
  frames.shift()();
  const fading = Number(list.props['--sb-alpha']);
  assert.ok(fading > 0 && fading < 1, 'fading, not gone at once');

  clock = SCROLLBAR_IDLE_MS + SCROLLBAR_FADE_MS + 1;
  runFrames();
  assert.equal(list.props['--sb-alpha'], undefined, 'gone: back to the 0 every element starts at');
  stop();
});
