/**
 * The little always-on-top windows for a clock block's timer and alarm, on the
 * Windows app.
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
import { timerState } from './countdown.js';
import { isRinging, normalizeAlarmTime } from './alarm.js';

// A third less tall and a little narrower than the first version, asked for
// once it had been tried: "use less height and less width -- the line that
// shows the passing of time for the width, and for the height I believe we can
// lose between a fourth and a third". The figure and its buttons share one
// row, and the bar is a hairline along the bottom edge. Then thinner again --
// "2 pixels as margins, even 4, should be the max": 48 is the two rows, the
// hairline and 2 to 5 pixels of padding, measured, with nothing to spare.
// Narrower again once the buttons sat right beside the time instead of at the
// far edge (2026-09-29): 200 holds the widest case, a timer of an hour or
// more, measured.
export const POPUP_WIDTH = 200;
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
 * A window label for a block's pop-up. Tauri allows letters, digits and
 * `-/:_` in a label; a block id is a UUID, which is already that.
 */
export function popupLabel(blockId, kind) {
  const safe = String(blockId || '').replace(/[^A-Za-z0-9_-]/g, '');
  return `clock-popup-${kind}-${safe}`;
}

/**
 * The pop-ups that should be open now, in a stable order.
 *
 * `blocks` are the folder's blocks; `devices` is this device's memory of each
 * clock (clockDeviceStore); `hidden` is the labels hidden by hand.
 */
export function popupsWanted({ blocks = [], devices = {}, now = Date.now(), hidden = new Set(), kept = new Set() } = {}) {
  const wanted = [];

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

  return wanted;
}

/**
 * Hidden-by-hand marks whose run is over, so they can be forgotten: a timer
 * that was stopped, reset or has run its course, or a clock that is gone.
 * Hiding lasts for one run; the next start shows the pop-up again.
 */
export function hiddenToForget({ blocks = [], devices = {}, now = Date.now(), hidden = new Set() } = {}) {
  const live = new Set();
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
export function keptToForget({ blocks = [], kept = new Set() } = {}) {
  const clocks = new Set(
    (blocks || []).filter(block => block?.type === 'clock' && block.id).map(block => popupLabel(block.id, 'timer'))
  );
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
