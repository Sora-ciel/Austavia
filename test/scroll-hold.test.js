// A rebuilt note held where it was read to while its pictures load.
//
// Reported on 2026-10-05: "in canvas mode ... changing themes or ... clicking
// a task as done makes some blocks jump every time you do it ... It only
// happens to text blocks with images in it ... to fix that the block needs to
// mount on the scroll it needs to be already". What follows was wanted.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { heldScrollTop, HOLD_MS } from '../src/utils/scrollHold.js';

const T = 1_000_000;

describe('holding a note where it was read to', () => {
  it('puts the reader back again once the pictures have made room', () => {
    assert.equal(heldScrollTop({ target: 900, until: T + HOLD_MS, now: T + 100, room: 1500 }), 900);
  });

  it('does not clamp to a shorter note while pictures are still missing', () => {
    assert.equal(heldScrollTop({ target: 900, until: T + HOLD_MS, now: T + 100, room: 400 }), null);
  });

  it('lets go as soon as the reader scrolls, clicks or types', () => {
    assert.equal(heldScrollTop({ target: 900, until: T + HOLD_MS, now: T + 100, room: 1500, released: true }), null);
  });

  it('lets go after a while, rather than fight whatever else is resizing the note', () => {
    assert.equal(heldScrollTop({ target: 900, until: T + HOLD_MS, now: T + HOLD_MS + 1, room: 1500 }), null);
  });

  it('holds nothing for a note read from the top', () => {
    assert.equal(heldScrollTop({ target: 0, until: T + HOLD_MS, now: T, room: 1500 }), null);
  });
});
