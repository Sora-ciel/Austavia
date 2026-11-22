/**
 * Blocks made in another mode, placed on the Canvas when it is opened.
 *
 * Asked 2026-11-22: "when you add a block but canvas isn't open, when you
 * finally open canva the block is superposed to other blocks not following
 * the logic that makes it so that blocks are added in a manner that doesn't
 * make them superpose." Every block made outside the Canvas was put at
 * 100, 100, on top of whatever was there.
 *
 * Now such a block is marked `canvasUnplaced` and given a stand-in position
 * under everything else (so even a version without this rule shows it clear
 * of the rest). When the Canvas opens, each marked block is placed as one
 * added on the Canvas is -- the first free spot near where you are looking --
 * and the mark comes off. The placing is in the call site's `findPosition`
 * (App.svelte findFreePosition, which needs the live view); this decides
 * which blocks, in what order, and against what.
 */

export const UNPLACED = 'canvasUnplaced';

/** Whether a block still waits to be placed on the Canvas. */
export const isUnplaced = block => block?.[UNPLACED] === true;

/**
 * The blocks with every waiting one placed. `findPosition(placed, width,
 * height)` answers a free spot among `placed`. Each one placed joins the
 * placed ones, so two waiting blocks do not land on each other. Returns the
 * same array when nothing waits.
 *
 * `shown` says which blocks the Canvas shows (canvasShown.js): only those
 * are placed, and only those take up room. One not shown waits on.
 */
export function placeWaitingBlocks(blocks, findPosition, { shown = () => true } = {}) {
  if (!blocks.some(block => isUnplaced(block) && shown(block))) return blocks;
  const placed = blocks.filter(block => !isUnplaced(block) && shown(block));
  const out = [];
  for (const block of blocks) {
    if (!isUnplaced(block) || !shown(block)) { out.push(block); continue; }
    const width = block.size?.width ?? 300;
    const height = block.size?.height ?? 200;
    const { [UNPLACED]: _, ...rest } = block;
    const next = { ...rest, position: findPosition(placed, width, height) };
    placed.push(next);
    out.push(next);
  }
  return out;
}
