/**
 * Where you had scrolled to, kept on this device.
 *
 * ## What was asked for
 *
 * "When it syncs it shouldn't reset the scrolls that you have, and when
 * restarting it should remember the scrolls you were on as a per-device thing.
 * Because having to scroll again all the way up after a sync or a restart is
 * annoying."
 *
 * ## Why it was being lost
 *
 * Scroll was already remembered — as a field on the block, `scrollTop`, saved
 * with everything else. It was excluded from the comparison that decides
 * whether a folder changed, for a good reason written down in App.svelte: a
 * round trip through the database turned 1384.177734375 into 1384, and two
 * devices then argued for ever over a number neither had typed.
 *
 * But excluding it from the *comparison* is only half of it. It still travelled
 * in the payload, so a folder arriving from the cloud carried the other
 * device's scroll positions — or none at all — and wrote them over this one's.
 * Every download put every note back to wherever the other machine had been
 * reading, which from the inside looks exactly like being thrown back to the
 * top.
 *
 * So it stops being part of the folder. Where you have read up to is a fact
 * about this device and this pair of eyes, and the rule the app already follows
 * is that such things are never synced — the same rule that keeps window sizes
 * and the last open note out of the folder. See `lastNote.js`, which is this
 * shape exactly.
 *
 * ## Keyed by what is being scrolled, not by where it is on screen
 *
 * A note keeps its place when the mode changes around it, so the key is the
 * thing itself — a block id, or a named surface like a mode's canvas — under
 * the folder it belongs to. Positions for a folder that has not been opened in
 * a long time are not worth a line in storage, so the store is bounded the same
 * way the remembered-notes one is.
 */

/** Where the map lives. Local storage, one key, never uploaded. */
export const STORAGE_KEY = 'scrollPositions';

/** How many folders are worth remembering positions for. */
export const REMEMBERED_FILES = 50;

/** How many surfaces within one folder. A folder of 400 notes is not a reason
 * to keep 400 numbers; the ones scrolled most recently are the ones wanted. */
export const REMEMBERED_SURFACES = 60;

/**
 * A position worth writing down, or null.
 *
 * Zero is not worth writing down, and writing it down is actively harmful: the
 * browser reports a scroll to 0 while a scroller is being torn down or made
 * unscrollable, and recording that is how the position gets lost at exactly the
 * moment it matters. Somewhere near the top is the same as the top.
 */
export function worthRemembering(position) {
  const value = Number(position);
  if (!Number.isFinite(value) || value <= 1) return null;
  // Rounded, because a fractional pixel is noise here and because fractions are
  // what made the synced version argue with itself.
  return Math.round(value);
}

/** The position remembered for one surface of one folder, or 0. */
export function recalledScroll(store, fileKey, surfaceKey) {
  if (!store || typeof store !== 'object' || !fileKey || !surfaceKey) return 0;
  const forFile = store[fileKey];
  if (!forFile || typeof forFile !== 'object') return 0;
  const value = Number(forFile[surfaceKey]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * The store with one surface's position written down.
 *
 * Returns the same object when nothing would change, so the caller can skip the
 * write — this is called on every scroll event, and scroll events are not rare.
 * Entries are deleted and re-added rather than overwritten, because insertion
 * order is what says which are the stale ones.
 */
export function withScroll(store, fileKey, surfaceKey, position) {
  const current = store && typeof store === 'object' ? store : {};
  if (!fileKey || !surfaceKey) return current;

  const kept = worthRemembering(position);

  const forFile = { ...(current[fileKey] || {}) };
  if (kept === null) {
    // Nothing to remember. Forget rather than keep a stale number that would
    // scroll somebody somewhere they no longer are.
    if (!(surfaceKey in forFile)) return current;
    delete forFile[surfaceKey];
  } else {
    if (forFile[surfaceKey] === kept && Object.keys(forFile).at(-1) === surfaceKey) return current;
    delete forFile[surfaceKey];
    forFile[surfaceKey] = kept;
  }

  const surfaces = Object.keys(forFile);
  for (const stale of surfaces.slice(0, Math.max(0, surfaces.length - REMEMBERED_SURFACES))) {
    delete forFile[stale];
  }

  const next = { ...current };
  delete next[fileKey];
  if (Object.keys(forFile).length) next[fileKey] = forFile;

  const files = Object.keys(next);
  for (const stale of files.slice(0, Math.max(0, files.length - REMEMBERED_FILES))) {
    delete next[stale];
  }

  return next;
}

/** Everything remembered for a folder that no longer exists is not worth keeping. */
export function withoutFile(store, fileKey) {
  const current = store && typeof store === 'object' ? store : {};
  if (!fileKey || !(fileKey in current)) return current;
  const next = { ...current };
  delete next[fileKey];
  return next;
}

/**
 * The name for a surface that is not a block.
 *
 * A mode's own scroller — the canvas, a column list — has no id of its own, so
 * it gets one that cannot collide with a block's.
 */
export function modeSurfaceKey(mode) {
  return `mode:${mode || 'default'}`;
}

// ── Touching storage ─────────────────────────────────────────────────
// Thin on purpose. Everything worth arguing about is above this line and can be
// exercised without a browser; these three only put it somewhere.

/** The whole store, or an empty one. Never throws: it is a scroll position. */
export function readScrollStore() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Where this surface was, for this folder. */
export function recallScroll(fileKey, surfaceKey) {
  return recalledScroll(readScrollStore(), fileKey, surfaceKey);
}

/**
 * Writes one position down.
 *
 * Read and written at the point of use rather than held in a variable, so two
 * windows of the app do not overwrite each other from stale copies — and, in a
 * component, so the statement that writes it cannot feed the one that reads it.
 * That cycle has already cost a compile once, in SingleNoteMode.
 */
export function rememberScroll(fileKey, surfaceKey, position) {
  try {
    if (typeof localStorage === 'undefined') return;
    const store = readScrollStore();
    const next = withScroll(store, fileKey, surfaceKey, position);
    if (next === store) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A browser with storage off simply starts at the top.
  }
}
