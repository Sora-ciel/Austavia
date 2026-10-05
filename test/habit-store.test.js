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
  dayMark,
  nextMark,
  withDayTapped,
  mergeDeviceHabits,
  describeHabitChange,
  summariseHabits,
  MAX_HABITS,
  MAX_NAME_LENGTH
} from '../src/utils/habitStore.js';

const habit = (over = {}) => ({
  id: 'h1',
  name: 'Drink water',
  log: { '2026-09-25': 'done' },
  ...over
});

describe('normalizeHabits', () => {
  it('keeps a well-formed list as it is', () => {
    assert.deepEqual(normalizeHabits([habit()]), [
      { id: 'h1', name: 'Drink water', log: { '2026-09-25': 'done' } }
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
  it('keeps only real days, and only the marked ones', () => {
    const out = normalizeHabits([
      habit({ log: { '2026-09-25': 'done', '2026-09-26': false, '2026-09-27': 'none', nonsense: 'done', '25/09/2026': 'done' } })
    ]);

    assert.deepEqual(out[0].log, { '2026-09-25': 'done' });
  });

  // Key order is part of what JSON.stringify produces, and two devices have to
  // serialise the same habits to the same string or each will read the other's
  // copy as an edit.
  it('puts the days in a fixed order whatever order they arrived in', () => {
    const forwards = normalizeHabits([habit({ log: { '2026-09-01': 'done', '2026-09-30': 'missed' } })]);
    const backwards = normalizeHabits([habit({ log: { '2026-09-30': 'missed', '2026-09-01': 'done' } })]);

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
      habitsEqual([habit({ log: { '2026-09-01': 'done', '2026-09-02': 'missed' } })],
                  [habit({ log: { '2026-09-02': 'missed', '2026-09-01': 'done' } })]),
      true
    );
  });

  it('notices a tick', () => {
    const before = [habit({ log: {} })];
    const after = [habit({ log: { '2026-09-26': 'done' } })];
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

// Reported on 2026-10-05: "clicking on days doesn't do anything when it should
// mark them as done or not done". The store kept only `true`; the tracker
// draws ✓ for 'done' and ✕ for 'missed', so a tap was saved and drew nothing,
// and could not be taken back. Wanted: a tap marks the day, as it always did.
describe('marking a day', () => {
  it('a tap goes nothing, then ✓, then ✕, then nothing again', () => {
    assert.equal(nextMark(undefined), 'done');
    assert.equal(nextMark('done'), 'missed');
    assert.equal(nextMark('missed'), null);
  });

  it('a tap is saved as the mark the tracker draws', () => {
    const once = withDayTapped([habit({ log: {} })], 'h1', '2026-09-30');
    assert.equal(once[0].log['2026-09-30'], 'done');
    const twice = withDayTapped(once, 'h1', '2026-09-30');
    assert.equal(twice[0].log['2026-09-30'], 'missed');
    const thrice = withDayTapped(twice, 'h1', '2026-09-30');
    assert.equal('2026-09-30' in thrice[0].log, false);
  });

  it('a day saved as `true` by the builds in between reads as ✓, and the next tap moves on from it', () => {
    assert.equal(dayMark(true), 'done');
    const next = withDayTapped([habit({ log: { '2026-09-30': true } })], 'h1', '2026-09-30');
    assert.equal(next[0].log['2026-09-30'], 'missed');
  });

  it('keeps ✕ through a round trip', () => {
    assert.deepEqual(normalizeHabits([habit({ log: { '2026-09-29': 'missed' } })])[0].log, { '2026-09-29': 'missed' });
  });
});

// Asked for on 2026-10-05: "normally we should keep if a habit was already
// being kept and the day it was before the syncs, instead of wiping it out".
// The first version only moved a device's old list into a folder with no
// habits at all (habitsToAdopt, above, still says so for that case), and what
// it did move had lost its ✕ days. What follows was wanted.
describe('merging what this device kept before habits synced', () => {
  const device = [
    { id: 'h1', name: 'Drink water', log: { '2026-09-01': 'done', '2026-09-02': 'missed', '2026-09-03': 'done' } },
    { id: 'h9', name: 'Stretch', log: { '2026-09-02': 'done' } }
  ];

  it('a folder that already has the habit gets the days it is missing', () => {
    const result = mergeDeviceHabits({ inFolder: [habit({ log: { '2026-09-30': 'done' } })], onDevice: device });
    assert.deepEqual(result.habits[0].log, {
      '2026-09-01': 'done', '2026-09-02': 'missed', '2026-09-03': 'done', '2026-09-30': 'done'
    });
  });

  it('a ✕ that became a bare `true` in the move comes back as ✕', () => {
    const moved = [habit({ log: { '2026-09-01': true, '2026-09-02': true, '2026-09-03': true } })];
    const result = mergeDeviceHabits({ inFolder: moved, onDevice: device });
    assert.equal(result.habits[0].log['2026-09-02'], 'missed');
    assert.equal(result.habits[0].log['2026-09-01'], 'done');
  });

  it('a mark written since, as ✓ or ✕, is the folder\'s and stays', () => {
    const result = mergeDeviceHabits({ inFolder: [habit({ log: { '2026-09-02': 'done' } })], onDevice: device });
    assert.equal(result.habits[0].log['2026-09-02'], 'done');
  });

  it('a habit only this device kept is added', () => {
    const result = mergeDeviceHabits({ inFolder: [habit({ log: {} })], onDevice: device });
    assert.deepEqual(result.habits.map(h => h.name), ['Drink water', 'Stretch']);
    assert.equal(result.added, 1);
  });

  it('matches by name when the ids differ', () => {
    const result = mergeDeviceHabits({ inFolder: [habit({ id: 'other', log: {} })], onDevice: [device[0]] });
    assert.equal(result.habits.length, 1);
    assert.equal(result.habits[0].log['2026-09-02'], 'missed');
  });

  it('leaves alone a folder with none of these habits -- it is not where the list belongs', () => {
    assert.equal(mergeDeviceHabits({ inFolder: [habit({ id: 'x', name: 'Piano' })], onDevice: device }), null);
  });

  it('an empty folder takes the whole list only if the list never moved', () => {
    assert.equal(mergeDeviceHabits({ inFolder: [], onDevice: device }).habits.length, 2);
    assert.equal(mergeDeviceHabits({ inFolder: [], onDevice: device, intoEmpty: false }), null);
  });

  it('nothing to change when the folder already has it all -- but it is the right folder, so the device can stop looking', () => {
    assert.deepEqual(mergeDeviceHabits({ inFolder: normalizeHabits(device), onDevice: device }), { habits: null, added: 0, restored: 0 });
  });
});

describe('the habit log', () => {
  it('says what changed in words', () => {
    const before = [habit({ log: {} })];
    const after = [habit({ log: { '2026-09-30': 'done' } }), { id: 'h2', name: 'Read', log: {} }];
    assert.deepEqual(describeHabitChange(before, after), [
      '"Drink water" 2026-09-30: • -> ✓',
      'added "Read"'
    ]);
    assert.deepEqual(describeHabitChange(after, [after[0]]), ['removed "Read"']);
  });

  it('counts each habit\'s marks for the diagnostics', () => {
    assert.deepEqual(summariseHabits([habit({ log: { '2026-09-01': 'done', '2026-09-02': 'missed', '2026-09-03': true } })]), [
      { name: 'Drink water', done: 2, missed: 1, last: '2026-09-03' }
    ]);
  });
});
