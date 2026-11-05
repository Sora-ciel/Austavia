import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalizeHabits } from '../src/utils/habitStore.js';
import { normalizeGoal, keptGoal, settleTask } from '../src/utils/taskGoals.js';
import { normalizeSchedule } from '../src/utils/habitSchedule.js';
import { normalizeModeSettings } from '../src/utils/modeSettings.js';
import { withHabitGoal } from '../src/utils/habitGoals.js';
import { addProgress } from '../src/utils/taskGoals.js';

// Asked 2026-10-26: "make something so that new details are still kept even
// though a certain version doesn't know what it means yet ... so that in no
// situation we'll have this little problem again. It's an app that will be
// used by clients all over the world."
//
// Somebody's phone is always a version behind their computer. Each test here
// is a folder written by a newer Austavia, passed through this build the way
// a save would, and asks that nothing this build did not understand is lost.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const roundTrip = (normalize, value) => normalize(JSON.parse(JSON.stringify(normalize(value))));

test('a habit keeps the fields, schedules and day marks only a newer version knows', () => {
  const [h] = normalizeHabits([{
    id: 'h', name: 'Read',
    colour: '#ff2b45',
    archivedAt: 1793000000000,
    schedule: { kind: 'days', days: [1, 3], startsOn: '2026-11-01' },
    log: { '2026-10-20': 'done', '2026-10-21': { amount: 3, note: 'on the train' }, '2026-10-22': 'half' }
  }]);
  assert.equal(h.colour, '#ff2b45');
  assert.equal(h.archivedAt, 1793000000000);
  assert.equal(h.schedule.startsOn, '2026-11-01');
  assert.deepEqual(h.log['2026-10-21'], { amount: 3, note: 'on the train' });
  assert.equal(h.log['2026-10-22'], 'half');
});

test('a schedule of a kind only a newer version knows is kept, and read as every day', () => {
  const s = normalizeSchedule({ kind: 'everyOtherDay', from: '2026-10-01' });
  assert.deepEqual(s, { from: '2026-10-01', kind: 'everyOtherDay' });
});

test('an objective keeps its newer fields, through every change this build makes to it', () => {
  const goal = { kind: 'count', target: 8, progress: 2, daily: true, day: '2026-10-26', unit: 'glasses' };
  assert.equal(normalizeGoal(goal).unit, 'glasses');
  const task = { id: 't', done: false, goal };
  const next = settleTask(task, new Date(2026, 9, 27, 9).getTime()); // a new day resets it
  assert.equal(next.goal.unit, 'glasses');
});

test('an objective of a kind only a newer version knows is kept, not deleted', () => {
  const distance = { kind: 'distance', target: 5, unit: 'km' };
  assert.deepEqual(keptGoal(distance), { kind: 'distance', target: 5, unit: 'km' });
  const [h] = normalizeHabits([{ id: 'run', name: 'Run', log: {}, goal: distance }]);
  assert.equal(h.goal.kind, 'distance');
  // And acting on it, which this build cannot do, leaves it alone.
  const after = withHabitGoal([h], 'run', (t, at) => addProgress(t, 1, at), Date.now());
  assert.deepEqual(after[0].goal, h.goal);
});

test('mode settings keep a whole mode, and fields, this build has never heard of', () => {
  const s = normalizeModeSettings({
    journal: { entries: [{ day: '2026-10-26', text: 'Long day.' }] },
    playlist: { tracks: [], playlists: [], sortBy: 'artist' },
    habit: { habits: [], sortBy: 'streak' },
    task: { addDirection: 'below', lanes: 3 }
  });
  assert.deepEqual(s.journal, { entries: [{ day: '2026-10-26', text: 'Long day.' }] });
  assert.equal(s.playlist.sortBy, 'artist');
  assert.equal(s.habit.sortBy, 'streak');
  assert.equal(s.task.lanes, 3);
});

test('what was removed on purpose stays removed: Single Note\'s old wallpaper', () => {
  assert.equal('single' in normalizeModeSettings({ single: { backgroundImage: 'old.png' } }), false);
});

test('keeping them does not make a folder look edited: a round trip is byte-identical', () => {
  const newer = { journal: { b: 1, a: 2 }, habit: { habits: [{ id: 'h', name: 'x', log: {}, zeta: 1, alpha: { y: 1, x: 2 } }] } };
  assert.ok(same(normalizeModeSettings(newer), roundTrip(normalizeModeSettings, newer)));
});

// The note editor: every part of a note Austavia adds carries its name, so a
// version that does not know it keeps it whole (TipTapEditor's KeptBlock and
// KeptInline). Checked in a browser on 2026-10-26: a newer block and a newer
// inline part come back from getHTML and getMarkdown byte for byte.
test('every part of a note this version adds carries the name an older version keeps it by', () => {
  const source = readFileSync(new URL('../src/components/TipTapEditor.svelte', import.meta.url), 'utf8');
  const nodes = [...source.matchAll(/const (\w+) = TipTapNode\.create\(\{\s*name: '(\w+)'/g)]
    .map(([, , name]) => name)
    .filter(name => name !== 'keptBlock' && name !== 'keptInline');
  assert.ok(nodes.length > 0);
  const marked = source.match(/const MARKED_HERE = new Set\(\[([^\]]*)\]\)/)[1];
  for (const name of nodes) {
    assert.match(source, new RegExp(`'data-austavia-node': '${name}'`), `${name} is written with its name`);
    assert.ok(marked.includes(`'${name}'`), `${name} is listed as known here, so it is parsed as itself`);
  }
});

test('a page keeps the entries and fields a newer version gave it', () => {
  const newer = { page: { rows: [{ cells: [{ blockId: 'a', folderId: 'elsewhere' }, { blockId: 'b', width: 0.3 }], gap: 2 }], cover: 'x' } };
  const kept = normalizeModeSettings(newer).page;
  assert.deepEqual(kept.rows, newer.page.rows);
  assert.equal(kept.cover, 'x');
});
