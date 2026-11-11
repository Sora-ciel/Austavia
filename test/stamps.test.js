// Reported on 2026-11-11: on Windows the phone's changes stopped arriving while
// Windows's own reached the phone. A PC clock four hours fast had stamped a
// folder in the future, and every edit after it -- stamped with the real time
// -- looked older than the copy it was made from. See src/utils/stamps.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { nextStamp } from '../src/utils/stamps.js';

const NOW = 1_794_390_365_995;
const FOUR_HOURS = 4 * 60 * 60 * 1000;

describe('the stamp an edit is saved with', () => {
  it('an edit always counts as newer than the copy it was made from, even when the copy came from a clock that was fast', () => {
    const fromTheFuture = NOW + FOUR_HOURS;
    assert.ok(nextStamp(fromTheFuture, NOW) > fromTheFuture);
  });

  it('is simply the time when the clocks agree', () => {
    assert.equal(nextStamp(NOW - 60_000, NOW), NOW);
    assert.equal(nextStamp(undefined, NOW), NOW);
  });

  it('two edits in the same millisecond still come one after the other', () => {
    assert.equal(nextStamp(NOW, NOW), NOW + 1);
  });
});
