import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newcomerFolder, NEWCOMER_NOTES } from '../src/utils/newcomerFolder.js';
import { normalizeModeSettings } from '../src/utils/modeSettings.js';
import { normalizeEvents, occursOn } from '../src/utils/calendar.js';
import { normalizeGoal } from '../src/utils/taskGoals.js';
import { MODE_DEFINITIONS } from '../src/Modes/modeRegistry.js';

// Asked 2026-11-21, and wanted: "create a beginner, or newcomer folder that
// shows how the app works in all the modes we have rn."

let n = 0;
const folder = newcomerFolder({ today: '2026-11-21', newId: () => `id${n++}` });
const ofType = type => folder.blocks.filter(block => block.type === type);

test('the newcomer folder gives every mode something to show', () => {
  assert.ok(ofType('text').length >= 1, 'writing -- the guide -- for Canvas, Simple Note and Single Note');
  assert.ok(folder.modeSettings.page.rows.length > 0, 'a page');
  assert.equal(ofType('task').length, 1, 'a task list for Task mode');
  assert.equal(ofType('calendar').length, 1, 'a calendar for Calendar mode');
  assert.ok(folder.modeSettings.habit.habits.length > 0, 'habits for the Habit Tracker');
});

test('and has a note about every mode there is, so a new mode is not forgotten', () => {
  const written = NEWCOMER_NOTES.map(note => note.content).join(' ');
  for (const mode of Object.values(MODE_DEFINITIONS)) {
    assert.ok(written.includes(mode.label), `a note mentions ${mode.label}`);
  }
});

test('everything in it is what the app itself would store -- nothing is dropped when it is read', () => {
  const settings = normalizeModeSettings(folder.modeSettings);
  assert.equal(settings.habit.habits.length, folder.modeSettings.habit.habits.length);
  assert.equal(settings.page.rows.length, folder.modeSettings.page.rows.length);
  const events = ofType('calendar')[0].events;
  assert.equal(normalizeEvents(events).length, events.length);
  assert.ok(events.some(event => event.repeat && occursOn(event, '2026-11-28')), 'a repeating event shows next week');
  for (const task of ofType('task')[0].tasks) {
    if (task.goal) assert.ok(normalizeGoal(task.goal), 'an objective that reads');
  }
  const ids = new Set(folder.blocks.map(block => block.id));
  for (const row of folder.modeSettings.page.rows) {
    for (const cell of row.cells) assert.ok(ids.has(cell.blockId), 'the page shows blocks that are in the folder');
  }
});

// Asked 2026-11-22: "one block that explains everything ... with screens
// inside showing how everything works."
test('the guide is one block, and every screen it shows is bundled with the app', async () => {
  const { GUIDE_HTML } = await import('../src/utils/newcomerFolder.js');
  const { existsSync } = await import('node:fs');
  assert.equal(folder.blocks.filter(block => block.content === GUIDE_HTML).length, 1);
  const screens = [...GUIDE_HTML.matchAll(/src="\/guide\/([^"]+)"/g)].map(m => m[1]);
  assert.ok(screens.length >= 10, 'a screen for each mode and panel');
  for (const name of screens) assert.ok(existsSync(new URL(`../public/guide/${name}`, import.meta.url)), `public/guide/${name}`);
  assert.match(GUIDE_HTML, /custom theme/i, 'it shows how to make a theme of your own');
});
