import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NO_PLACES, visit, goBack, goForward, placesStillThere } from '../src/utils/pagePlaces.js';

// Asked 2026-11-10: back and forward arrows in Page mode, "so that if you
// click and enter a nest you can easily go back or the other way around".

const home = { folder: 'Home', pageId: null };
const trip = { folder: 'Trip', pageId: null };
const notes = { folder: 'Trip', pageId: 'p1' };

test('after entering a nest, back returns to where you were, and forward goes in again', () => {
  let h = visit(NO_PLACES, home, trip);
  const back = goBack(h, trip);
  assert.deepEqual(back.to, home);
  const fwd = goForward(back.history, home);
  assert.deepEqual(fwd.to, trip);
  assert.equal(goForward(fwd.history, trip), null);
});

test('going somewhere new after going back drops what was forward, as a browser does', () => {
  let h = visit(visit(NO_PLACES, home, trip), trip, notes);
  h = goBack(h, notes).history;
  h = visit(h, trip, home);
  assert.equal(h.forward.length, 0);
  assert.deepEqual(h.back.map(p => p.folder), ['Home', 'Trip']);
});

test('nowhere to go back to at the start, and going to where you are records nothing', () => {
  assert.equal(goBack(NO_PLACES, home), null);
  assert.equal(visit(NO_PLACES, home, { folder: 'Home', pageId: null }), NO_PLACES);
});

test('a place that no longer exists is skipped', () => {
  const h = { back: [home, notes], forward: [trip] };
  assert.deepEqual(placesStillThere(h, p => p.pageId !== 'p1').back, [home]);
});
