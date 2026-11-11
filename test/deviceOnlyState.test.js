import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Asked 2026-10-26: "all content should be syncable in modes -- whenever we
// make changes or add a function that adds information, like the check square
// in TipTap, or objective and amount in tasks, it should all sync with our sync
// structure like other things before." See CLAUDE.md, "Everything somebody
// makes syncs".
//
// Content lives in the folder (a block, or the mode settings) and sync carries
// it. What a device keeps for itself is only how it shows things. Every file
// that keeps anything on the device is listed here with why it is not content;
// a file that starts doing so fails this test until somebody has decided that.

const DEVICE_ONLY = {
  'App.svelte': 'last folder and mode, volume, shuffle, sync bookkeeping, type scale, theme extras, pending deletes',
  'advanced-param/RightControls.svelte': 'which panels are open',
  'components/AlarmRinger.svelte': 'alarms and rings answered on this device (asked per device)',
  'components/CalendarBlock.svelte': 'the height of an hour and day or 7 days, through utils/calendarView.js',
  'components/ClockPopupWindows.svelte': 'where the clock pop-up sits on this screen',
  'components/TimerChip.svelte': 'reads the objective rings stopped on this device, to leave them out of the notification',
  'components/TaskGoalLine.svelte': 'whether a timed habit opens the pop-up on this computer (as the clock block\'s switch, per device)',
  'components/TaskBlock.svelte': 'the last goal set, as the default for the next (as Task mode)',
  'components/ColorPicker.svelte': 'the colour format last chosen',
  'components/NotePicker.svelte': 'the picker layout last chosen',
  'Modes/HabitTrackerMode.svelte': 'the last goal set, as the default for the next (as Task mode)',
  'Modes/PlaylistMode.svelte': 'which playlist is open, and the order the music is listed in (asked per device)',
  'Modes/SingleNoteMode.svelte': 'which note was open',
  'Modes/TaskMode.svelte': 'the Done list open or shut (asked per device)',
  'popup/ClockPopup.svelte': 'the pop-up kept, hidden or moved on this screen',
  'utils/calendarView.js': 'the height of an hour (asked per device) and day or 7 days, on this screen',
  'utils/clockDeviceStore.js': 'a clock\'s open page, answered alarm and snooze, on this device (see alarm.js)',
  'utils/habitStore.js': 'only reads the old private list, to move it into the folder',
  'utils/musicCovers.js': 'tracks known to have no cover, a cache',
  'utils/scrollMemory.js': 'scroll positions',
  'utils/storageJournal.js': 'a diagnostic log of what this device held',
  'utils/syncLog.js': 'a diagnostic log of this device\'s syncs',
  'utils/taskGoalRings.js': 'objective rings stopped on this device (as a timer\'s are)',
  'utils/taskModeView.js': 'the Done list open or shut, the last goal used as a default'
};

const ROOT = new URL('../src/', import.meta.url).pathname;

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(js|svelte)$/.test(name) ? [path] : [];
  });
}

test('everything somebody makes syncs: only files listed with a reason keep anything on the device', () => {
  const unlisted = sourceFiles(ROOT)
    .filter(path => /localStorage|sessionStorage/.test(readFileSync(path, 'utf8')))
    .map(path => relative(ROOT, path).split('\\').join('/'))
    .filter(path => !(path in DEVICE_ONLY));
  assert.deepEqual(unlisted, [], 'keeps something on the device: if it is content, it belongs in the folder');
});
