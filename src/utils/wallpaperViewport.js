/**
 * How tall the wallpaper should be, which is not always how tall the window is.
 *
 * ## What was reported
 *
 * "The background image moves up when the phone keyboard shows itself."
 *
 * The wallpaper fills the mode it sits in, and since 0.8.56 the Android
 * keyboard genuinely shrinks the page: the window is resized to the room above
 * it, so the controls stay reachable and the editor can bring the caret into
 * view. That is the right behaviour and it is why the writing works at all.
 *
 * But a picture sized to `cover` a box that has just become shorter is
 * re-fitted to the new box, and a centred picture re-fitted shorter appears to
 * jump upwards. Nothing moved it; the frame around it changed.
 *
 * ## Telling a keyboard from a smaller window
 *
 * The wallpaper should keep its height while a keyboard is up, and follow the
 * window the rest of the time. So the two have to be told apart, and a
 * percentage of shrink is not the way — somebody dragging a window edge can
 * shrink it by any amount.
 *
 * A keyboard is only ever up while something is being typed into. That is the
 * signal, and it is exact rather than a guess: a height that drops while
 * writing, with the width unchanged, is a keyboard. A height that drops with no
 * caret anywhere is a window getting smaller, and the wallpaper should follow
 * it.
 *
 * Width is checked because a rotation changes both, and after a rotation the
 * old height means nothing.
 */

/**
 * The height to draw the wallpaper at.
 *
 * Everything is passed in, including whether anything is being typed into, so
 * this can be argued with outside a browser.
 */
export function steadyWallpaperHeight({
  previousHeight = 0,
  previousWidth = 0,
  width = 0,
  height = 0,
  typing = false
} = {}) {
  const now = Number(height);
  const before = Number(previousHeight);

  // Nothing usable to work from: keep whatever was already being used rather
  // than collapsing the picture to nothing.
  if (!Number.isFinite(now) || now <= 0) return Number.isFinite(before) && before > 0 ? before : 0;

  // Never measured before, so there is nothing to compare against.
  if (!Number.isFinite(before) || before <= 0) return now;

  // A rotation, or a window resized across rather than down. The old height is
  // about a shape that no longer exists.
  if (Number(width) !== Number(previousWidth)) return now;

  // Taller than it was: a keyboard closing, or more room. Always take it --
  // holding a smaller height back would leave the picture short of the bottom.
  if (now >= before) return now;

  // Shorter, and something is being written into: a keyboard. Hold still.
  if (typing) return before;

  // Shorter with nothing focused: the window really is smaller.
  return now;
}

/** Whether what is focused is something a keyboard would have opened for. */
export function isTyping(element) {
  if (!element) return false;
  const tag = element.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  return Boolean(element.isContentEditable);
}
