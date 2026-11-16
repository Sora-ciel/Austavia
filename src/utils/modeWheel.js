/**
 * The scroll rule, in every mode that shows blocks: a block takes the wheel
 * only while it is focused; otherwise the wheel scrolls the mode.
 *
 * The rule is utils/scrollOwnership.js's, asked for on the Canvas (2026-05-18)
 * and again for Page mode and Simple Note (2026-11-16: "if it's a block mode,
 * then you first need to focus the block to scroll inside it, else it scrolls
 * the mode"). This is the one way a mode carries it out, so a new mode that
 * shows blocks gets it by attaching this, rather than with a copy.
 *
 * Carrying it out is the part that was missed once (scrollOwnership.js,
 * canvasMustTakeWheel): refusing the block is not enough, the browser would
 * still scroll it, so the mode prevents that and scrolls itself.
 *
 * Usage: <div use:modeWheel={{ blockSelector, isFocused }}> on the element
 * that scrolls the mode. Ctrl+wheel is left alone (zoom, a calendar's hours).
 */
import { scrollerUnderPointer } from './scrollerUnderPointer.js';
import { canvasMustTakeWheel, wheelPixels } from './scrollOwnership.js';

export function modeWheel(node, options = {}) {
  let current = options;

  function onWheel(event) {
    if (event.ctrlKey || current.enabled === false) return;
    const found = scrollerUnderPointer(event, node, current);
    if (!canvasMustTakeWheel(found)) return;
    if (event.cancelable) event.preventDefault();
    // Instant: a smooth scroll queued per wheel step is what made scrolling
    // from code go "in jumps" in Simple Note (2026-11-11).
    node.scrollTop += wheelPixels(event.deltaY, event.deltaMode, node.clientHeight);
    node.scrollLeft += wheelPixels(event.deltaX, event.deltaMode, node.clientWidth);
  }

  node.addEventListener('wheel', onWheel, { passive: false });
  return {
    update(next) { current = next || {}; },
    destroy() { node.removeEventListener('wheel', onWheel); }
  };
}
