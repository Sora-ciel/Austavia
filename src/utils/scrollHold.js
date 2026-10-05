/**
 * Keeping a rebuilt note where it was read to while its pictures arrive.
 *
 * Reported on 2026-10-05: on the canvas, text blocks with pictures in them
 * jumped every time something rebuilt them. A rebuilt editor puts its scroll
 * back as soon as there is room for it -- but a picture has no height until it
 * has loaded, so the place it goes back to is measured against a note with the
 * pictures missing. When they arrive, everything below them moves down and
 * the note appears to jump.
 *
 * So after putting the reader back, the editor holds them there: each time the
 * writing changes size during the hold, the position is put back again. The
 * remembered position was taken with the pictures loaded, so once they are,
 * it is exactly right again.
 *
 * The hold ends as soon as the reader does anything themselves -- wheel,
 * touch, click, key -- and after HOLD_MS regardless: a note that keeps
 * changing size for longer than that is being changed by something else, and
 * should not be fought over.
 */

export const HOLD_MS = 2500;

/**
 * Where to put the scroll now, or null to leave it alone.
 *
 * `room` is how far the scroller can scroll (scrollHeight - clientHeight).
 * Not before there is room for the whole target: setting less would clamp,
 * and the clamped place is the wrong one.
 */
export function heldScrollTop({ target = 0, until = 0, now = Date.now(), room = 0, released = false } = {}) {
  if (released) return null;
  if (!(target > 1)) return null;
  if (now > until) return null;
  if (room < target) return null;
  return target;
}
