// Habits, as something a folder owns and two devices can share.
//
// Asked for on 2026-09-26: "let's add a file that will be the habit tracker one
// for each folder, and it will be one used for sync between devices — make it
// work like our other syncs."
//
// They used to be one list in localStorage: the same habits in every folder,
// on one device only. They now live in the folder's modeSettings and travel
// with it, which means they are a *payload* — normalised on the way in as well
// as out, because what arrives may have been written by an older build, a
// newer one, or by hand.
//
// The rule that matters most here is the one syncRules.js carries a scar from:
// a round trip through the cloud must not look like an edit.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeHabits,
  habitsEqual,
  habitsToAdopt,
  MAX_HABITS,
  MAX_NAME_LENGTH
} from '../src/utils/habitStore.js';

const habit = (over = {}) => ({
  id: 'h1',
  name: 'Drink water',
  log: { '2026-09-25': true },
  ...over
});

describe('normalizeHabits', () => {
  it('keeps a well-formed list as it is', () => {
    assert.deepEqual(normalizeHabits([habit()]), [
      { id: 'h1', name: 'Drink water', log: { '2026-09-25': true } }
    ]);
  });

  it('treats anything that is not a list as no habits', () => {
    assert.deepEqual(normalizeHabits(null), []);
    assert.deepEqual(normalizeHabits('habits'), []);
    assert.deepEqual(normalizeHabits({ 0: habit() }), []);
  });

  it('drops what nobody could tick', () => {
    const out = normalizeHabits([habit(), null, 'nope', habit({ id: 'h2', name: '   ' })]);
    assert.deepEqual(out.map(h => h.id), ['h1']);
  });

  // The day keys are what habitDays.js writes. Anything else in there is not a
  // day, and this list is now downloaded by every device.
  it('keeps only real days, and only the ticked ones', () => {
    const out = normalizeHabits([
      habit({ log: { '2026-09-25': true, '2026-09-26': false, nonsense: true, '25/09/2026': true } })
    ]);

    assert.deepEqual(out[0].log, { '2026-09-25': true });
  });

  // Key order is part of what JSON.stringify produces, and two devices have to
  // serialise the same habits to the same string or each will read the other's
  // copy as an edit.
  it('puts the days in a fixed order whatever order they arrived in', () => {
    const forwards = normalizeHabits([habit({ log: { '2026-09-01': true, '2026-09-30': true } })]);
    const backwards = normalizeHabits([habit({ log: { '2026-09-30': true, '2026-09-01': true } })]);

    assert.equal(JSON.stringify(forwards), JSON.stringify(backwards));
    assert.deepEqual(Object.keys(forwards[0].log), ['2026-09-01', '2026-09-30']);
  });

  it('is idempotent, so normalising twice changes nothing', () => {
    const once = normalizeHabits([habit({ name: '  Stretch  ' })]);
    assert.deepEqual(normalizeHabits(once), once);
  });

  // Generating an id would make two devices disagree about the same folder for
  // ever; dropping the habit would throw away months of somebody's ticking.
  it('gives a habit with no id one that both devices would agree on', () => {
    const a = normalizeHabits([{ name: 'Read', log: {} }]);
    const b = normalizeHabits([{ name: 'Read', log: {} }]);

    assert.equal(a[0].id, b[0].id);
    assert.equal(a[0].name, 'Read');
  });

  it('keeps the first of two habits sharing an id', () => {
    const out = normalizeHabits([habit({ name: 'First' }), habit({ name: 'Second' })]);
    assert.deepEqual(out.map(h => h.name), ['First']);
  });

  // Not a guess at how many habits anyone wants. It is there so a corrupt or
  // hostile folder cannot put something unbounded into a node every device
  // downloads.
  it('will not let a folder carry an unbounded list', () => {
    const many = Array.from({ length: MAX_HABITS + 50 }, (_, i) => habit({ id: `h${i}` }));
    assert.equal(normalizeHabits(many).length, MAX_HABITS);
  });

  it('trims a name that would not fit on any screen', () => {
    const out = normalizeHabits([habit({ name: 'x'.repeat(MAX_NAME_LENGTH + 100) })]);
    assert.equal(out[0].name.length, MAX_NAME_LENGTH);
  });
});

describe('habitsEqual', () => {
  // The guard in front of every save. Without it, opening a folder that came
  // down from the cloud writes it straight back and two devices hand it to
  // each other for as long as both are open.
  it('sees through a round trip that changed nothing', () => {
    assert.equal(habitsEqual([habit()], normalizeHabits([habit()])), true);
    assert.equal(
      habitsEqual([habit({ log: { '2026-09-01': true, '2026-09-02': true } })],
                  [habit({ log: { '2026-09-02': true, '2026-09-01': true } })]),
      true
    );
  });

  it('notices a tick', () => {
    const before = [habit({ log: {} })];
    const after = [habit({ log: { '2026-09-26': true } })];
    assert.equal(habitsEqual(before, after), false);
  });

  it('notices a habit added, removed or renamed', () => {
    assert.equal(habitsEqual([habit()], [habit(), habit({ id: 'h2' })]), false);
    assert.equal(habitsEqual([habit()], []), false);
    assert.equal(habitsEqual([habit()], [habit({ name: 'Drink more water' })]), false);
  });

  // Order is user-visible: the list is shown in the order it is kept.
  it('notices a reordering', () => {
    const a = [habit(), habit({ id: 'h2', name: 'Stretch' })];
    assert.equal(habitsEqual(a, [a[1], a[0]]), false);
  });
});

describe('habitsToAdopt', () => {
  it('moves the old device-wide list into a folder that has none', () => {
    assert.deepEqual(
      habitsToAdopt({ inFolder: [], onDevice: [habit()] }),
      normalizeHabits([habit()])
    );
  });

  // A folder with habits has either been used on this device already or has
  // come down from another one. Either way the local leftover is older, and
  // overwriting with it would undo whatever the other device recorded.
  it('leaves a folder that already has habits alone', () => {
    assert.equal(
      habitsToAdopt({ inFolder: [habit({ id: 'from-cloud' })], onDevice: [habit()] }),
      null
    );
  });

  it('has nothing to do for a device that never used the old tracker', () => {
    assert.equal(habitsToAdopt({ inFolder: [], onDevice: [] }), null);
    assert.equal(habitsToAdopt({}), null);
    assert.equal(habitsToAdopt({ inFolder: [], onDevice: 'corrupt' }), null);
  });
});
