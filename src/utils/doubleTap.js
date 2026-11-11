/**
 * A second tap close enough after the first to count as a double tap -- for
 * a finger, where a double-click is not reliably sent.
 *
 * Opening a picture in the viewer takes a double-click or a double tap in
 * every mode: asked 2026-11-11, "in canvas and other places where there's no
 * need for a double click need a double click to open the lightbox, for
 * consistency of ux". Simple Note already did it this way; the Canvas and
 * pages opened it on a second single click once the block was focused.
 */
export const DOUBLE_TAP_MS = 300;

/**
 * Whether a tap on `key` at `now` is the second of a double tap. `taps`
 * remembers the last tap of each key; a double tap is forgotten once
 * counted, so a third tap starts again.
 */
export function isDoubleTap(taps, key, now = Date.now(), within = DOUBLE_TAP_MS) {
  const previous = taps.get(key) || 0;
  if (previous && now - previous <= within) {
    taps.delete(key);
    return true;
  }
  taps.set(key, now);
  return false;
}
