/**
 * Whether the click that focuses a block should also put the caret in it.
 *
 * ## What was asked for
 *
 * "Before, when we put a block text in focus it also put the caret at the same
 * time, but now we need to click two times to get those two actions. I want
 * those things to happen in one click, it's more natural."
 *
 * ## Why it takes two
 *
 * An unfocused block's writing is deliberately untouchable — `pointer-events:
 * none` on its editor — so that dragging the canvas across a board full of
 * blocks works, and so that a tap lands on the block itself and focuses it.
 * That rule is load-bearing and stays; the note on it in BlockShell.svelte
 * explains what was tried instead and why making the scroller unscrollable was
 * worse.
 *
 * The cost is that the click which focuses a block cannot also reach the
 * writing, because at the moment it happens the writing is not there to be hit.
 * So the caret waits for a second click.
 *
 * The answer is not to remove the rule but to finish the job: once the block is
 * focused, put the caret where the click landed, which is where the browser
 * would have put it if the writing had been reachable.
 *
 * ## When not to
 *
 * - **A block that was already focused** does its own thing. The browser places
 *   the caret, selections work, double-click selects a word — none of which
 *   should be overridden by putting a caret wherever the last click was.
 * - **A drag** is a move, not a place. Somebody who picked a block up and put it
 *   down somewhere else has not asked to start writing in it.
 * - **The header, the handles, the colour fields.** Those are chrome; a click on
 *   them is about the block, not about its writing.
 */

/**
 * `wasFocused` is the state *before* this click, because the click is what
 * changes it — asking afterwards always says yes.
 */
export function shouldPlaceCaret({
  wasFocused = false,
  insideWriting = false,
  dragged = false
} = {}) {
  if (wasFocused) return false;
  if (dragged) return false;
  return Boolean(insideWriting);
}

/**
 * Whether a point is inside a box, with the box given rather than measured.
 *
 * Separate so the rule can be argued with without a browser: a click lands at a
 * point, the writing occupies a rectangle, and "did they click on the writing"
 * is that question and nothing more.
 */
export function pointIsInside(point, box) {
  if (!point || !box) return false;
  const { x, y } = point;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}
