/**
 * Who gets the wheel on the canvas: a block, or the board under it.
 *
 * ## The rule
 *
 * A scroller inside a block takes the wheel **only while that block is
 * focused**. Otherwise every block is a hole in the canvas — the pointer sits
 * over one more often than not on a full board, and the board cannot be moved
 * at all. A block is focused by clicking it, which is the same act that puts
 * the caret in it, so the block that takes the scroll is the one being worked
 * in. A scroller that is not inside a block — a mode's own panel — always takes
 * it; there is no block for it to belong to.
 *
 * ## Why this is a module and not four lines in CanvasMode
 *
 * This rule was asked for, built on 2026-05-18, and deleted on 2026-08-26 while
 * fixing a different complaint about scrolling escaping into the canvas. The
 * focus requirement looked like the cause, so it went — and the commit that
 * removed it recorded a confident explanation of why it had been wrong, which
 * then read like history to everyone afterwards, including its author.
 *
 * Nothing stopped that. The rule lived inside a `.svelte` file, where no test
 * can reach it, and the commit that introduced it was one line with no body. So
 * the only trace that anyone had ever wanted this was a request in a
 * conversation months earlier, and removing it cost nothing and broke no test.
 *
 * It is here because a rule somebody asked for has to be able to say so. The
 * tests next to this file name the behaviour rather than the implementation, so
 * taking it out again fails the suite with the request written in the failure —
 * which is the part a confident explanation cannot talk its way past.
 *
 * The walking of the DOM stays at the call site, which has a DOM. What is
 * decided is here.
 */

/**
 * Whether the nested scroller under the pointer should keep the wheel.
 *
 * @param {object} found  what the call site found walking up from the pointer
 * @param {boolean} found.scroller      a scrollable ancestor was found at all
 * @param {boolean} found.insideBlock   that scroller is inside a canvas block
 * @param {boolean} found.blockFocused  and that block is the focused one
 */
export function nestedScrollerTakesWheel({
  scroller = false,
  insideBlock = false,
  blockFocused = false
} = {}) {
  if (!scroller) return false;
  if (!insideBlock) return true;
  return blockFocused;
}
