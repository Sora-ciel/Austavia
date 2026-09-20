/**
 * Holding a finger down on something, and what that means.
 *
 * ## What was asked for
 *
 * "On mobile, the thing to close the habit should probably be a pop-up, like we
 * have after long press, on the line of our habit — then it should show delete.
 * So that you can remove the delete button that shows itself at all time."
 *
 * Which is the right trade on a phone: the delete was costing a permanent slot
 * in a row that is now one line tall, to offer something wanted about once in
 * the life of a habit.
 *
 * ## Why this is not just a timer
 *
 * Three things have to be true, and only the first is obvious:
 *
 * - **Long enough.** Half a second is the usual figure and is what Android
 *   itself uses.
 * - **Still enough.** A finger that moves is scrolling, and a list of habits is
 *   something people scroll. Without this the menu opens in the middle of a
 *   flick, which is worse than having no menu.
 * - **And then the tap must not also happen.** A long press on a habit ends
 *   with a finger lifting off a day square, and that square would otherwise be
 *   marked done by the same gesture that opened the menu.
 */

/** Android's own long-press threshold. */
export const LONG_PRESS_MS = 500;

/**
 * How far a finger may drift and still count as held.
 *
 * Generous on purpose: a finger resting on glass wanders a few pixels without
 * anybody meaning it to, and a press that needs perfect stillness reads as
 * broken rather than as strict.
 */
export const MOVE_TOLERANCE = 12;

/** Whether two points are far enough apart to be a scroll rather than a wobble. */
export function movedTooFar(from, to, tolerance = MOVE_TOLERANCE) {
  if (!from || !to) return false;
  return Math.abs(to.x - from.x) > tolerance || Math.abs(to.y - from.y) > tolerance;
}

/**
 * A long press, with the timers injected so it can be exercised without one.
 *
 * `finish()` returns whether the press had already become a long one, which is
 * how the caller knows to swallow the click that follows.
 */
export function createLongPress({
  onLongPress,
  delay = LONG_PRESS_MS,
  tolerance = MOVE_TOLERANCE,
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  let timer = null;
  let origin = null;
  let fired = false;

  const stop = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  return {
    start(point) {
      stop();
      origin = point || { x: 0, y: 0 };
      fired = false;
      timer = setTimer(() => {
        timer = null;
        fired = true;
        onLongPress?.(origin);
      }, delay);
    },

    /** A finger that has wandered off is scrolling, not holding. */
    move(point) {
      if (timer === null) return;
      if (movedTooFar(origin, point, tolerance)) stop();
    },

    /** Called on pointerup. True means the click after it should be swallowed. */
    finish() {
      stop();
      const wasLong = fired;
      fired = false;
      return wasLong;
    },

    /** Dropped entirely — the pointer was cancelled, or the row went away. */
    cancel() {
      stop();
      fired = false;
    },

    get waiting() {
      return timer !== null;
    }
  };
}
