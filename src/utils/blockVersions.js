/**
 * Which blocks have to be rebuilt after a change.
 *
 * ## What was asked for
 *
 * "In canvas mode, changing themes or other forms of change like clicking a
 * task as done makes some blocks jump every time you do it ... maybe for
 * performance we might want our app to mount only one block at a time, so
 * that the task is the only one that remounts and not everything" --
 * 2026-10-05.
 *
 * ## Why anything is rebuilt at all
 *
 * The canvas keys each block by `${id}-${_version}`, and a new `_version` is
 * how the app tells a block to start again from what is stored. Some of a
 * block's state is copied in when it is built (a task's list, a picture's
 * source), so a change made from outside the block -- an undo putting an old
 * list back -- only reaches the screen through a rebuild.
 *
 * Every history step used to move every block's `_version` on, so ticking one
 * task rebuilt every block on the canvas, and a theme change did the same. A
 * rebuilt text block puts its scroll back before its pictures have loaded,
 * which is the jump. Colours are now followed live, so a theme change rebuilds
 * nothing; see LIVE_KEYS.
 *
 * ## What it is now
 *
 * A block is rebuilt only when what is stored differs from what its component
 * is showing. App keeps `shown`: the stored state of each block as its
 * component last saw it -- recorded when the component itself reported a
 * change (the task you ticked already shows the tick) and after every rebuild.
 * Anything else that changed a block changed it behind the component's back,
 * and that block is rebuilt.
 *
 * Errs towards rebuilding: a block it cannot vouch for -- never recorded, or
 * recorded with its keys in another order -- is rebuilt, which is what always
 * happened before.
 */

/**
 * What a block's component follows live, and so never needs a rebuild to show:
 * its colours, and the theme's bookkeeping about them. Every block takes its
 * colours as props it keeps following (BlockShell, ImgBlock, TaskBlock,
 * EmbedBlock -- checked in test/block-versions.test.js), so a theme repainting
 * every block rebuilds none of them.
 */
export const LIVE_KEYS = ['bgColor', 'textColor', '_baseBgColor', '_baseTextColor', '_themedBgColor', '_themedTextColor'];

/**
 * A block's stored state as far as a rebuild is concerned -- apart from its
 * version and what it follows live -- comparable as a string.
 */
export function blockState(block) {
  if (!block || typeof block !== 'object') return '';
  const rest = { ...block };
  delete rest._version;
  for (const key of LIVE_KEYS) delete rest[key];
  return JSON.stringify(rest);
}

/**
 * The blocks, with `_version` moved on for those whose component is out of
 * date. `shown` maps an id to `blockState` of what its component shows.
 * Blocks already in step are returned as they are.
 */
export function remountOnlyChanged(blocks = [], shown = new Map()) {
  return (blocks || []).map((block) => {
    if (!block?.id) return block;
    if (shown.get(block.id) === blockState(block)) return block;
    return { ...block, _version: (block._version || 0) + 1 };
  });
}

/**
 * Blocks restored from history by undo or redo. Each takes a version past
 * both its own and the one on screen when it has to be rebuilt, so its key is
 * one the canvas has not seen; one that comes back exactly as it is shown
 * keeps the version it is shown with, and is left alone.
 *
 * `live` maps an id to the `_version` the block has on screen now.
 */
export function restoredVersions(snapshotBlocks = [], live = new Map(), shown = new Map()) {
  return (snapshotBlocks || []).map((block) => {
    if (!block?.id) return block;
    const current = live.get(block.id);
    if (current !== undefined && shown.get(block.id) === blockState(block)) {
      return { ...block, _version: current };
    }
    return { ...block, _version: Math.max((block._version || 0) + 1, (current || 0) + 1) };
  });
}
