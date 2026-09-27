// The alarm half of the clock block.
//
// Asked for on 2026-09-27, in the user's words: "I wanted an alarm block. Make
// it a block that does both, and which one is open is an on-device save. On the
// alarm page the clock still shows small in a corner, and on the clock page one
// click puts it in alarm mode, and an active alarm shows in that same corner."
//
// So these are wanted, not accidents: the page a block is on is this device's
// and nobody else's; the alarm page keeps the time in its corner; the clock page
// keeps the alarm in the same corner. If one of these looks wrong to you, it
// was asked for -- change it as a decision, not as a tidy-up.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  RING_WINDOW_MS,
  SNOOZE_MS,
  MAX_WAIT_MS,
  normalizeAlarmTime,
  alarmMomentOn,
  lastAlarmMoment,
  nextAlarmMoment,
  readClockDevice,
  isRinging,
  isSnoozed,
  dismissed,
  snoozed,
  msUntilAlarmCheck,
  alarmReading,
  cornerReading,
  clockDeviceKey,
  alarmStatus,
  inReading
} from '../src/utils/alarm.js';

const at = (day, hours, minutes, seconds = 0) => new Date(2026, 8, day, hours, minutes, seconds).getTime();
const MINUTE = 60 * 1000;

describe('normalizeAlarmTime', () => {
  it('takes what a time input gives and what a person types', () => {
    assert.equal(normalizeAlarmTime('07:30'), '07:30');
    assert.equal(normalizeAlarmTime('7:30'), '07:30');
    assert.equal(normalizeAlarmTime(' 23:59 '), '23:59');
  });

  it('is no alarm rather than a guess when the time is not one', () => {
    for (const bad of ['', '24:00', '7:60', '730', 'seven', null, undefined, 7.5]) {
      assert.equal(normalizeAlarmTime(bad), '', `for ${bad}`);
    }
  });
});

describe('when the alarm is due', () => {
  it('is due at that time where the person is', () => {
    const due = new Date(alarmMomentOn(at(27, 3, 0), '07:30'));
    assert.equal(due.getHours(), 7);
    assert.equal(due.getMinutes(), 30);
    assert.equal(due.getDate(), 27);
  });

  it('was last due this morning once the morning has passed, and yesterday before it', () => {
    assert.equal(lastAlarmMoment(at(27, 9, 0), '07:30'), at(27, 7, 30));
    assert.equal(lastAlarmMoment(at(27, 6, 0), '07:30'), at(26, 7, 30));
  });

  it('is next due tomorrow once today\'s has gone', () => {
    assert.equal(nextAlarmMoment(at(27, 6, 0), '07:30'), at(27, 7, 30));
    assert.equal(nextAlarmMoment(at(27, 7, 30), '07:30'), at(28, 7, 30));
  });
});

describe('isRinging', () => {
  const alarm = { time: '07:30', enabled: true };

  it('rings when its time comes', () => {
    assert.equal(isRinging({ ...alarm, now: at(27, 7, 30) }), true);
    assert.equal(isRinging({ ...alarm, now: at(27, 7, 29, 59) }), false);
  });

  it('does not ring when it is switched off', () => {
    assert.equal(isRinging({ ...alarm, enabled: false, now: at(27, 7, 31) }), false);
  });

  it('keeps ringing for a while if nobody answers, then gives up', () => {
    assert.equal(isRinging({ ...alarm, now: at(27, 7, 30) + RING_WINDOW_MS - 1 }), true);
    assert.equal(isRinging({ ...alarm, now: at(27, 7, 30) + RING_WINDOW_MS }), false);
  });

  // An alarm that goes off two hours late is a noise, not an alarm.
  it('does not go off late because the app was closed when it was due', () => {
    assert.equal(isRinging({ ...alarm, now: at(27, 9, 30) }), false);
  });

  it('stops when answered, and comes back tomorrow on its own', () => {
    const device = dismissed({}, at(27, 7, 31));

    assert.equal(isRinging({ ...alarm, device, now: at(27, 7, 32) }), false);
    assert.equal(isRinging({ ...alarm, device, now: at(28, 7, 30) }), true);
  });

  // What is remembered is a moment, not a day, because a day goes wrong at
  // midnight: answered at 00:03 must not silence that day's own alarm.
  it('answering just after midnight does not silence that day\'s alarm', () => {
    const lateAlarm = { time: '23:55', enabled: true };
    const device = dismissed({}, at(28, 0, 3));

    assert.equal(isRinging({ ...lateAlarm, device, now: at(28, 23, 55) }), true);
  });

  it('rings for a later time set after this morning\'s was answered', () => {
    const device = dismissed({}, at(27, 7, 31));
    assert.equal(isRinging({ time: '08:00', enabled: true, device, now: at(27, 8, 0) }), true);
  });

  it('goes quiet on snooze and rings again when the snooze runs out', () => {
    const device = snoozed({}, '07:30', at(27, 7, 31));

    assert.equal(isRinging({ ...alarm, device, now: at(27, 7, 32) }), false);
    assert.equal(isRinging({ ...alarm, device, now: at(27, 7, 31) + SNOOZE_MS }), true);
    assert.equal(isRinging({ ...alarm, device, now: at(27, 7, 31) + SNOOZE_MS + RING_WINDOW_MS }), false);
  });

  // A snooze belongs to the time it was taken on: move the alarm to tomorrow
  // and it must not go off in five minutes anyway.
  it('forgets a snooze once the alarm time is changed', () => {
    const device = snoozed({}, '07:30', at(27, 7, 31));
    assert.equal(isRinging({ time: '09:00', enabled: true, device, now: at(27, 7, 36) }), false);
  });

  it('says it is snoozed only while it is', () => {
    const device = snoozed({}, '07:30', at(27, 7, 31));
    assert.equal(isSnoozed({ ...alarm, device, now: at(27, 7, 33) }), true);
    assert.equal(isSnoozed({ ...alarm, device, now: at(27, 7, 31) + SNOOZE_MS }), false);
    assert.equal(isSnoozed({ ...alarm, enabled: false, device, now: at(27, 7, 33) }), false);
  });
});

describe('readClockDevice', () => {
  // The page a block is on is this device's own -- it was asked for as "an
  // on-device save" -- so what is read back has to survive anything local
  // storage might hold.
  it('opens on the clock unless this device was left on the alarm', () => {
    assert.equal(readClockDevice(null).page, 'clock');
    assert.equal(readClockDevice('not json').page, 'clock');
    assert.equal(readClockDevice(JSON.stringify({ page: 'somewhere' })).page, 'clock');
    assert.equal(readClockDevice(JSON.stringify({ page: 'alarm' })).page, 'alarm');
  });

  it('keeps what it was answered with across a save and a read', () => {
    const saved = JSON.stringify(snoozed({ page: 'alarm' }, '7:30', 1000));
    const read = readClockDevice(saved);

    assert.equal(read.page, 'alarm');
    assert.equal(read.answeredAt, 1000);
    assert.equal(read.snoozedUntil, 1000 + SNOOZE_MS);
    assert.equal(read.snoozedFor, '07:30');
  });

  it('gives each block its own place on the device', () => {
    assert.notEqual(clockDeviceKey('a'), clockDeviceKey('b'));
  });
});

describe('msUntilAlarmCheck', () => {
  it('wakes when the alarm comes due', () => {
    const wait = msUntilAlarmCheck({ now: at(27, 7, 29, 30), alarms: [{ time: '07:30', enabled: true }] });
    assert.ok(wait >= 30_000 && wait < 30_100, `waited ${wait}ms`);
  });

  it('wakes when a ring runs out, so the banner goes away', () => {
    const now = at(27, 7, 30) + RING_WINDOW_MS - 5000;
    const wait = msUntilAlarmCheck({ now, alarms: [{ time: '07:30', enabled: true }] });
    assert.ok(wait >= 5000 && wait < 5100, `waited ${wait}ms`);
  });

  it('wakes when a snooze ends', () => {
    const device = snoozed({}, '07:30', at(27, 7, 31));
    const now = at(27, 7, 31) + SNOOZE_MS - 2000;
    const wait = msUntilAlarmCheck({ now, alarms: [{ time: '07:30', enabled: true, device }] });
    assert.ok(wait >= 2000 && wait < 2100, `waited ${wait}ms`);
  });

  // Never trust a timer aimed hours ahead: a phone that sleeps keeps it late
  // or never. Look again at least once a minute and work it out afresh.
  it('never waits longer than a minute, however far off the alarm is', () => {
    const wait = msUntilAlarmCheck({ now: at(27, 22, 0), alarms: [{ time: '07:30', enabled: true }] });
    assert.ok(wait <= MAX_WAIT_MS + 20, `waited ${wait}ms`);
    assert.ok(msUntilAlarmCheck({ now: at(27, 22, 0), alarms: [] }) <= MAX_WAIT_MS + 20);
  });

  it('ignores alarms that are off or have no time', () => {
    const wait = msUntilAlarmCheck({
      now: at(27, 7, 29, 30),
      alarms: [{ time: '07:30', enabled: false }, { time: '', enabled: true }]
    });
    assert.ok(wait > 59 * 1000);
  });
});

describe('alarmReading', () => {
  it('reads the alarm the way the clock beside it reads', () => {
    assert.equal(alarmReading('07:30'), '07:30');
    assert.equal(alarmReading('07:30', true), '7:30 AM');
    assert.equal(alarmReading('00:05', true), '12:05 AM');
    assert.equal(alarmReading('12:00', true), '12:00 PM');
    assert.equal(alarmReading('nonsense', true), '');
  });
});

describe('cornerReading', () => {
  // "On the alarm page the clock still shows small in a corner."
  it('keeps the time in the corner while the alarm page is open', () => {
    const corner = cornerReading({ page: 'alarm', clockTime: '14:05', time: '07:30', enabled: true });
    assert.deepEqual(corner, { kind: 'time', text: '14:05' });
  });

  // "...and an active alarm shows in that same corner."
  it('shows an active alarm in the same corner while the clock page is open', () => {
    const corner = cornerReading({ page: 'clock', time: '07:30', enabled: true });
    assert.deepEqual(corner, { kind: 'alarm', text: '07:30' });
  });

  // "...on the clock page one click puts it in alarm mode" -- so the corner is
  // still there, as the way in, when no alarm is on.
  it('still offers the way to the alarm when none is on', () => {
    assert.equal(cornerReading({ page: 'clock', time: '07:30', enabled: false }).kind, 'bell');
    assert.equal(cornerReading({ page: 'clock', time: '', enabled: true }).kind, 'bell');
  });

  it('reads the alarm in the corner on a 12-hour clock as 12-hour', () => {
    assert.equal(cornerReading({ page: 'clock', time: '19:00', enabled: true, hour12: true }).text, '7:00 PM');
  });
});

describe('alarmStatus', () => {
  const now = at(27, 2, 18);

  it('says how long there is to go, not the time again', () => {
    assert.deepEqual(alarmStatus({ now, time: '07:30', enabled: true }), { state: 'set', text: 'Rings in 5 h 12 min' });
  });

  it('says when it is off, or has no time', () => {
    assert.equal(alarmStatus({ now, time: '07:30', enabled: false }).state, 'off');
    assert.equal(alarmStatus({ now, time: '', enabled: true }).state, 'unset');
  });

  it('says when it is ringing', () => {
    assert.equal(alarmStatus({ now: at(27, 7, 31), time: '07:30', enabled: true }).state, 'ringing');
  });

  it('says until when it is snoozed, the way the clock reads', () => {
    const device = snoozed({}, '07:30', at(27, 7, 31));
    assert.deepEqual(
      alarmStatus({ now: at(27, 7, 32), time: '07:30', enabled: true, device, hour12: true }),
      { state: 'snoozed', text: 'Snoozed until 7:36 AM' }
    );
  });
});

describe('inReading', () => {
  it('reads a wait the way a person says it', () => {
    assert.equal(inReading(0), 'in under a minute');
    assert.equal(inReading(30 * 1000), 'in 1 min');
    assert.equal(inReading(12 * MINUTE), 'in 12 min');
    assert.equal(inReading(120 * MINUTE), 'in 2 h');
    assert.equal(inReading(125 * MINUTE), 'in 2 h 5 min');
  });
});
