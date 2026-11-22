import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { plannerFolder, PLANNER_WALLPAPER } from '../src/utils/plannerFolder.js';
import { normalizeModeSettings } from '../src/utils/modeSettings.js';
import { normalizePageRows } from '../src/utils/pageLayout.js';
import { normalizeEvents } from '../src/utils/calendar.js';
import { normalizeGoal } from '../src/utils/taskGoals.js';

// Asked 2026-11-22, and wanted: "another example folder for beginners that is
// basically a whole made folder using pages and everything for almost ready
// use with the utmost best style using bgs that look a bit professional".
// Sora chose a study / work planner.

let n = 0;
const folder = plannerFolder({ today: '2026-11-22', newId: () => `id${n++}` });
const byId = new Map(folder.blocks.map(block => [block.id, block]));

test('the planner is built on pages: a home page that opens onto pages of their own', () => {
  const home = folder.modeSettings.page.rows.flatMap(row => row.cells.map(cell => byId.get(cell.blockId)));
  const pages = home.filter(block => block?.type === 'page');
  assert.ok(pages.length >= 4, 'a weekly plan, a course, a project, more');
  for (const page of pages) {
    const shown = normalizePageRows(page.rows).flatMap(row => row.cells.map(cell => cell.blockId));
    assert.ok(shown.length > 0, `${page.title} has something on it`);
    for (const blockId of shown) assert.ok(byId.has(blockId), `${page.title} shows a block in the folder`);
  }
});

test('ready to use: today, the week, objectives and habits are there', () => {
  assert.ok(folder.blocks.some(block => block.type === 'task' && block.title === 'Today'));
  const week = folder.blocks.find(block => block.type === 'calendar');
  assert.equal(normalizeEvents(week.events).length, week.events.length, 'every event reads');
  assert.ok(week.events.some(event => event.repeat), 'repeating sessions');
  const goals = folder.blocks.flatMap(block => block.tasks || []).filter(task => task.goal);
  assert.ok(goals.some(task => task.goal.kind === 'time') && goals.some(task => task.goal.kind === 'count'));
  for (const task of goals) assert.ok(normalizeGoal(task.goal), `${task.text}: an objective that reads`);
  assert.equal(normalizeModeSettings(folder.modeSettings).habit.habits.length, folder.modeSettings.habit.habits.length);
});

test('its wallpaper ships with the app, for a computer and a phone, and is kept when the folder is read', () => {
  assert.ok(existsSync(new URL(`../public${PLANNER_WALLPAPER.desktop}`, import.meta.url)));
  assert.ok(existsSync(new URL(`../public${PLANNER_WALLPAPER.phone}`, import.meta.url)));
  const settings = normalizeModeSettings(folder.modeSettings);
  assert.equal(settings.default.backgroundImage, PLANNER_WALLPAPER.desktop);
  assert.equal(settings.default.backgroundImageMobile, PLANNER_WALLPAPER.phone);
});
