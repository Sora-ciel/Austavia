/**
 * Following one finger from where it went down to where it lifts.
 *
 * A touch's moves and its end are addressed to the element it began on, for
 * as long as the finger is down -- even after that element has been taken out
 * of the page. Taken out, it has no parents, so nothing reaches the window:
 * a listener there hears the start and then silence. A sync that redraws a
 * mode or the bar under a sliding finger did exactly that, and the slide to
 * the next mode was lost (reported 2026-11-21: "the swiping of modes should
 * never be blocked by anything, even the sync").
 *
 * So the rest of the touch is listened for on the element it began on, which
 * hears it whether or not it is still in the page. Returns a function that
 * stops listening; it also stops by itself when the touch ends.
 */
export function followTouch(target, { move, end, cancel } = {}) {
  if (!target || typeof target.addEventListener !== 'function') return () => {};
  const onMove = event => move?.(event);
  const onEnd = event => { stop(); end?.(event); };
  const onCancel = event => { stop(); cancel?.(event); };
  function stop() {
    target.removeEventListener('touchmove', onMove);
    target.removeEventListener('touchend', onEnd);
    target.removeEventListener('touchcancel', onCancel);
  }
  // Not passive: once a slide is the bar's, a move is stopped from scrolling
  // what is behind it.
  target.addEventListener('touchmove', onMove, { passive: false });
  target.addEventListener('touchend', onEnd, { passive: false });
  target.addEventListener('touchcancel', onCancel);
  return stop;
}
