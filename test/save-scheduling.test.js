import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SAVE_QUIET_MS,
  SAVE_MAX_WAIT_MS,
  nextSaveDelay,
  saveVerdict
} from '../src/utils/saveScheduling.js';

const NOW = 1_000_000;

describe('nextSaveDelay', () => {
  it('waits for the typing to stop', () => {
    assert.equal(
      nextSaveDelay({ now: NOW, firstQueuedAt: NOW }),
      SAVE_QUIET_MS
    );
  });

  // The bug this replaces: the old timer was never restarted, so continuous
  // typing wrote the whole note every 300ms for as long as it went on. Each
  // keystroke has to push the window forward.
  it('pushes the window forward on every change', () => {
    const startedAt = NOW;
    const keystrokeAt = NOW + 400;

    assert.equal(
      nextSaveDelay({ now: keystrokeAt, firstQueuedAt: startedAt }),
      SAVE_QUIET_MS,
      'a keystroke should restart the quiet window, not ride the old one out'
    );
  });

  // Without a ceiling, someone typing without pause for two minutes has two
  // minutes of work in memory and nothing on disk, because the debounce keeps
  // deferring to the next keystroke.
  it('stops deferring once the deadline is reached', () => {
    const startedAt = NOW;
    const stillTypingAt = startedAt + SAVE_MAX_WAIT_MS - 200;

    assert.equal(
      nextSaveDelay({ now: stillTypingAt, firstQueuedAt: startedAt }),
      200,
      'the wait should shrink to the deadline rather than start another full window'
    );
  });

  it('writes immediately when the deadline has already passed', () => {
    assert.equal(
      nextSaveDelay({ now: NOW + SAVE_MAX_WAIT_MS + 1, firstQueuedAt: NOW }),
      0
    );
  });

  // The deadline is measured from the first queued change and never moves,
  // which is the whole reason it bounds anything.
  it('never lets the deadline slide with continued typing', () => {
    const startedAt = NOW;
    let worst = 0;

    // Only while the burst is still open. Past the deadline the save has
    // already been written and the next change starts a new burst, so asking
    // with the old start time describes nothing real.
    for (let t = 0; t <= SAVE_MAX_WAIT_MS; t += 100) {
      const delay = nextSaveDelay({ now: startedAt + t, firstQueuedAt: startedAt });
      worst = Math.max(worst, t + delay);
    }

    assert.equal(
      worst,
      SAVE_MAX_WAIT_MS,
      'no amount of typing should push a write past the ceiling'
    );
  });

  it('treats a missing burst start as starting now', () => {
    assert.equal(nextSaveDelay({ now: NOW, firstQueuedAt: 0 }), SAVE_QUIET_MS);
    assert.equal(nextSaveDelay({ now: NOW, firstQueuedAt: undefined }), SAVE_QUIET_MS);
  });

  it('honours custom windows', () => {
    assert.equal(
      nextSaveDelay({ now: NOW, firstQueuedAt: NOW, quietMs: 50, maxWaitMs: 5000 }),
      50
    );
    assert.equal(
      nextSaveDelay({ now: NOW + 90, firstQueuedAt: NOW, quietMs: 50, maxWaitMs: 100 }),
      10
    );
  });

  // A pause of exactly the quiet window still saves, rather than sitting one
  // millisecond short for ever.
  it('is satisfied by a pause of exactly the quiet window', () => {
    const delay = nextSaveDelay({ now: NOW, firstQueuedAt: NOW });
    assert.ok(delay <= SAVE_QUIET_MS);
  });

  it('keeps the ceiling comfortably above the quiet window', () => {
    assert.ok(
      SAVE_MAX_WAIT_MS > SAVE_QUIET_MS,
      'a ceiling below the quiet window would make every save a deadline save'
    );
  });
});

describe('a folder being replaced from the cloud is not written over by what was on screen a moment ago', () => {
// The save-during-pull race, written in the words it was diagnosed in: a folder
// being replaced from the cloud must not get written over by what was on screen
// a moment ago.

it('a save is dropped while a cloud copy is landing', () => {
  assert.equal(saveVerdict({ applyingRemoteCopy: true }), 'discard');
});

it('it is dropped rather than held until after', () => {
  // The whole point. Holding it puts the bug straight back: the held payload is
  // the blocks as they were *before* the cloud copy landed, so running it
  // afterwards writes exactly the stale content the wait was meant to prevent.
  assert.notEqual(saveVerdict({ applyingRemoteCopy: true }), 'queue');
  assert.notEqual(saveVerdict({ applyingRemoteCopy: true, saveInFlight: true }), 'queue');
});

it('a save waiting behind another save is still queued', () => {
  // Different case, and it must not be swept up: that payload is newer than the
  // one being written, not older.
  assert.equal(saveVerdict({ saveInFlight: true }), 'queue');
});

it('an ordinary save writes', () => {
  assert.equal(saveVerdict({}), 'write');
  assert.equal(saveVerdict(), 'write');
});
});
