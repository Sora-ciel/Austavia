/**
 * A notification when a calendar task starts, the app open or not.
 *
 * Asked 2026-11-16: "make it so that austavia can send notifications when a
 * task of the calendar starts even if the app is closed." On the phone the
 * reminders are handed to Android's alarm service ahead of time
 * (CalendarRemindersPlugin.java), which shows them with Austavia closed and
 * sets them again after a restart.
 *
 * Which tasks: every calendar block in every folder on this device. Opening
 * every folder to find them would be slow, so each folder's calendar tasks
 * are noted whenever it is saved or downloaded (storage.js onFolderSaved),
 * kept on this device as `index` ({ folder: events }). That note is a copy of
 * what the folder holds, not content of its own: the folder stays the truth.
 *
 * This file decides; App.svelte hands the result to the plugin.
 */
import { upcomingStarts, normalizeEvents } from './calendar.js';

export const REMINDERS_KEY = 'austavia.calendarReminders';
// Two weeks ahead, and at most this many: Android keeps every alarm, and an
// app that opens now and then hands over the next ones each time.
export const REMINDER_DAYS = 14;
export const REMINDER_LIMIT = 60;

/** Every calendar task in a folder, from all its calendar blocks. */
export function calendarEventsOf(payload) {
  const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
  const events = [];
  for (const block of blocks) {
    if (block?.type !== 'calendar') continue;
    for (const event of normalizeEvents(block.events)) events.push({ ...event, calendar: block.title || 'Calendar' });
  }
  return events;
}

/** The index with one folder's tasks replaced (or the folder gone, with null). */
export function withFolder(index, folder, events) {
  const next = { ...(index || {}) };
  if (!events || !events.length) delete next[folder];
  else next[folder] = events;
  return next;
}

/** What to hand Android: the soonest starts across every folder. */
export function remindersFor(index, { now = new Date(), days = REMINDER_DAYS, limit = REMINDER_LIMIT } = {}) {
  const all = [];
  for (const [folder, events] of Object.entries(index || {})) {
    for (const start of upcomingStarts(events, { from: now, days })) {
      all.push({
        id: `${folder}/${start.key}`,
        at: start.at,
        title: start.title || 'Calendar',
        body: `${folder} · ${timeOf(start.start)}–${timeOf(start.end)}`
      });
    }
  }
  return all.sort((a, b) => a.at - b.at).slice(0, limit);
}

const timeOf = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function readIndex(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(REMINDERS_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function writeIndex(storage, index) {
  try { storage?.setItem(REMINDERS_KEY, JSON.stringify(index || {})); } catch { /* noted again at the next save */ }
}
