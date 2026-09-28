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
 *   timer is stopped or reset. Nobody should have to manage the window.
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

export const POPUP_WIDTH = 260;
export const POPUP_HEIGHT = 112;
export const POPUP_GAP = 10;
export const POPUP_MARGIN = 16;

/** Where a pop-up hidden by hand is remembered, per window. */
export const HIDDEN_KEY_PREFIX = 'austavia.popup.hidden.';
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
export function popupsWanted({ blocks = [], devices = {}, now = Date.now(), hidden = new Set() } = {}) {
  const wanted = [];

  for (const block of blocks || []) {
    if (block?.type !== 'clock' || !block.id) continue;
    const device = devices[block.id] || {};

    const phase = timerState(device.timer, now);
    const timerLabel = popupLabel(block.id, 'timer');
    if (phase === 'ringing' || ((phase === 'running' || phase === 'paused') && !hidden.has(timerLabel))) {
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
