/**
 * Which history Ctrl+Z belongs to: the note being typed in, or the workspace.
 *
 * ## What was asked for
 *
 * "Ctrl+Z seems to really not work even though undo and redo work: colours
 * don't get undone with the shortcut, but they do with the button" (2026-10-12,
 * on the Linux app).
 *
 * ## What was measured
 *
 * A build that recorded, on each Ctrl+Z, what had the keyboard focus: the
 * first presses had the page itself and undid the colour (and then, correctly,
 * the block's creation). After the block was put back, every press had the
 * focus *inside that block's note* — even after a colour was picked and the
 * empty canvas clicked — so the key went to the note's own text history, which
 * had nothing to undo, and the colour stayed.
 *
 * The app had already decided no note was being written in: an unfocused
 * block's writing is made untouchable (`pointer-events: none`, see
 * BlockShell.svelte). It never told the browser. Chromium drops the focus by
 * itself when empty space is clicked; WebKitGTK, which the Linux app runs on,
 * can keep it — so the decision and the keyboard disagreed.
 *
 * ## The rule
 *
 * Text that has the focus belongs to the note being written in only when its
 * block is the focused block. Focus left behind in a block that is not focused
 * cannot be somebody typing — that writing cannot even be clicked — so it is
 * released and Ctrl+Z goes to the workspace, exactly as the Undo button does.
 * Typing in the focused note keeps its own undo, so one keystroke still never
 * steps back two histories at once (see handleUndoRedoShortcut in App.svelte)
 * -- unless that note has nothing of its own to undo, in which case the
 * keystroke is the workspace's rather than swallowed.
 */

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number']);

/** Somewhere the caret is in writing, where undo belongs to that writing. */
export function isTextEntry(node) {
  if (!node || node.nodeType !== 1) return false;
  if (node.isContentEditable) return true;
  if (node.tagName === 'TEXTAREA') return true;
  if (node.tagName === 'INPUT') return TEXT_INPUT_TYPES.has(String(node.type || '').toLowerCase());
  return false;
}

/**
 * - `workspace`: nothing is being written in; undo the workspace, as the Undo
 *   button does.
 * - `release`: focus was left behind in a block that is not focused; let it go,
 *   then undo the workspace.
 * - `pass`: the caret is in the note being written in, but that note has no
 *   step of its own to take (a block just added and recoloured, never typed
 *   in). The workspace is undone and the caret stays where it is. Without this
 *   the note took the keystroke, had nothing to undo, and the colour stayed.
 * - `text`: the caret is in writing that has a step to take; that writing's
 *   own undo, and only that.
 *
 * `textCanStep` is whether the note's own history can go the way asked (undo
 * or redo). It is unknown (null) for writing that keeps no such history -- a
 * folder name, a search box -- which always keeps its own.
 */
export function undoTarget({ activeIsText = false, activeBlockId = null, focusedBlockId = null, textCanStep = null } = {}) {
  if (!activeIsText) return 'workspace';
  if (activeBlockId != null && activeBlockId !== focusedBlockId) return 'release';
  if (textCanStep === false) return 'pass';
  return 'text';
}
