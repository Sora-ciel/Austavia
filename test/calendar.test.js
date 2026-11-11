import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  snap, normalizeEvents, parseTime, formatTime, formatLength, addDays, eventsOn, layoutDay,
  clickedSlot, draggedSlot, movedBy, resizedTo, withTypedTime
} from '../src/utils/calendar.js';

// Asked 2026-11-10: "put time blocks easily of what you will do at a certain
// hour ... maybe you want to do something for 12min till the next hour.
// maybe it's a clean 1h block. or maybe 30. be able to have the day blocked."

test('a block from 12 minutes before the hour to the hour can be made by typing the times', () => {
  const event = { id: 'e', date: '2026-11-10', start: 600, end: 660, title: 'Run' };
  const fromTyping = withTypedTime(withTypedTime(event, 'start', '10:48'), 'end', '11:00');
  assert.deepEqual([fromTyping.start, fromTyping.end], [648, 660]);
  assert.equal(formatLength(fromTyping.end - fromTyping.start), '12 min');
});

test('a click on an empty hour makes a clean one-hour block from the quarter hour clicked', () => {
  assert.deepEqual(clickedSlot(9 * 60 + 7), { start: 540, end: 600 });
  assert.deepEqual(clickedSlot(9 * 60 + 40), { start: 570, end: 630 });
  assert.deepEqual(clickedSlot(23 * 60 + 50), { start: 1380, end: 1440 });
});

test('dragging across the day makes a block of what was dragged, to 5 minutes, either way round', () => {
  assert.deepEqual(draggedSlot(600, 631), { start: 600, end: 630 });
  assert.deepEqual(draggedSlot(631, 600), { start: 600, end: 630 });
  assert.equal(draggedSlot(600, 601), null);
});

test('moving and stretching a block go by 5 minutes and stay within the day', () => {
  const e = { start: 600, end: 630 };
  assert.deepEqual(movedBy(e, 13), { start: 615, end: 645 });
  assert.deepEqual(movedBy(e, -2000), { start: 0, end: 30 });
  assert.deepEqual(resizedTo(e, 'end', 692), { start: 600, end: 690 });
  assert.deepEqual(resizedTo(e, 'start', 700), { start: 625, end: 630 });
  assert.equal(snap(648), 650);
});

test('a time can be typed the ways people write it', () => {
  assert.equal(parseTime('9'), 540);
  assert.equal(parseTime('9:12'), 552);
  assert.equal(parseTime('9h12'), 552);
  assert.equal(parseTime('0912'), 552);
  assert.equal(parseTime('9pm'), 1260);
  assert.equal(parseTime('12am'), 0);
  assert.equal(parseTime('25:00'), null);
  assert.equal(parseTime('soon'), null);
  assert.equal(formatTime(552), '9:12');
  assert.equal(formatTime(1260, true), '9:00 pm');
});

test('a day blocked is kept apart from the timed blocks of that day', () => {
  const events = [
    { id: 'a', date: '2026-11-10', start: 0, end: 1440, title: 'Off', allDay: true },
    { id: 'b', date: '2026-11-10', start: 600, end: 660, title: 'Gym' },
    { id: 'c', date: '2026-11-11', start: 600, end: 660, title: 'Other day' }
  ];
  const day = eventsOn(events, '2026-11-10');
  assert.deepEqual(day.allDay.map(e => e.id), ['a']);
  assert.deepEqual(day.timed.map(e => e.id), ['b']);
});

test('blocks at the same time sit side by side', () => {
  const laid = layoutDay([
    { id: 'a', start: 600, end: 660 },
    { id: 'b', start: 630, end: 690 },
    { id: 'c', start: 700, end: 720 }
  ]);
  const by = Object.fromEntries(laid.map(l => [l.event.id, [l.column, l.columns]]));
  assert.deepEqual(by, { a: [0, 2], b: [1, 2], c: [0, 1] });
});

test('the events sync as the block\'s, and keep what a newer build adds', () => {
  const [e] = normalizeEvents([{ id: 'a', date: '2026-11-10', start: 600, end: 602, title: 'x', colour: 'red' }, { id: 'b', date: 'tomorrow' }]);
  assert.deepEqual([e.start, e.end, e.colour], [600, 605, 'red']);
});

test('days follow on across a month', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

// Asked 2026-11-10: "For the calendar add a 7 day layout", and Ctrl to change
// the height of an hour, "saved per device".
import { weekOf } from '../src/utils/calendar.js';
import { readHourHeight, writeHourHeight, zoomedHour, readView, writeView, MIN_HOUR, MAX_HOUR } from '../src/utils/calendarView.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

test('the 7-day view is the week holding the day, Monday first', () => {
  assert.deepEqual(weekOf('2026-11-10'), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
  assert.equal(weekOf('2026-11-15')[0], '2026-11-09');
  assert.equal(weekOf('2026-11-16')[0], '2026-11-16');
});

test('Ctrl and the wheel change the height of an hour, and this device keeps it', () => {
  const storage = memoryStorage();
  assert.equal(readHourHeight(storage, true), 64);
  // Up makes the hours taller: turned round on 2026-11-10, then turned back on
  // 2026-11-11 -- "i guess i was wrong the first time".
  const taller = zoomedHour(64, -100);
  assert.ok(taller > 64);
  writeHourHeight(storage, true, taller);
  assert.equal(readHourHeight(storage, true), taller);
  assert.equal(readHourHeight(storage, false), 44, 'a block keeps its own');
  assert.ok(zoomedHour(64, 100) < 64);
  assert.equal(zoomedHour(MAX_HOUR, -100), MAX_HOUR);
  assert.equal(zoomedHour(MIN_HOUR, 100), MIN_HOUR);
});

test('day or 7 days is kept per calendar on this device', () => {
  const storage = memoryStorage();
  assert.equal(readView(storage, 'c1'), 'day');
  writeView(storage, 'c1', 'week');
  assert.equal(readView(storage, 'c1'), 'week');
  assert.equal(readView(storage, 'c2'), 'day');
});
