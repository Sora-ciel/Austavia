/**
 * "Recolor this folder's blocks to match the theme", decided in one place.
 *
 * The switch has two moments and only one of them is a repaint of everything:
 *
 *   - the theme's colours move, or the switch is turned on — repaint every
 *     block, because that is what the switch is for;
 *   - the blocks change — folder opened, block added — paint the ones that are
 *     not already wearing this theme, and leave a hand-picked colour alone.
 *
 * Telling those two apart is the whole problem, and it has been got wrong in
 * both directions:
 *
 * First it was a single reactive line naming `blocks`, so it re-ran on the
 * user's own colour change and put the theme's colour straight back. The colour
 * picker did nothing for as long as the switch was on.
 *
 * Then the fix keyed the repaint on the theme alone — which meant opening a
 * folder repainted nothing, because the theme had not moved. Those blocks were
 * painted under whatever theme was current when they were last saved, so they
 * came back wearing *another theme's* colours: not the theme chosen, and not a
 * colour anybody picked.
 *
 * What was missing both times is a record of which colours the theme gave a
 * block. `_baseBgColor` stores what the block looked like *before* painting, so
 * the switch can be turned off again; it says nothing about what was painted
 * on. `_themedBgColor` is that missing half. With it the question needs no
 * timing at all, and answers itself from the block:
 *
 *   wearing paint that is not this theme's  → the theme's to repaint
 *   wearing something else                  → the user's, leave it
 *   never painted                           → paint it
 *
 * Which is why this survives a folder change, a reload and a sync: it is a
 * property of the block, not a memory of what has happened this session.
 */

/** The theme colours, reduced to something comparable. */
export function themeKey(colors = {}) {
  return `${colors.bgColor ?? ''}|${colors.textColor ?? ''}`;
}

/**
 * Whether a full repaint is owed, given the last theme actually painted.
 *
 * `lastKey` is null when the switch is off or has just been turned on, which is
 * why turning it on repaints: there is no record of having painted anything.
 */
export function needsFullRepaint(lastKey, colors) {
  return themeKey(colors) !== lastKey;
}

function painted(block, colors) {
  return {
    ...block,
    // what it looked like before the theme had it, so the switch can be undone
    _baseBgColor: block._baseBgColor !== undefined ? block._baseBgColor : block.bgColor,
    _baseTextColor: block._baseTextColor !== undefined ? block._baseTextColor : block.textColor,
    // and what the theme put on, so a later pass can tell paint from a choice
    _themedBgColor: colors.bgColor,
    _themedTextColor: colors.textColor,
    bgColor: colors.bgColor,
    textColor: colors.textColor
    // No new _version: blocks follow their colours live, so a repaint is not
    // a rebuild (2026-10-05) -- see utils/blockVersions.js.
  };
}

/** Still showing exactly what the theme last put on it. */
function wearsItsPaint(block) {
  return (
    block._themedBgColor !== undefined &&
    block.bgColor === block._themedBgColor &&
    block.textColor === block._themedTextColor
  );
}

/**
 * Whether this block should be painted when the blocks change.
 *
 * A block with no record of being painted is painted — including one painted by
 * a build from before that record existed, which cannot be told apart from a
 * fresh one. That repaints such a block once, and from then on it is exact.
 */
export function needsPaint(block, colors) {
  if (block._themedBgColor === undefined) return true;
  if (!wearsItsPaint(block)) return false; // changed since; the user's now
  return block._themedBgColor !== colors.bgColor || block._themedTextColor !== colors.textColor;
}

/**
 * Every block onto the theme's colours.
 *
 * Returns the array it was given when nothing needed changing, so the caller
 * can skip the reassignment and the history entry that goes with it.
 */
export function paintAll(blocks, colors) {
  let touched = false;
  const next = (blocks || []).map((block) => {
    if (wearsItsPaint(block) && block._themedBgColor === colors.bgColor && block._themedTextColor === colors.textColor) {
      return block;
    }
    touched = true;
    return painted(block, colors);
  });
  return touched ? next : blocks;
}

/**
 * Only the blocks that are not already wearing this theme.
 *
 * This is the pass that runs when the blocks change, so it must not touch a
 * colour the user chose — and it must catch a folder whose blocks were painted
 * under a different theme, which is the case the previous version missed.
 */
export function paintStale(blocks, colors) {
  let touched = false;
  const next = (blocks || []).map((block) => {
    if (!needsPaint(block, colors)) return block;
    touched = true;
    return painted(block, colors);
  });
  return touched ? next : blocks;
}

/**
 * Every block off the theme's colours: the switch is off.
 *
 * ## What was asked for
 *
 * "When removing all folders wide themes, the blocks don't go back to their
 * chosen colors" (2026-10-12, seen on the Linux app and in a browser).
 *
 * Turning a switch off only ever restored the folder that was open. Any other
 * folder saved while it was on kept its paint, and nothing looked again when
 * it was opened later: measured, a folder saved painted black over its own red
 * opened black with both switches off. So this is the mirror of `paintStale`:
 * it runs whenever the blocks change with the switch off, and answers from the
 * block itself, so a folder opened a month later is put right the same way.
 *
 *   still wearing the theme's paint  → back to its own colour
 *   recoloured since it was painted  → that colour is the user's; it stays
 *   painted by an older build        → back to its own colour, as before
 *   never painted                    → untouched
 *
 * Either way the record of painting goes, so the block is plain again.
 */
export function unpaintAll(blocks) {
  let touched = false;
  const next = (blocks || []).map((block) => {
    if (block._baseBgColor === undefined && block._themedBgColor === undefined
      && block._baseTextColor === undefined && block._themedTextColor === undefined) {
      return block;
    }
    touched = true;
    const plain = { ...block };
    // A block painted by a build from before `_themedBgColor` existed cannot
    // tell paint from a choice; it is put back, as turning the switch off
    // always did.
    if (wearsItsPaint(block) || block._themedBgColor === undefined) {
      if (block._baseBgColor !== undefined) plain.bgColor = block._baseBgColor;
      if (block._baseTextColor !== undefined) plain.textColor = block._baseTextColor;
    }
    delete plain._baseBgColor;
    delete plain._baseTextColor;
    delete plain._themedBgColor;
    delete plain._themedTextColor;
    return plain;
  });
  return touched ? next : blocks;
}
