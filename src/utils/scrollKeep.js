/**
 * Where the open folder is scrolled to, kept across a reload of the same
 * folder -- a sync bringing in another device's change.
 *
 * Asked 2026-11-17: "make it so that when page mode syncs it doesn't move the
 * scroll away". A sync that changes the open folder reloads it the way
 * opening it does: emptied, then drawn again, and while it is empty every
 * scroller falls back to the top. So before the reload each scrolled thing
 * in the mode area is noted by a key that survives being drawn again -- its
 * block, its class, and its place among the same -- and put back after.
 *
 * `keyOf` is plain so it can be tested; `noteScrolls`/`putScrollsBack` walk
 * the DOM and are browser-only.
 */

/** A scroller's key: its block (if inside one), its classes, and which of the same it is. */
export function keyOf({ blockId = '', classes = '', index = 0 } = {}) {
  const cls = String(classes).split(/\s+/).filter(name => name && !/^s-/.test(name)).sort().join('.');
  return `${blockId}|${cls}|${index}`;
}

function describe(el, root) {
  const block = el.closest('[data-block-id], [data-simple-block], [data-page-block]');
  const blockId = block?.getAttribute('data-block-id') || block?.getAttribute('data-simple-block') || block?.getAttribute('data-page-block') || '';
  const classes = el.className && typeof el.className === 'string' ? el.className : '';
  const same = classes ? [...root.getElementsByClassName(classes.split(/\s+/).filter(Boolean)[0] || '')] : [];
  return { blockId, classes, index: Math.max(0, same.indexOf(el)) };
}

export function noteScrolls(root) {
  const noted = new Map();
  if (!root) return noted;
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (el.scrollTop > 0 || el.scrollLeft > 0) noted.set(keyOf(describe(el, root)), { top: el.scrollTop, left: el.scrollLeft });
  }
  return noted;
}

export function putScrollsBack(root, noted) {
  if (!root || !noted?.size) return;
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const at = noted.get(keyOf(describe(el, root)));
    if (!at) continue;
    el.scrollTop = at.top;
    el.scrollLeft = at.left;
  }
}
