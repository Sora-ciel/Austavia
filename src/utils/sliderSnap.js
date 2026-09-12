/**
 * Letting a dragged slider land on the value that matters.
 *
 * A range from 0 to 200 has 201 values and about 118 pixels to put them in, so
 * roughly two in five cannot be reached by dragging at all — the pointer moves
 * one pixel and the value moves 1.69. Which values are missing depends on the
 * width, and on the panel as it is, 100 is one of them: the neutral setting,
 * the one people most want to get back to, and the only one they cannot reach
 * by hand. The arrow keys step by one and always could, which is why this looks
 * like nothing is wrong until somebody tries to drag.
 *
 * So a drag snaps to the neutral when it passes close to it. Two units either
 * side, which is a little over a pixel of travel — enough to catch, small
 * enough that nothing else feels sticky.
 *
 * What it costs is honest: while dragging, 98 to 102 all give 100. At a
 * luminosity nobody can see the difference, and the arrow keys still reach
 * every one of them, because this is only applied to pointer input. That is the
 * whole reason it is decided here rather than in the input handler — whether a
 * drag is in progress is something the call site knows and this does not.
 */

/** How far either side of the neutral a drag is pulled in. */
export const SNAP_TOLERANCE = 2;

/**
 * The value a drag should settle on.
 *
 * `snapping` is the caller saying a pointer is doing this rather than a key. It
 * is passed in rather than assumed, so keyboard input keeps every value.
 */
export function snapToNeutral(value, neutral, { snapping = true, tolerance = SNAP_TOLERANCE } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (!snapping) return n;

  const target = Number(neutral);
  if (!Number.isFinite(target)) return n;

  return Math.abs(n - target) <= tolerance ? target : n;
}
