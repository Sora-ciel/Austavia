/**
 * The little always-on-top windows for a clock block's timer and alarm, and
 * for a running timed habit or objective, in the desktop apps (Windows and
 * Linux).
 *
 * ## What was asked for
 *
 * "A pop-up for the timers that stays in front of every windowed app at all
 * times on Windows, for our clock block, when you start a timer" -- and then
 * "think about what we would want that little pop-up to have and how it should
 * behave for maximum ease of use and functions". — 2026-09-28.
 *
 * ## How it behaves, and why
 *
 * - **It opens by itself** when a timer starts, and closes by itself when the
 *   timer is stopped or reset in the app. Nobody should have to manage the
 *   window.
 * - **Stop in the pop-up keeps the pop-up**, with the timer set back to its
 *   length and a Start button, so the same timer can be run again from there.
 *   Asked for on 2026-09-28 once it had been tried: "clicking Stop on the
 *   pop-up shouldn't close the pop-up; it should put back the timer that was
 *   used at first so you can restart it from the pop-up itself." It stays
 *   until it is hidden with its own ×.
 * - **Hiding it is not stopping the timer**, and it stays hidden for the rest
 *   of that run -- but **it comes back when time is up**, whatever, because
 *   that is the one moment it exists for.
 * - **A ringing alarm gets one too**, so an alarm is not missed with the app
 *   minimised.
 * - **A timed habit or objective gets the same pop-up** -- asked 2026-11-10:
 *   "the same pop up of timer but pop up we can put for the timer of habits
 *   ... for linux and windows". One pop-up, not a second one written for
 *   habits: it shows the name, the time left, pause and resume, and Stop when
 *   it rings. It behaves as the timer's does -- open while it runs, hidden by
 *   its ×, back when time is up, kept after a pause pressed in it.
 * - It sits in the bottom-right corner above the taskbar, or wherever it was
 *   last dragged to, and several stack upwards rather than on top of each
 *   other.
 *
 * ## Why the windows need no messages
 *
 * A timer is kept as the moment it ends, in this device's local storage
 * (utils/countdown.js, clockDeviceStore.js). Every window of the app shares
 * that storage, and a write in one is announced to the others. So a pop-up
 * reads the same record as the block, and pausing in either is seen by both --
 * there is nothing to send between them and nothing to fall out of step.
 *
 * What is decided here is only which windows should exist and where. It is
 * worked out afresh on every tick from the clocks themselves -- absolute, not
 * a record of what was opened -- so a window that failed to open is opened on
 * the next tick, and one left over is closed.
 */
import { timerState, timerReading } from './countdown.js';
import { isRinging, normalizeAlarmTime } from './alarm.js';

// A third less tall and a little narrower than the first version, asked for
// once it had been tried: "use less height and less width -- the line that
// shows the passing of time for the width, and for the height I believe we can
// lose between a fourth and a third". The figure and its buttons share one
// row, and the bar is a hairline along the bottom edge. Then thinner again --
// "2 pixels as margins, even 4, should be the max": 48 is the two rows, the
// hairline and 2 to 5 pixels of padding, measured, with nothing to spare.
// 200 was tried with the buttons pressed up against the time, in two columns,
// and taken back (2026-09-29), then 240 with the one-row layout. Then, the
// same day: "between the count and the icons I would want around 20px of
// space, after accounting for if it's more than 10 minutes" -- so the width is
// worked out from the widest reading a timer normally shows, "59:59" (an hour
// or more reads "1h 05", the same width; see popupTimerReading), measured at
// the figure's 1.65rem:
//
//   border 1 + padding 6 + figure 70.5 + gap 20 + three buttons 92 + padding 4 + border 1
//
// A shorter reading ("4:59") just leaves more room.
export const POPUP_GAP_TO_BUTTONS = 20;
export const POPUP_WIDTH = 195;
export const POPUP_HEIGHT = 48;
export const POPUP_GAP = 10;
export const POPUP_MARGIN = 16;

/** Where a pop-up hidden by hand is remembered, per window. */
export const HIDDEN_KEY_PREFIX = 'austavia.popup.hidden.';
/** Where a pop-up kept open after its own Stop is remembered, per window. */
export const KEEP_KEY_PREFIX = 'austavia.popup.keep.';
/** Where the last place a pop-up was dragged to is remembered. */
export const POSITION_KEY = 'austavia.popup.position';
/** Where the app leaves its colours for the pop-ups to read. */
export const THEME_KEY = 'austavia.popup.theme';
/**
 * Where the main window leaves the running timed habits and objectives for
 * their pop-ups. Unlike a clock timer they live in the folder, which only the
 * main window holds, so it writes what each pop-up shows -- the entries of
 * goalTimers (utils/goalNotices.js), by key -- and a pop-up's buttons come
 * back the other way through GOAL_ACTION_KEY, to the same handler the
 * phone's notification uses (App.svelte, handleGoalAction).
 */
export const GOALS_KEY = 'austavia.popup.goals';
export const GOAL_ACTION_KEY = 'austavia.popup.goalAction';

/**
 * How the pop-up reads a timer: `4:59` and `59:59` as everywhere else, but an
 * hour or more as hours and minutes, `1h 05` -- "if the timer is in hours
 * then it shows hours and minutes instead of hours, minutes and seconds"
 * (2026-09-29). It keeps the reading as wide as `59:59`, which the window is
 * sized for, and nobody watching a two-hour timer needs its seconds.
 *
 * Counted the way `timerReading` counts, so the two agree on the second the
 * pop-up switches from `1h 00` to `59:59`.
 */
export function popupTimerReading(ms) {
  const total = Math.ceil(Math.max(0, Number(ms) || 0) / 1000);
  if (total < 3600) return timerReading(total * 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}`;
}

/**
 * A window label for a block's pop-up. Tauri allows letters, digits and
 * `-/:_` in a label; a block id is a UUID, which is already that.
 */
export function popupLabel(blockId, kind) {
  const safe = String(blockId || '').replace(/[^A-Za-z0-9_-]/g, '');
  return `clock-popup-${kind}-${safe}`;
}

/** A window label for a timed habit's or objective's pop-up, from its key. */
export function goalPopupLabel(key) {
  return popupLabel(String(key || '').replace(/:/g, '_'), 'goal');
}

/**
 * The pop-ups that should be open now, in a stable order.
 *
 * `blocks` are the folder's blocks; `devices` is this device's memory of each
 * clock (clockDeviceStore); `hidden` is the labels hidden by hand.
 *
 * `appInFront` is whether Austavia's own window has the focus. Then there are
 * none: "when in app the pop-up should close and when out of it come back"
 * (2026-09-29). Inside the app the toolbar has the timer (TimerChip) and the
 * app rings for itself, so a card on top would only cover it. Nothing is
 * forgotten meanwhile -- a pop-up hidden or kept is still hidden or kept when
 * the app goes to the back and they return.
 */
export function popupsWanted({ blocks = [], devices = {}, goals = [], now = Date.now(), hidden = new Set(), kept = new Set(), appInFront = false } = {}) {
  const wanted = [];
  if (appInFront) return wanted;

  for (const block of blocks || []) {
    if (block?.type !== 'clock' || !block.id) continue;
    const device = devices[block.id] || {};

    const phase = timerState(device.timer, now);
    const timerLabel = popupLabel(block.id, 'timer');
    // Switched off on this block's bottom-left corner: no pop-up for its
    // timer at all, running, kept or ringing.
    const popupOn = device.timerPopup !== false;
    const inUse = phase === 'running' || phase === 'paused';
    // Kept: stopped from the pop-up itself, which stays ready to start again.
    const keptReady = kept.has(timerLabel) && (phase === 'idle' || phase === 'done');
    if (popupOn && (phase === 'ringing' || (inUse && !hidden.has(timerLabel)) || keptReady)) {
      wanted.push({ blockId: block.id, kind: 'timer', label: timerLabel });
    }

    const time = normalizeAlarmTime(block.alarmTime);
    if (block.alarmEnabled === true && time && isRinging({ now, time, enabled: true, device })) {
      wanted.push({
        blockId: block.id,
        kind: 'alarm',
        label: popupLabel(block.id, 'alarm'),
        time,
        hour12: block.hour12 === true
      });
    }
  }

  // Timed habits and objectives, as goalTimers lists them: running, ringing,
  // or paused from their own pop-up (it lists those only when asked to keep
  // them). Hidden by hand stays hidden until it rings, as a timer's does.
  for (const goal of goals || []) {
    if (!goal?.blockId) continue;
    const label = goalPopupLabel(goal.blockId);
    if (goal.phase === 'ringing' || !hidden.has(label)) {
      wanted.push({ goalKey: goal.blockId, kind: 'goal', label });
    }
  }

  return wanted;
}

/**
 * Hidden-by-hand marks whose run is over, so they can be forgotten: a timer
 * that was stopped, reset or has run its course, or a clock that is gone.
 * Hiding lasts for one run; the next start shows the pop-up again.
 */
export function hiddenToForget({ blocks = [], devices = {}, goals = [], now = Date.now(), hidden = new Set() } = {}) {
  const live = new Set((goals || []).map(goal => goalPopupLabel(goal.blockId)));
  for (const block of blocks || []) {
    if (block?.type !== 'clock' || !block.id) continue;
    const phase = timerState((devices[block.id] || {}).timer, now);
    if (phase === 'running' || phase === 'paused' || phase === 'ringing') {
      live.add(popupLabel(block.id, 'timer'));
    }
  }
  return [...hidden].filter(label => !live.has(label));
}

/**
 * Kept-open marks for clocks that no longer exist in the folder. A kept
 * pop-up otherwise lasts until its own × is pressed.
 */
export function keptToForget({ blocks = [], goals = [], kept = new Set() } = {}) {
  const clocks = new Set(
    (blocks || []).filter(block => block?.type === 'clock' && block.id).map(block => popupLabel(block.id, 'timer'))
  );
  // A habit or objective kept after a pause in its pop-up: until it is done
  // or gone, which is when goalTimers stops listing it.
  for (const goal of goals || []) clocks.add(goalPopupLabel(goal.blockId));
  return [...kept].filter(label => !clocks.has(label));
}

/**
 * Where the `index`th pop-up goes, in logical pixels.
 *
 * `workArea` is the screen minus the taskbar, in logical pixels. Without a
 * remembered place, the first sits in the bottom-right corner above the
 * taskbar; with one, the first goes back there. The rest stack upwards from
 * the first, and are kept on the screen.
 */
export function popupPosition({ workArea, index = 0, saved = null } = {}) {
  const area = workArea || { x: 0, y: 0, width: 1280, height: 720 };
  const step = (POPUP_HEIGHT + POPUP_GAP) * index;

  const base = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
    ? { x: saved.x, y: saved.y }
    : {
        x: area.x + area.width - POPUP_WIDTH - POPUP_MARGIN,
        y: area.y + area.height - POPUP_HEIGHT - POPUP_MARGIN
      };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
  return {
    x: Math.round(clamp(base.x, area.x, area.x + area.width - POPUP_WIDTH)),
    y: Math.round(clamp(base.y - step, area.y, area.y + area.height - POPUP_HEIGHT))
  };
}

/** What the thin bar under a timer shows: how much of its length is left, 0 to 1. */
export function timerFractionLeft(left, duration) {
  const total = Number(duration) || 0;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (Number(left) || 0) / total));
}
