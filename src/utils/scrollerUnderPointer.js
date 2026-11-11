/**
 * What is under the pointer, as the rule in utils/scrollOwnership.js needs it:
 * the first scrollable thing from the pointer up to `root`, whether it is
 * inside a block, and whether that block is focused.
 *
 * The DOM half of the rule, shared by every mode that holds blocks (CLAUDE.md,
 * "one of everything"): the Canvas had it to itself, and Simple Note had no
 * rule at all, so an unfocused calendar there scrolled under the wheel --
 * reported 2026-11-11, "going over the calendar without selecting it should
 * [not] activate the scroll. It should be focused before".
 *
 * `blockSelector` finds a block from inside it; `isFocused(block)` says
 * whether it is the focused one. Browser-only.
 */
export function scrollerUnderPointer(event, root, { blockSelector, isFocused }) {
  if (!root || !(event?.target instanceof Element)) return { scroller: false };

  let current = event.target;
  while (current && current !== root) {
    const style = getComputedStyle(current);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const canScrollY = (overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight;
    const canScrollX = (overflowX === 'auto' || overflowX === 'scroll') && current.scrollWidth > current.clientWidth;

    if (canScrollY || canScrollX) {
      const block = current.closest(blockSelector);
      return {
        scroller: true,
        insideBlock: Boolean(block),
        blockFocused: Boolean(block && isFocused(block))
      };
    }

    current = current.parentElement;
  }

  return { scroller: false };
}
