import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createLongPress,
  movedTooFar,
  LONG_PRESS_MS,
  MOVE_TOLERANCE
} from '../src/utils/longPress.js';

// Named after the request: "on mobile the thing to close the habit should be a
// pop-up, like we have after long press, on the line of our habit -- so that
// you can remove the delete button that shows itself at all time."

function fakeTimers() {
  let now = 0, nextId = 1;
  const jobs = new Map();
  return {
    setTimer(fn, delay) { const id = nextId++; jobs.set(id, { at: now + delay, fn }); return id; },
    clearTimer(id) { jobs.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, job] of [...jobs]) if (job.at <= now) { jobs.delete(id); job.fn(); }
    }
  };
}

function press() {
  const clock = fakeTimers();
  const opened = [];
  const press = createLongPress({
    onLongPress: (at) => opened.push(at),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });
  return { clock, opened, press };
}

test('holding still for half a second opens the menu', () => {
  const { clock, opened, press: p } = press();
  p.start({ x: 100, y: 200 });
  clock.advance(LONG_PRESS_MS);
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0], { x: 100, y: 200 }, 'and says where, so it can be put there');
});

test('a quick tap is not a long press', () => {
  const { clock, opened, press: p } = press();
  p.start({ x: 10, y: 10 });
  clock.advance(120);
  assert.equal(p.finish(), false, 'the click goes through as an ordinary tap');
  clock.advance(LONG_PRESS_MS);
  assert.equal(opened.length, 0, 'and the menu never opens afterwards');
});

test('a finger that moves is scrolling, and the menu stays shut', () => {
  // A list of habits is something people scroll. Without this the menu opens
  // in the middle of a flick, which is worse than having no menu.
  const { clock, opened, press: p } = press();
  p.start({ x: 100, y: 300 });
  clock.advance(200);
  p.move({ x: 104, y: 180 });
  clock.advance(LONG_PRESS_MS);
  assert.equal(opened.length, 0);
});

test('a finger resting on glass may wander a little', () => {
  // A press that demands perfect stillness reads as broken, not as strict.
  const { clock, opened, press: p } = press();
  p.start({ x: 100, y: 300 });
  p.move({ x: 100 + MOVE_TOLERANCE, y: 300 });
  clock.advance(LONG_PRESS_MS);
  assert.equal(opened.length, 1, 'still counts as held');
});

test('the tap that ends a long press does not also count', () => {
  // The whole reason finish() reports anything: a long press on a habit ends
  // with a finger lifting off a day square, and that square would otherwise be
  // marked done by the same gesture that opened the menu.
  const { clock, press: p } = press();
  p.start({ x: 50, y: 50 });
  clock.advance(LONG_PRESS_MS);
  assert.equal(p.finish(), true, 'swallow the click');
  assert.equal(p.finish(), false, 'and only once');
});

test('a cancelled pointer opens nothing', () => {
  const { clock, opened, press: p } = press();
  p.start({ x: 0, y: 0 });
  p.cancel();
  clock.advance(LONG_PRESS_MS * 3);
  assert.equal(opened.length, 0);
  assert.equal(p.finish(), false);
});

test('starting again drops the press before it', () => {
  const { clock, opened, press: p } = press();
  p.start({ x: 0, y: 0 });
  clock.advance(400);
  p.start({ x: 80, y: 80 });
  clock.advance(200);
  assert.equal(opened.length, 0, 'the first press does not fire late');
  clock.advance(300);
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0], { x: 80, y: 80 });
});

test('distance is measured on both axes, and nothing without two points', () => {
  assert.equal(movedTooFar({ x: 0, y: 0 }, { x: 40, y: 0 }), true);
  assert.equal(movedTooFar({ x: 0, y: 0 }, { x: 0, y: 40 }), true);
  assert.equal(movedTooFar({ x: 0, y: 0 }, { x: 2, y: 2 }), false);
  assert.equal(movedTooFar(null, { x: 99, y: 99 }), false);
  assert.equal(movedTooFar({ x: 0, y: 0 }, null), false);
});
