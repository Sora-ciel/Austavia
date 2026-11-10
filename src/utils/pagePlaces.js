/**
 * Where Page mode has been, for its back and forward arrows.
 *
 * Asked 2026-11-10: "Page mode will also have a go back or go forward arrows
 * following the modes theme on the upper left part of the mode so that if
 * you click and enter a nest you can easily go back or the other way
 * around."
 *
 * A place is a folder's own page (`{ folder, pageId: null }`) or a page block
 * in a folder (`{ folder, pageId }`). Kept for the session on this device,
 * like a browser's history: it is how this device moved around, not content.
 * Going somewhere new after going back drops what was forward, as a browser
 * does.
 */

export const NO_PLACES = Object.freeze({ back: [], forward: [] });

export const samePlace = (a, b) => Boolean(a && b) && a.folder === b.folder && (a.pageId || null) === (b.pageId || null);

/** After going to `to` from `from`. */
export function visit(history, from, to) {
  if (!from || samePlace(from, to)) return history;
  return { back: [...history.back, from], forward: [] };
}

/** Going back from `here`: where to, and the history after; null when there is nowhere. */
export function goBack(history, here) {
  if (!history.back.length) return null;
  const to = history.back[history.back.length - 1];
  return { to, history: { back: history.back.slice(0, -1), forward: here ? [here, ...history.forward] : history.forward } };
}

/** Going forward from `here`, the same way. */
export function goForward(history, here) {
  if (!history.forward.length) return null;
  const [to, ...rest] = history.forward;
  return { to, history: { back: here ? [...history.back, here] : history.back, forward: rest } };
}

/** The history without places that no longer exist -- a folder deleted, a page block removed. */
export function placesStillThere(history, exists) {
  return { back: history.back.filter(exists), forward: history.forward.filter(exists) };
}
