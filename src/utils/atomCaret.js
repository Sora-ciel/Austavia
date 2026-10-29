/**
 * Pictures, and every other piece of a note that is not text, behave like one
 * character.
 *
 * ## What was asked for
 *
 * 2026-10-26: "all the non-text, markdown-like things we added should behave
 * like one character, kinda. Basically you should be able to put yourself on
 * its right and left -- even for an image, to make it easier to move etc."
 * Taken up 2026-10-29.
 *
 * ## What was wrong (measured in the editor)
 *
 * - **Two arrow presses to get past one.** The first selected the picture as
 *   a whole (a node selection), the second moved past it. A character takes
 *   one.
 * - **No cursor beside one at the edge of a line.** A picture is drawn in a
 *   non-editable wrapper, and browsers do not draw the cursor next to one at
 *   the start or end of a line: the cursor was there, and invisible.
 * - **A click on one selected it** rather than putting the cursor beside it.
 *
 * ## The rules (here, so they can be tested)
 *
 * - An *inline atom* is any one-piece inline node: a picture, the inline
 *   separator, a part kept from a newer version (TipTapEditor's KeptInline).
 * - An arrow steps over one in a single press (`stepOver`).
 * - A click on one puts the cursor on the side clicked, left half or right
 *   half (`sideOfClick`).
 * - Beside one, a cursor is drawn by the editor itself (`needsDrawnCaret`),
 *   since the browser will not -- and only then, so there are never two.
 *
 * Backspace and Delete already remove one in a single press, as for a
 * character; that is ProseMirror's own behaviour for inline atoms.
 */

/** Whether a node is one piece inside a line: a picture, a separator. */
export function isInlineAtom(node) {
  return Boolean(node && node.isInline && node.isAtom && !node.isText);
}

/**
 * Where an arrow press lands, or null to leave it to the editor: `pos` is the
 * cursor, `nodeBefore` / `nodeAfter` what sits either side of it, `dir` 1 for
 * right and -1 for left. With a whole atom selected (`selected`, at `from` to
 * `to`), an arrow goes to that side of it.
 */
export function stepOver({ dir, empty = true, pos, nodeBefore, nodeAfter, selected = null, from, to } = {}) {
  if (selected && isInlineAtom(selected)) return dir > 0 ? to : from;
  if (!empty) return null;
  if (dir > 0 && isInlineAtom(nodeAfter)) return pos + nodeAfter.nodeSize;
  if (dir < 0 && isInlineAtom(nodeBefore)) return pos - nodeBefore.nodeSize;
  return null;
}

/** Which side of a piece a click at `x` is on: 'before' or 'after'. */
export function sideOfClick({ left, right, x }) {
  return x < (left + right) / 2 ? 'before' : 'after';
}

/** Whether the cursor sits beside an atom, where the browser draws none. */
export function needsDrawnCaret({ empty, nodeBefore, nodeAfter }) {
  return Boolean(empty && (isInlineAtom(nodeBefore) || isInlineAtom(nodeAfter)));
}
