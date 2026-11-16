// Reminders when a calendar task starts (src/utils/calendarReminders.js).
//
// Asked 2026-11-16: "make it so that austavia can send notifications when a
// task of the calendar starts even if the app is closed." These say which
// starts are handed to the phone ahead of time.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calendarEventsOf, withFolder, remindersFor } from '../src/utils/calendarReminders.js';

const NOW = new Date(2026, 10, 16, 8, 0); // Monday 16 Nov, 08:00
const calendar = events => ({ blocks: [{ id: 'c', type: 'calendar', title: 'Week', events }, { id: 't', type: 'text', content: 'hi' }] });
const run = { id: 'r', date: '2026-11-16', start: 9 * 60, end: 10 * 60, title: 'Run' };

describe('a notification when a calendar task starts', () => {
  it('a task later today is reminded at its start', () => {
    const index = withFolder({}, 'Arial', calendarEventsOf(calendar([run])));
    const [first] = remindersFor(index, { now: NOW });
    assert.equal(first.title, 'Run');
    assert.equal(first.at, new Date(2026, 10, 16, 9, 0).getTime());
    assert.equal(first.body, 'Arial · 09:00–10:00');
  });

  it('a task already started is not reminded', () => {
    const index = withFolder({}, 'Arial', calendarEventsOf(calendar([{ ...run, start: 7 * 60 }])));
    assert.deepEqual(remindersFor(index, { now: NOW, days: 1 }), []);
  });

  it('a repeating task is reminded on each of its days', () => {
    const index = withFolder({}, 'Arial', calendarEventsOf(calendar([{ ...run, repeat: { every: 2, unit: 'day' } }])));
    const days = remindersFor(index, { now: NOW, days: 5 }).map(r => new Date(r.at).getDate());
    assert.deepEqual(days, [16, 18, 20]);
  });

  it('tasks in every folder are reminded, soonest first', () => {
    let index = withFolder({}, 'Arial', calendarEventsOf(calendar([run])));
    index = withFolder(index, 'Work', calendarEventsOf(calendar([{ ...run, id: 'w', start: 8 * 60 + 30, title: 'Standup' }])));
    assert.deepEqual(remindersFor(index, { now: NOW, days: 1 }).map(r => r.title), ['Standup', 'Run']);
  });

  it('a whole day blocked has no start to remind of', () => {
    const index = withFolder({}, 'Arial', calendarEventsOf(calendar([{ ...run, allDay: true }])));
    assert.deepEqual(remindersFor(index, { now: NOW }), []);
  });

  it('a folder deleted, or with no calendar left, is reminded of nothing', () => {
    const index = withFolder(withFolder({}, 'Arial', calendarEventsOf(calendar([run]))), 'Arial', []);
    assert.deepEqual(index, {});
  });
});
