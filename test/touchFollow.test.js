// Asked 2026-11-21: "On phone the swiping of modes should never be blocked
// by anything, even the sync." A sync redraws what is under the finger, and a
// touch's events stay with the element it began on -- taken out of the page,
// they no longer reach the window. These say the slide is followed anyway.
import test from 'node:test';
import assert from 'node:assert/strict';
import { followTouch } from '../src/utils/touchFollow.js';

function touch(type) {
  return new Event(type, { cancelable: true });
}

test('a slide to the next mode is still followed after a sync redraws the element it began on', () => {
  const page = new EventTarget();
  const startedOn = new EventTarget(); // taken out of the page: nothing bubbles to `page`
  const seen = [];
  page.addEventListener('touchmove', () => seen.push('window heard'));
  followTouch(startedOn, { move: () => seen.push('move'), end: () => seen.push('end') });
  startedOn.dispatchEvent(touch('touchmove'));
  startedOn.dispatchEvent(touch('touchend'));
  assert.deepEqual(seen, ['move', 'end']);
});

test('a finished touch stops being followed', () => {
  const el = new EventTarget();
  let moves = 0;
  followTouch(el, { move: () => { moves += 1; } });
  el.dispatchEvent(touch('touchend'));
  el.dispatchEvent(touch('touchmove'));
  assert.equal(moves, 0);
});

test('a cancelled touch stops being followed and says so', () => {
  const el = new EventTarget();
  let cancelled = false;
  let moves = 0;
  followTouch(el, { move: () => { moves += 1; }, cancel: () => { cancelled = true; } });
  el.dispatchEvent(touch('touchcancel'));
  el.dispatchEvent(touch('touchmove'));
  assert.equal(cancelled, true);
  assert.equal(moves, 0);
});

test('stopping by hand stops following', () => {
  const el = new EventTarget();
  let moves = 0;
  const stop = followTouch(el, { move: () => { moves += 1; } });
  stop();
  el.dispatchEvent(touch('touchmove'));
  assert.equal(moves, 0);
});
