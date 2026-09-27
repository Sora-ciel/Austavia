/**
 * The alarm half of the clock block: when it rings, when it stops, and what
 * this device remembers about it.
 *
 * ## What was asked for
 *
 * "I wanted an alarm block. Make it a block that does both, and which one is
 * open is an on-device save. On the alarm page the clock still shows small in
 * a corner, and on the clock page one click puts it in alarm mode, and an
 * active alarm shows in that same corner." — 2026-09-27.
 *
 * ## One alarm, once a day
 *
 * An alarm here is a time of day and a switch. It rings when that time arrives,
 * keeps ringing for a while if nobody answers, and once answered it is done
 * until the same time tomorrow. Snoozing moves it on by a few minutes.
 *
 * ## What is saved where
 *
 * The time and the switch are the block's and travel with the folder: the alarm
 * is part of the note, and reads the same on every device.
 *
 * Which page is open, when it was last answered and until when it is snoozed are
 * this device's, kept in local storage and never synced. The page because it is
 * view state, and view state is never synced. The answering because syncing it
 * would make a timer write to the folder whenever an alarm went off -- a save
 * caused by a clock rather than a person. The cost is that dismissing on one
 * device does not silence another that also has the folder open.
 *
 * ## Answered, not "dismissed today"
 *
 * What is remembered is the moment it was last answered, not the day. A day
 * would go wrong at midnight: snooze at 23:58, answer at 00:03, and "dismissed
 * on the 28th" would silence the 28th's own alarm. A moment cannot: the ring it
 * answered is before it, and the next one is after.
 *
 * ## Missing a ring is better than a late one
 *
 * If the app was closed at seven and opened at nine, the alarm does not go off
 * at nine. It rings inside a window after its time and not after: an alarm that
 * goes off two hours late is not an alarm, it is a noise.
 */

import { readStopwatch } from './stopwatch.js';
import { readTimer } from './countdown.js';

/** The pages a clock block has. Anything else read back is the clock. */
export const CLOCK_PAGES = ['clock', 'alarm', 'stopwatch', 'timer'];

/** How long an unanswered alarm keeps ringing before it gives up. */
export const RING_WINDOW_MS = 10 * 60 * 1000;

/** How long a snooze lasts. */
export const SNOOZE_MS = 5 * 60 * 1000;

/**
 * The longest the ringer waits before looking again, whatever it expects.
 *
 * A timer aimed at seven tomorrow morning is only as good as the device's
 * willingness to keep it: a phone that sleeps, a laptop lid, a clock changed by
 * hand, and it fires late or never. So the aim is capped, and every wake works
 * the answer out again from the time -- the periodic pass that CLAUDE.md asks
 * of anything event-driven. Once a minute costs nothing.
 */
export const MAX_WAIT_MS = 60 * 1000;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = value => String(value).padStart(2, '0');

/**
 * An alarm time as `HH:MM`, or an empty string when it is not one.
 *
 * Accepts what a time input gives (`07:30`) and what a person might type
 * (`7:30`). Anything else is no alarm rather than a guess at one.
 */
export function normalizeAlarmTime(value) {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(value ?? ''));
  if (!match) return '';

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return '';

  return `${pad(hours)}:${pad(minutes)}`;
}

/**
 * The moment this alarm goes off on the day `at` falls in.
 *
 * Built from local parts, never from UTC: seven in the morning is seven where
 * the person is.
 */
export function alarmMomentOn(at, time) {
  const normal = normalizeAlarmTime(time);
  if (!normal) return null;

  const [hours, minutes] = normal.split(':').map(Number);
  const day = new Date(Number(at));
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0).getTime();
}

/** The most recent time this alarm was due, at or before `now`. */
export function lastAlarmMoment(now, time) {
  const today = alarmMomentOn(now, time);
  if (today === null) return null;
  return today <= now ? today : alarmMomentOn(now - DAY_MS, time);
}

/** The next time this alarm is due, after `now`. */
export function nextAlarmMoment(now, time) {
  const today = alarmMomentOn(now, time);
  if (today === null) return null;
  return today > now ? today : alarmMomentOn(now + DAY_MS, time);
}

/**
 * This device's memory of one clock block, read from whatever local storage
 * held -- which may be nothing, or something an older build wrote.
 */
export function readClockDevice(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
  }
  if (!value || typeof value !== 'object') value = {};

  const number = input => (Number.isFinite(Number(input)) && Number(input) > 0 ? Number(input) : 0);

  return {
    // A block opens on the clock unless this device was left on another page.
    page: CLOCK_PAGES.includes(value.page) ? value.page : 'clock',
    answeredAt: number(value.answeredAt),
    snoozedUntil: number(value.snoozedUntil),
    snoozedFor: normalizeAlarmTime(value.snoozedFor),
    // This device's stopwatch -- utils/stopwatch.js.
    stopwatch: readStopwatch(value.stopwatch),
    // This device's timer -- utils/countdown.js.
    timer: readTimer(value.timer)
  };
}

/**
 * Whether the alarm is ringing at this moment.
 *
 * `device` is readClockDevice's shape. A snooze belongs to the alarm time it
 * was taken on: change the time and the snooze no longer applies, so an alarm
 * moved to tomorrow does not go off in five minutes anyway.
 */
export function isRinging({ now = Date.now(), time = '', enabled = false, device = {} } = {}) {
  if (!enabled) return false;
  const normal = normalizeAlarmTime(time);
  if (!normal) return false;

  const state = readClockDevice(device);

  if (state.snoozedUntil > 0 && state.snoozedFor === normal) {
    if (now < state.snoozedUntil) return false;
    // Woken from a snooze: ring for as long as an alarm would.
    if (now - state.snoozedUntil < RING_WINDOW_MS) return true;
  }

  const due = lastAlarmMoment(now, normal);
  if (state.answeredAt >= due) return false;
  return now - due < RING_WINDOW_MS;
}

/** What answering "stop" leaves this device remembering. */
export function dismissed(device, now = Date.now()) {
  return { ...readClockDevice(device), answeredAt: now, snoozedUntil: 0, snoozedFor: '' };
}

/**
 * What "snooze" leaves this device remembering.
 *
 * The ring it snoozed counts as answered -- otherwise it would still be inside
 * its window, and ringing, the moment the snooze was taken.
 */
export function snoozed(device, time, now = Date.now()) {
  return {
    ...readClockDevice(device),
    answeredAt: now,
    snoozedUntil: now + SNOOZE_MS,
    snoozedFor: normalizeAlarmTime(time)
  };
}

/** Whether this device has the alarm snoozed right now. */
export function isSnoozed({ now = Date.now(), time = '', enabled = false, device = {} } = {}) {
  if (!enabled) return false;
  const state = readClockDevice(device);
  return state.snoozedUntil > now && state.snoozedFor === normalizeAlarmTime(time) && state.snoozedFor !== '';
}

/**
 * How long until the ringer should look again.
 *
 * Aimed at the next moment anything can change -- the alarm coming due, a
 * ring running out, a snooze ending -- and never longer than MAX_WAIT_MS.
 */
export function msUntilAlarmCheck({ now = Date.now(), alarms = [] } = {}) {
  let soonest = now + MAX_WAIT_MS;

  for (const alarm of alarms) {
    if (!alarm?.enabled) continue;
    const normal = normalizeAlarmTime(alarm.time);
    if (!normal) continue;
    const state = readClockDevice(alarm.device);

    const moments = [
      nextAlarmMoment(now, normal),
      lastAlarmMoment(now, normal) + RING_WINDOW_MS
    ];
    if (state.snoozedFor === normal && state.snoozedUntil > 0) {
      moments.push(state.snoozedUntil, state.snoozedUntil + RING_WINDOW_MS);
    }

    for (const at of moments) {
      if (at > now && at < soonest) soonest = at;
    }
  }

  // A few milliseconds past the boundary, for the same reason as the clock's
  // own tick: a timer that fires a hair early sees the old answer.
  return Math.max(20, soonest - now + 20);
}

/** An alarm time the way the clock beside it reads, 12- or 24-hour. */
export function alarmReading(time, hour12 = false) {
  const normal = normalizeAlarmTime(time);
  if (!normal) return '';
  if (!hour12) return normal;

  const [hours, minutes] = normal.split(':').map(Number);
  const shown = hours % 12 === 0 ? 12 : hours % 12;
  return `${shown}:${pad(minutes)} ${hours < 12 ? 'AM' : 'PM'}`;
}

/**
 * What the corner of the block shows.
 *
 * On the alarm page it is the clock, small, so the time is never out of sight.
 * On the clock page it is the way to the alarm: the alarm's time when one is
 * set and on, and just the bell when not -- it is still the button.
 *
 * `kind` is 'time' (the corner is a clock), 'alarm' (an active alarm) or
 * 'bell' (no active alarm, only the way in).
 */
export function cornerReading({ page = 'clock', time = '', enabled = false, hour12 = false, clockTime = '' } = {}) {
  if (page === 'alarm') {
    return { kind: 'time', text: clockTime };
  }
  const reading = alarmReading(time, hour12);
  if (enabled && reading) {
    return { kind: 'alarm', text: reading };
  }
  return { kind: 'bell', text: '' };
}

/**
 * What the alarm page says under the time: whether it is off, ringing, asleep,
 * or how long there is to go.
 *
 * `state` is 'unset', 'off', 'ringing', 'snoozed' or 'set'; `text` is what is
 * written. Hours and minutes rather than a clock time -- the time is already
 * written above it, and what a person checks is how long they have.
 */
export function alarmStatus({ now = Date.now(), time = '', enabled = false, device = {}, hour12 = false } = {}) {
  const normal = normalizeAlarmTime(time);
  if (!normal) return { state: 'unset', text: 'No time set' };
  if (!enabled) return { state: 'off', text: 'Off' };

  if (isRinging({ now, time: normal, enabled, device })) {
    return { state: 'ringing', text: 'Ringing' };
  }

  const state = readClockDevice(device);
  if (isSnoozed({ now, time: normal, enabled, device })) {
    const until = new Date(state.snoozedUntil);
    const reading = alarmReading(`${until.getHours()}:${pad(until.getMinutes())}`, hour12);
    return { state: 'snoozed', text: `Snoozed until ${reading}` };
  }

  return { state: 'set', text: `Rings ${inReading(nextAlarmMoment(now, normal) - now)}` };
}

/** "in 5 h 12 min", "in 12 min", "in under a minute". */
export function inReading(ms) {
  const minutes = Math.ceil(Math.max(0, ms) / MINUTE_MS);
  if (minutes < 1) return 'in under a minute';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `in ${rest} min`;
  if (!rest) return `in ${hours} h`;
  return `in ${hours} h ${rest} min`;
}

/** The local storage key for one clock block's device memory. */
export function clockDeviceKey(blockId) {
  return `austavia.clock.${blockId}`;
}
