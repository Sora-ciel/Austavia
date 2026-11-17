/**
 * Pictures kept on the device that nothing uses any more, found and deleted.
 *
 * Asked 2026-11-17: "the pictures that aren't used anymore should be cleaned
 * up, no? why would we keep them?" Pictures in notes are kept once on the
 * device by reference (utils/pictureStore.js); deleting a note, a picture in
 * it, or a whole folder leaves the picture behind, and without this the store
 * only grows.
 *
 * In use means referenced by anything that can still be brought back: any
 * folder, any folder in the bin, any kept copy (snapshots), the undo history
 * of the notes open now. And a picture stored in the last day is left alone
 * whatever, so one being pasted or uploaded at that moment is never taken.
 *
 * Absolute, not incremental (CLAUDE.md): every pass works out what is in use
 * from everything on the device and deletes the rest, so it is right whenever
 * it runs and harmless to run twice. This file decides; App.svelte runs it.
 */

export const PICTURE_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * The hashes to delete. `stored`: [{ hash, at }] (at 0 when unknown -- kept
 * before the time was recorded, and so older than any grace). `inUse`: a Set
 * of hashes referenced anywhere.
 */
export function picturesToDelete({ stored = [], inUse = new Set(), now = Date.now(), graceMs = PICTURE_GRACE_MS } = {}) {
  return stored
    .filter(picture => picture && picture.hash && !inUse.has(picture.hash))
    .filter(picture => now - (Number(picture.at) || 0) > graceMs)
    .map(picture => picture.hash);
}
