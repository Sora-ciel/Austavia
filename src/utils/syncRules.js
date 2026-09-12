// The rules that decide what may be synced, and what counts as a change.
//
// These live here, on their own, for one reason: everything in this file has
// broken at least once in a way that only showed up after a release. They used
// to sit inside App.svelte and firebaseClient.js, where the first imports a
// component runtime and the second imports Capacitor, so neither can be loaded
// outside a browser — which meant these rules could only be exercised by
// running the app, signing in, and trying it by hand. That is why the bugs were
// found by the person using the app instead of by the person changing it.
//
// Nothing in here touches the network, the database, the DOM or storage. Every
// function is a plain value in, plain value out, so test/sync-rules.test.js can
// run the real thing in a fraction of a second. Keep it that way: if a rule
// needs a Firebase handle or a document, the part that decides belongs here and
// the part that acts belongs at the call site.

// ── Folder names ────────────────────────────────────────────────────────────

// Realtime Database keys cannot be empty and cannot contain . # $ [ ] or /.
const FORBIDDEN_KEY_CHARACTERS = /[.#$/[\]]/;

/**
 * Whether a folder name can be a database key at all.
 *
 * An empty name is not merely rejected, it is dangerous: the path is built as
 * `files/${fileId}`, so a blank id makes `files/`, the trailing slash is
 * stripped, and the write lands on the node holding *every* folder and replaces
 * the lot. Only a validation rule on each child stood between a blank name and
 * an emptied account.
 */
export function isSyncableFileId(fileId) {
  return typeof fileId === 'string'
    && fileId.length > 0
    && !FORBIDDEN_KEY_CHARACTERS.test(fileId);
}

// ── Pictures embedded in written text ───────────────────────────────────────

// A picture is not always the whole of a value. An image block's src is nothing
// but the data: URL, but one pasted into written text sits inside the value, as
// an <img src="data:…"> in a note's HTML or a ![](data:…) in a task. Only the
// first was ever recognised, so the second went into the database as base64 and
// the write failed.
//
// A base64 payload contains no quote, bracket or space, which is what bounds
// each match.
const EMBEDDED_DATA_URL_PATTERNS = [
  /(?:src|href)\s*=\s*"(data:[^"]+)"/gi, // HTML attribute, double quoted
  /(?:src|href)\s*=\s*'(data:[^']+)'/gi, // HTML attribute, single quoted
  /\]\((data:[^)\s]+)\)/g                // markdown image or link
];

/** Every distinct data: URL embedded in a string. */
export function findEmbeddedDataUrls(text) {
  if (typeof text !== 'string') return [];
  const found = new Set();
  for (const pattern of EMBEDDED_DATA_URL_PATTERNS) {
    for (const match of text.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

/** True if anything anywhere in the payload is still inline base64. */
export function payloadCarriesDataUrl(payload) {
  try {
    return JSON.stringify(payload ?? null).includes('data:');
  } catch {
    return false;
  }
}

// ── What counts as a change ─────────────────────────────────────────────────

/**
 * The same value with everything the database cannot hold taken out: no empty
 * list, no empty object, no null.
 *
 * Used to compare a folder against the copy on disk. Realtime Database stores
 * none of those, so a folder uploaded with `tasks: []` comes back without the
 * field at all; loading puts it back, the two copies then differ, and the save
 * that follows stamps a new modifiedAt. A second instance reads that stamp as a
 * genuine edit, downloads, normalises, saves and uploads — and the two hand the
 * folder back and forth for as long as both are open.
 *
 * Only empty-versus-absent is folded together. A list that held something and
 * is now empty still reads as a change, so emptying one is still saved.
 */
export function withoutEmptyValues(value) {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    const kept = value.map(withoutEmptyValues).filter(item => item !== undefined);
    return kept.length ? kept : undefined;
  }
  if (typeof value === 'object') {
    const kept = {};
    for (const [key, item] of Object.entries(value)) {
      const cleaned = withoutEmptyValues(item);
      if (cleaned !== undefined) kept[key] = cleaned;
    }
    return Object.keys(kept).length ? kept : undefined;
  }
  return value;
}

/**
 * A block with any theme paint undone, so it is compared by the colours the
 * person actually chose rather than the ones a theme derived.
 *
 * "Blocks follow theme" writes the current theme's colours into every block.
 * Those colours are derived from whichever theme *this device* is on, so two
 * devices on different themes each rewrite what the other wrote, and every
 * rewrite reads as a genuine edit: save, upload, the other downloads, repaints,
 * saves, uploads. Two instances handed a folder back and forth for as long as
 * both were open, with nobody editing anything.
 *
 * Painting stashes the original colours first, so the underlying block is still
 * there to compare. Undoing the paint before comparing makes the two devices
 * agree, and a colour the person actually picked still reads as a change
 * because that is what the stash holds.
 *
 * Everything the paint wrote has to go, not only the colours it replaced. A
 * later fix added `_themedBgColor` and `_themedTextColor`, recording which theme
 * had painted a block so that opening a folder could tell paint from a choice —
 * and those are derived from this device's theme exactly as the colours are. They
 * were not undone here, so the loop came straight back in the same shape: two
 * devices on different themes, each downloading the other's copy, repainting,
 * finding `_themedBgColor` different, and calling that an edit. Every ten
 * seconds, with nobody touching anything.
 *
 * So the test for this is written in terms of what it prevents rather than what
 * it deletes: a block painted by one theme and a block painted by another must
 * compare equal, whatever fields the painting happens to write today.
 */
const THEME_PAINT_KEYS = ['_baseBgColor', '_baseTextColor', '_themedBgColor', '_themedTextColor'];

export function unpaintThemeColours(block) {
  if (!block || typeof block !== 'object') return block;
  if (!THEME_PAINT_KEYS.some(key => block[key] !== undefined)) return block;

  const restored = { ...block };
  if (block._baseBgColor !== undefined) restored.bgColor = block._baseBgColor;
  if (block._baseTextColor !== undefined) restored.textColor = block._baseTextColor;
  for (const key of THEME_PAINT_KEYS) delete restored[key];
  return restored;
}
