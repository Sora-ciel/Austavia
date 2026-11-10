/**
 * How the calendar is shown on this device -- the height of an hour, and
 * day or 7 days. How it looks on this screen, not content, so it stays on
 * the device (CLAUDE.md, "Everything somebody makes syncs").
 *
 * Asked 2026-11-10: "for the calendar on pc i want to be able to press
 * control to change the height of each hour to make it easier to put some
 * things. also i want that height to be saved per device." Ctrl and the
 * wheel (or a pinch, which browsers report as one) grow or shrink an hour.
 * A calendar drawn full size (Calendar mode) and one drawn as a block keep
 * a height each, since they are different sizes to begin with.
 */

export const HOUR_KEY = 'austavia.calendar.hourHeight';
export const VIEW_KEY = 'austavia.calendar.view';
export const MIN_HOUR = 24;
export const MAX_HOUR = 200;
export const DEFAULT_HOUR = { big: 64, block: 44 };
export const VIEWS = ['day', 'week'];

const clampHour = value => Math.max(MIN_HOUR, Math.min(MAX_HOUR, Math.round(value)));

function readAll(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem(key) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeAll(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered: the next visit opens on the default.
  }
}

/** An hour's height on this device, for a calendar drawn full size (`big`) or as a block. */
export function readHourHeight(storage, big) {
  const which = big ? 'big' : 'block';
  const value = Number(readAll(storage, HOUR_KEY)[which]);
  return Number.isFinite(value) && value > 0 ? clampHour(value) : DEFAULT_HOUR[which];
}

export function writeHourHeight(storage, big, height) {
  const all = readAll(storage, HOUR_KEY);
  all[big ? 'big' : 'block'] = clampHour(height);
  writeAll(storage, HOUR_KEY, all);
}

/**
 * The height after one turn of the wheel with Ctrl held: a tenth more or
 * less, never past the limits. Turning the wheel down (towards you) makes
 * the hours taller, up makes them shorter -- the first version had it the
 * other way, and it was reported the same day as backwards.
 */
export function zoomedHour(height, deltaY) {
  if (!deltaY) return clampHour(height);
  const factor = deltaY > 0 ? 1.1 : 1 / 1.1;
  return clampHour(height * factor);
}

/** Day or 7 days, for this calendar block, on this device. */
export function readView(storage, blockId) {
  const view = readAll(storage, VIEW_KEY)[blockId];
  return VIEWS.includes(view) ? view : 'day';
}

export function writeView(storage, blockId, view) {
  if (!VIEWS.includes(view)) return;
  const all = readAll(storage, VIEW_KEY);
  all[blockId] = view;
  writeAll(storage, VIEW_KEY, all);
}
