/**
 * Which blocks the Canvas shows.
 *
 * Asked 2026-11-22: "the block in page should by default stay as just a page
 * block that shows all the blocks inside in canvas mode ... a way to easily
 * make it so that in canvas it shows certains by the one you choose ... and
 * if you want to show something that by default doesn't show on canvas then
 * you can easily add a block that just doesn't show yet on canvas". Decided
 * the same day, with a live preview of the page (PENDING, "Pages on the
 * Canvas"):
 *
 * - A block inside a page block's page is not loose on the Canvas by
 *   default: it is shown inside that page block, which previews its page.
 *   Everything else is on the Canvas, as before.
 * - Any block can be chosen to show or not (`onCanvas`, true or false, a
 *   field on the block so it syncs). No field is the default. Hiding takes
 *   a block off the Canvas only; it is still in the folder and its pages.
 * - A block shown again is placed clear of the rest when the Canvas opens
 *   (canvasPlacement.js), since where it last stood may be taken by now.
 *
 * A version without this shows every block, as it always did.
 */

import { UNPLACED } from './canvasPlacement.js';
import { TITLE_ID } from './pageLayout.js';

export const CANVAS_CHOICE = 'onCanvas';

function idsInRows(rows, into) {
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const cell of Array.isArray(row?.cells) ? row.cells : []) {
      for (const entry of [cell, ...(Array.isArray(cell?.under) ? cell.under : [])]) {
        if (entry?.blockId && entry.blockId !== TITLE_ID) into.add(entry.blockId);
      }
    }
  }
}

/** The ids of the blocks inside any page block's page, either layout. */
export function idsInPages(blocks = []) {
  const ids = new Set();
  for (const block of blocks) {
    if (block?.type !== 'page') continue;
    idsInRows(block.rows, ids);
    idsInRows(block.narrowRows, ids);
  }
  return ids;
}

/** Whether a block is on the Canvas: as chosen, or by default unless it is inside a page. */
export function isOnCanvas(block, inPages) {
  if (block?.[CANVAS_CHOICE] === true) return true;
  if (block?.[CANVAS_CHOICE] === false) return false;
  return !inPages.has(block?.id);
}

/** The blocks the Canvas shows, in the folder's order. */
export function blocksOnCanvas(blocks = []) {
  const inPages = idsInPages(blocks);
  return blocks.filter(block => isOnCanvas(block, inPages));
}

/** The blocks the Canvas does not show: what "From this folder" offers. */
export function blocksOffCanvas(blocks = []) {
  const inPages = idsInPages(blocks);
  return blocks.filter(block => !isOnCanvas(block, inPages));
}

/**
 * The fields to change on a block to show it on the Canvas or not. Shown
 * again, it waits to be placed clear of the rest.
 */
export function canvasChoice(show) {
  return show ? { [CANVAS_CHOICE]: true, [UNPLACED]: true } : { [CANVAS_CHOICE]: false };
}
