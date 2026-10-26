import { test } from 'node:test';
import assert from 'node:assert/strict';

import { settingsForHistory, settingsFromHistory } from '../src/utils/undoableSettings.js';

// Asked 2026-10-26, on deleting a habit: "the undo button already exists. It's
// just not linked to our already working snapshot thing. So it should just be
// linked instead of rewritten." These are the habits riding in the same
// history entries as the blocks; App.svelte's undo and redo restore both.

const read = { id: 'read', name: 'Read', log: { '2026-10-25': 'done' } };
const run = { id: 'run', name: 'Run', log: {} };
const folder = (habits, extra = {}) => ({ habit: { habits }, default: { backgroundImage: 'data:big', bgOpacity: 25 }, ...extra });

test('undoing the delete of a habit brings it back, with its days', () => {
  const before = settingsForHistory(folder([read, run]));
  const afterDelete = folder([run]);
  const restored = settingsFromHistory(afterDelete, { settings: before });
  assert.deepEqual(restored.habit.habits.map(h => h.id), ['read', 'run']);
  assert.deepEqual(restored.habit.habits[0].log, { '2026-10-25': 'done' });
});

test('undo reaches what was made, not how the folder is shown: the wallpaper is never in it', () => {
  const entry = settingsForHistory(folder([read]));
  assert.deepEqual(Object.keys(entry), ['habits']);
  const restored = settingsFromHistory(folder([], { default: { bgOpacity: 80 } }), { settings: entry });
  assert.equal(restored.default.bgOpacity, 80);
});

test('a history entry from before this knows nothing of habits, and is not read as "none"', () => {
  const now = folder([read]);
  assert.equal(settingsFromHistory(now, { blocks: [], modeOrders: {} }), now);
});

test('when the habits already match, nothing is replaced', () => {
  const now = folder([read]);
  assert.equal(settingsFromHistory(now, { settings: settingsForHistory(now) }), now);
});
