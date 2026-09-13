/**
 * Which note Single Note mode opens on.
 *
 * ## What was asked for
 *
 * "Make it so that the browser remembers what was the last note open in Single
 * Note mode. No need to sync, make it local."
 *
 * It opened the first note in the folder every time, so a folder with a dozen
 * notes meant finding yours again on every visit.
 *
 * ## Local, and per file
 *
 * Deliberately not synced. Which note you were reading is a fact about this
 * device and this session — the same rule that keeps scroll positions and
 * window sizes out of the folder — and a phone and a laptop open on different
 * notes is right rather than a conflict to resolve. It is also the rule that
 * has bitten this app twice: a device-derived value written into synced content
 * makes two devices disagree for ever, each overwriting the other. See
 * syncRules.js.
 *
 * Remembered per file, because "the last note" means nothing across a dozen of
 * them. The store is a plain map of file to note id, kept small: a name that
 * has not been opened in a long time is not worth a line in local storage.
 *
 * ## A remembered note may be gone
 *
 * Deleted, or on another device, or the file renamed underneath it. So the
 * memory is a suggestion that has to be checked against the notes actually
 * there, and the first note is what happens when it does not survive that — the
 * behaviour this replaces, which is the right thing to fall back to.
 */

/** Where the map lives. Local storage, one key. */
export const STORAGE_KEY = 'singleNoteLastOpen';

/** How many files are worth remembering. */
export const REMEMBERED_FILES = 50;

/**
 * The note to open, given what is there and what was remembered.
 *
 * `notes` are the note blocks in the order the mode lists them.
 */
export function chooseOpenNote({ notes = [], remembered = null } = {}) {
  const list = Array.isArray(notes) ? notes : [];
  if (!list.length) return null;

  const kept = remembered && list.some((note) => note?.id === remembered);
  return kept ? remembered : list[0]?.id ?? null;
}

/** What was remembered for this file, if anything. */
export function rememberedNote(store, fileKey) {
  if (!store || typeof store !== 'object' || !fileKey) return null;
  const id = store[fileKey];
  return typeof id === 'string' && id ? id : null;
}

/**
 * The store with this file's note written down.
 *
 * Returns the same object when nothing would change, so the caller can skip the
 * write. The entry is deleted and re-added rather than overwritten, because
 * insertion order is what says which files are the stale ones.
 */
export function withRememberedNote(store, fileKey, noteId, limit = REMEMBERED_FILES) {
  if (!fileKey || !noteId) return store || {};
  const current = store && typeof store === 'object' ? store : {};
  if (current[fileKey] === noteId && Object.keys(current).at(-1) === fileKey) return current;

  const next = { ...current };
  delete next[fileKey];
  next[fileKey] = noteId;

  const keys = Object.keys(next);
  for (const stale of keys.slice(0, Math.max(0, keys.length - limit))) delete next[stale];

  return next;
}
