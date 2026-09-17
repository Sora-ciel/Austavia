import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createUpdateCoalescer, COALESCE_MS } from '../src/utils/editorUpdates.js';

// Named after the report: "writing on the phone it seems like even without
// images the writing is slow, like slightly slower than it should be."
//
// Measured at ~3.4ms per keystroke spent serialising the document and running
// the Svelte cascade, both inside the key event and so both ahead of the
// character being drawn. This is the part that decides when that work happens;
// TipTapEditor.svelte is the part that does it.

/** A clock that only moves when a test says so. */
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const scheduled = new Map();

  return {
    setTimer(fn, delay) {
      const id = nextId++;
      scheduled.set(id, { at: now + delay, fn });
      return id;
    },
    clearTimer(id) {
      scheduled.delete(id);
    },
    /** Run everything due within the next `ms`. */
    advance(ms) {
      now += ms;
      for (const [id, task] of [...scheduled].sort((a, b) => a[1].at - b[1].at)) {
        if (task.at > now) continue;
        scheduled.delete(id);
        task.fn();
      }
    },
    get outstanding() {
      return scheduled.size;
    }
  };
}

/** A coalescer over a document somebody is typing into. */
function typingInto() {
  const clock = fakeTimers();
  const sent = [];
  let document = '';
  const coalescer = createUpdateCoalescer({
    // Reads the document at the moment of sending, the way the editor does.
    send: () => sent.push(document),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });

  return {
    clock,
    sent,
    coalescer,
    type(characters) {
      for (const character of characters) {
        document += character;
        coalescer.noteChange();
      }
    }
  };
}

test('a burst of typing is serialised once, not once per character', () => {
  // The whole point. Twenty keystrokes inside one window used to cost twenty
  // serialisations of the whole note and twenty passes through Svelte.
  const { clock, sent, type } = typingInto();
  type('a burst of characters');
  assert.deepEqual(sent, [], 'nothing yet: the keystrokes have to return first');

  clock.advance(COALESCE_MS);
  assert.equal(sent.length, 1);
  assert.equal(sent[0], 'a burst of characters', 'and it is the whole burst');
});

test('what is sent is the writing as it ended up, not as it was when the first key went down', () => {
  // Why `send` reads the document rather than being handed a value: keeping a
  // value per keystroke would put back the cost that was just taken out.
  const { clock, sent, type } = typingInto();
  type('one');
  type(' two');
  clock.advance(COALESCE_MS);
  assert.deepEqual(sent, ['one two']);
});

test('the window does not move while somebody keeps typing', () => {
  // A window that restarted on every keystroke would never end during a
  // paragraph, so the writing would reach the save and the undo history only
  // once the person stopped. That is the failure this exists to avoid.
  const clock = fakeTimers();
  const sent = [];
  const coalescer = createUpdateCoalescer({
    send: () => sent.push('sent'),
    delay: 50,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });

  coalescer.noteChange();
  clock.advance(30);
  coalescer.noteChange();
  clock.advance(20); // 50ms after the first keystroke, not 50 after the second
  assert.equal(sent.length, 1, 'sent on time, rather than pushed back');
});

test('typing again after a send opens a new window', () => {
  const { clock, sent, type } = typingInto();
  type('first');
  clock.advance(COALESCE_MS);
  type(' second');
  assert.equal(sent.length, 1, 'still just the first');
  clock.advance(COALESCE_MS);
  assert.deepEqual(sent, ['first', 'first second']);
});

test('the last characters typed are not lost when the editor is taken away', () => {
  // The risk the delay introduces, and the one thing that must not happen.
  // Blur, teardown, undo and a copy arriving from another device all flush,
  // which is what makes waiting safe.
  const { clock, sent, coalescer, type } = typingInto();
  type('half a word');

  assert.equal(coalescer.flush(), true, 'it had something to send');
  assert.deepEqual(sent, ['half a word']);
  assert.equal(coalescer.waiting, false);

  clock.advance(COALESCE_MS);
  assert.equal(sent.length, 1, 'and it is not sent a second time when the timer would have run');
  assert.equal(clock.outstanding, 0, 'no timer left behind');
});

test('flushing when nothing was typed sends nothing', () => {
  // Blur flushes, and clicking in and out of a block without typing is common.
  // Sending anyway would tell the app the note changed, which would stamp a new
  // modifiedAt and hand a folder round between devices for ever.
  const { sent, coalescer } = typingInto();
  assert.equal(coalescer.flush(), false);
  assert.deepEqual(sent, []);
});

test('nothing is sent after the editor is gone', () => {
  // A timer that outlived the component would serialise a destroyed editor.
  const { clock, sent, coalescer, type } = typingInto();
  type('abc');
  coalescer.stop();
  clock.advance(COALESCE_MS * 10);
  assert.deepEqual(sent, []);
  assert.equal(clock.outstanding, 0);
});

test('stopping twice, and flushing after stopping, do nothing rather than throwing', () => {
  const { coalescer, sent } = typingInto();
  coalescer.stop();
  coalescer.stop();
  assert.equal(coalescer.flush(), false);
  assert.deepEqual(sent, []);
  assert.doesNotThrow(() => createUpdateCoalescer().noteChange());
});
