/**
 * What colour a full-screen mode's surface is.
 *
 * ## What was asked for
 *
 * "Like in Single Note mode, the Playlist mode should have a particular
 * background, so that the opacity changes don't go to black but to the
 * background colour it would have on that mode in Single Note mode. If there's
 * no music block in the folder, the background of the Playlist mode will be the
 * one the mode would put on the background of Single Note mode. But if there's
 * a block it would put the background of the block. While also accounting for
 * whether the 'all blocks have the same colour as the theme' boxes are checked
 * or not: if they are then it's the colour of the background the theme would
 * put, if not then the colour of the music block, and if there's no music block
 * then it's the background the theme would put."
 *
 * ## The rule, which is one rule and not three
 *
 * A full-screen mode is a block with the walls taken away. Single Note mode is
 * a text block filling the window, and it has always painted itself the note's
 * own colour — which is why reducing the wallpaper's opacity there fades to the
 * note's colour rather than to black. Playlist mode is the music block filling
 * the window and was painting itself the mode's background instead, so it faded
 * to whatever the theme had behind everything, and on most themes that is very
 * close to black.
 *
 * So: the block's colour, and the theme's mode background when there is no
 * block. That is the whole of it.
 *
 * The checkbox needs no branch of its own, and this is worth saying because it
 * looks like it should. "All blocks follow the theme" works by *painting the
 * blocks* — it writes the theme's colour into each block's own `bgColor`, which
 * is what makes it survive a reload and a sync (see themePainting.js). So a
 * block under that switch already reports the theme's colour when asked, and
 * asking the block covers both cases by itself. A second branch reading the
 * switch would be a second answer to the same question, and the two would
 * eventually disagree.
 *
 * ## Why it is shared
 *
 * The request is "like in Single Note mode". Two copies of a rule that is
 * supposed to match are two things to keep matching, so both modes call this.
 */

import { getReadableTextColor } from './readableColor.js';

/**
 * The block a mode is standing in for, or null.
 *
 * The first of its kind in the folder. A folder with two music blocks has no
 * way to say which one Playlist mode is, and the first one is at least stable —
 * it does not change as blocks are added, and it does not change on a reload.
 */
export function surfaceBlock(blocks = [], type = '') {
  if (!type) return null;
  const types = Array.isArray(type) ? type : [type];
  return (blocks || []).find((block) => block && types.includes(block.type)) || null;
}

/**
 * The surface's colours: the block's own, or the theme's for the mode.
 *
 * `text` is worked out from the background when the block does not carry one,
 * so a pale surface never ends up with pale writing on it.
 */
export function surfaceColors(block, canvasColors = {}) {
  const bg = block?.bgColor || canvasColors?.innerBg || '#000000';
  const text = block?.textColor || canvasColors?.textColor || getReadableTextColor(bg);
  return { bg, text };
}
