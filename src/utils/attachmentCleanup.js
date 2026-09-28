// Which of an account's stored attachments no longer belong to anything.
//
// Deleting an image block never removed its upload. Attachments were only
// cleaned up when a whole folder was deleted, so a picture taken out of a note
// stayed in the bucket for good — invisible, and charged for ever. That was
// tolerable while storage was free. It is not tolerable when storage is the
// thing being sold: people would pay for pictures they deleted, and since
// deleting is the only way out of a full account, the way out did not work.
//
// Pure, like syncRules.js: what counts as an orphan is decided here, and the
// walking and removing happens at the call site.

// Single Note's background images are uploaded under a block id that no block
// has, because they live in modeSettings rather than on a block. Nothing in
// `blocks` will ever mention it, so without this it looks like an orphan on
// every single save and the user's background quietly disappears.
export const MODE_SETTINGS_BLOCK_ID = 'mode-settings';

/**
 * Whether a value is safe to put in a storage path as one segment.
 *
 * Empty is the dangerous one, again. `attachments/${fileId}/${blockId}` with a
 * blank blockId addresses every attachment in the folder, and with a blank
 * fileId every attachment the account owns — and the caller here is a delete.
 * The relative segments are refused for the same reason: `..` would climb out
 * of the prefix the path was supposed to confine it to.
 */
export function isSafeStorageSegment(segment) {
  return typeof segment === 'string'
    && segment.length > 0
    && !segment.includes('/')
    && segment !== '.'
    && segment !== '..';
}

/**
 * The block folders in storage that no live block accounts for.
 *
 * Deliberately compared against what storage actually holds rather than
 * against a list of deletions remembered as they happened. Remembering is
 * wrong in both directions: an undo puts a block back and the memory still
 * says to delete it, and a redo takes it away again without the memory
 * noticing. Storage is the thing being corrected, so storage is what gets
 * asked.
 */
export function orphanedAttachmentIds(storedBlockIds = [], keepBlockIds = []) {
  const keep = new Set([MODE_SETTINGS_BLOCK_ID]);
  for (const id of keepBlockIds) {
    if (id) keep.add(String(id));
  }

  return storedBlockIds.filter(
    id => isSafeStorageSegment(id) && !keep.has(id)
  );
}

/** The wallpaper fields that are uploaded under MODE_SETTINGS_BLOCK_ID. */
export const WALLPAPER_IMAGE_FIELDS = ['backgroundImage', 'backgroundImageMobile'];

/**
 * Which uploaded wallpapers a folder no longer uses.
 *
 * ## Why this exists
 *
 * Wallpapers are uploaded under MODE_SETTINGS_BLOCK_ID, which the block sweep
 * keeps whole -- so every wallpaper ever chosen stayed in storage for good,
 * because uploads are named after their bytes and a new picture is a new
 * object beside the old one. Single Note's own wallpaper made it plain: asked
 * on 2026-09-27 for "the background that was used only on Single Note mode to
 * be actually deleted", once every mode had moved to Canvas's, and the setting
 * going from the folder would still have left its picture in the bucket.
 *
 * ## How "in use" is told
 *
 * The folder's current value for each field is one of two things. On the
 * device that chose it, the picture itself as a data URL -- and an upload is
 * named `hashOf(dataUrl).ext`, so the name is known without asking anyone. On
 * any other device, the download URL, which carries the object's path. An
 * object that matches neither is not in use.
 *
 * `stored` is what storage holds: `{ field, name, fullPath }` per object.
 * `current` is the folder's wallpaper settings. `hashOf` is the same function
 * that named the uploads, handed in so this cannot drift from it.
 *
 * A field this does not know is left alone: declining to answer beats
 * deleting something on a guess.
 */
export function staleWallpaperObjects(stored = [], current = {}, hashOf = () => '') {
  const settings = current || {};

  return stored.filter(object => {
    if (!object || !WALLPAPER_IMAGE_FIELDS.includes(object.field)) return false;

    const value = settings[object.field];
    if (typeof value !== 'string' || !value) return true;

    if (value.startsWith('data:')) {
      return !String(object.name || '').startsWith(`${hashOf(value)}.`);
    }

    // A download URL names the object with its path percent-encoded.
    const path = String(object.fullPath || '');
    return !(path && (value.includes(encodeURIComponent(path)) || value.includes(path)));
  });
}
