/**
 * Deciding whether a picture can be added, before it is.
 *
 * ## What was asked for
 *
 * "It took easily 30 seconds for the app to see the change. Maybe we should
 * have the storage calculus and the block client side too — so it blocks when
 * it goes further than the plan when you are connected and auto sync, and says
 * it wouldn't sync when auto sync is off, and says nothing when not connected.
 * And also block a too-big image client side." — 2026-09-27.
 *
 * ## Why thirty seconds is the floor for the server
 *
 * The ceiling is enforced by counting what actually landed: the file uploads,
 * `trackStorageUpload` fires, the balance is rewritten, and the app hears
 * about it through a subscription. Every one of those is necessary and none of
 * them is instant, so by the time anything can be said the picture is already
 * in the bucket. That is a fine way to enforce a limit and a terrible way to
 * tell somebody about one.
 *
 * So the arithmetic happens here as well, on the way in, where it can be
 * immediate. **This is not the enforcement** — the server keeps that, because
 * a client can be lied to and this one is running on somebody else's machine.
 * It is the part that makes the refusal arrive at the moment it means
 * something.
 *
 * ## Four situations, and only one of them is a refusal
 *
 * - **Signed out**: nothing is uploaded, nothing is counted, so nothing is
 *   said. A limit on cloud storage has no business stopping somebody keeping
 *   a picture on their own computer.
 * - **Signed in, auto sync on**: the picture is going to the cloud, and there
 *   is no room. Refused, now, with the numbers.
 * - **Signed in, auto sync off**: nothing is going anywhere yet, so refusing
 *   would be inventing a rule. Allowed, and told plainly that it will not be
 *   uploaded as things stand.
 * - **No record yet**: the account's balance has not arrived. Allowed. Guessing
 *   downward here would refuse a picture on an account with room, which is
 *   worse than the server refusing one later.
 */

import { formatBytes } from './storageUsage.js';

/** A limit the database stores as null means no ceiling at all. */
function ceilingOf(usage) {
  const raw = usage && usage.limit;
  if (raw === null || raw === undefined) return Number.POSITIVE_INFINITY;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

/**
 * What is left, never below zero.
 *
 * Measured against everything the account holds — `total` covers the folders
 * as well as the attachments. An older record has only `bytes`, and reads as
 * what it says rather than as nothing.
 */
export function roomLeft(usage) {
  const limit = ceilingOf(usage);
  if (!Number.isFinite(limit)) return Number.POSITIVE_INFINITY;

  const total = Number(usage && usage.total);
  const used = Number.isFinite(total) && total >= 0
    ? total
    : Math.max(0, Number((usage && usage.bytes) || 0));

  return Math.max(0, limit - used);
}

/**
 * Whether this picture can be added, and what to say about it.
 *
 * `allow` false is a refusal to show as a dialog — it stops something the
 * person just asked for and owes them a reason. A message with `allow` true is
 * a banner: worth knowing, not worth interrupting for.
 */
export function attachmentVerdict({
  bytes = 0,
  usage = null,
  signedIn = false,
  autoSync = false
} = {}) {
  const size = Math.max(0, Number(bytes) || 0);

  // Nothing leaves the device, so the cloud's limits are not this picture's
  // business.
  if (!signedIn) return { allow: true, message: '' };

  // No balance yet — the subscription has not delivered one, or nothing has
  // ever been uploaded. Failing open on purpose: the server still enforces.
  if (!usage) return { allow: true, message: '' };

  const room = roomLeft(usage);
  if (!Number.isFinite(room)) return { allow: true, message: '' };
  if (size <= room) return { allow: true, message: '' };

  const sizes = `${formatBytes(size)}, and ${room > 0 ? `only ${formatBytes(room)} is` : 'no space is'} left`;

  if (autoSync) {
    return {
      allow: false,
      message:
        `This is ${sizes} in your cloud storage. Delete something from the cloud `
        + 'to make room, or turn auto sync off to keep it on this device only.'
    };
  }

  // Auto sync is off, so nothing is going anywhere and there is nothing to
  // refuse. Saying so is the honest half: it will not be uploaded when it is
  // turned back on either.
  return {
    allow: true,
    message:
      `This is ${sizes} in your cloud storage. It stays on this device — with `
      + 'auto sync off nothing is uploaded, and it will not fit when it is on.'
  };
}

/**
 * Whether room has to be made before a save is even attempted.
 *
 * A save uploads its attachments first and writes the folder second, so an
 * account at its ceiling fails the whole save on the first refused upload --
 * and the sweep that removes deleted blocks' uploads runs *after* a successful
 * save. Both halves are reasonable alone and together they are a trap:
 * deleting a picture to make room cannot make room, because the save that
 * would record the deletion is the save that fails.
 *
 * So when an account is full and something has been deleted, the sweep goes
 * first. Freeing space before trying to use it is the only order that can get
 * out of a full account.
 *
 * Deliberately *only* when full. The ordinary path is left exactly as it was:
 * sweeping before a save that then fails would leave the cloud copy pointing
 * at uploads that are gone, and that is a worse trade than a late sweep
 * everywhere it is not necessary.
 */
export function freeSpaceBeforeSaving({ deletedBlocks = false, usage = null } = {}) {
  return Boolean(deletedBlocks) && Boolean(usage && usage.full);
}

/**
 * The largest single value the cloud database will take: 10,485,760 bytes of
 * UTF-8. Not a storage limit and not a plan limit -- a hard limit on one
 * string, whatever room the account has.
 */
export const MAX_INLINE_BYTES = 10485760;

/**
 * Whether a picture that is kept *inside* the folder -- a background, or a
 * picture pasted into the writing -- can be added, and what to say about it.
 *
 * ## Why this is not attachmentVerdict
 *
 * An image block's picture is uploaded to the bucket as a file. A background
 * is not: it is kept in the folder as a data URL, and the folder is written to
 * the database whole. The database refuses any one string over
 * MAX_INLINE_BYTES, so a 13 MB background did not just fail to upload -- the
 * whole folder stopped syncing, and the app retried it every ten seconds with
 * the database's own words in the banner (2026-09-27).
 *
 * So the size is checked where the picture is chosen, the way a full account
 * is, and in the same four situations: refused when it would be synced now,
 * allowed with a warning when auto sync is off, and nothing said when nobody
 * is signed in. After that the account's room is asked exactly as for any
 * other picture.
 *
 * `bytes` is the length of the data URL, which is what is stored: about a
 * third larger than the file it came from.
 */
export function inlinePictureVerdict({
  bytes = 0,
  usage = null,
  signedIn = false,
  autoSync = false,
  what = 'This picture'
} = {}) {
  const size = Math.max(0, Number(bytes) || 0);
  if (!signedIn) return { allow: true, message: '' };

  if (size > MAX_INLINE_BYTES) {
    const sizes = `${what} is ${formatBytes(size)} once stored, and the cloud takes at most `
      + `${formatBytes(MAX_INLINE_BYTES)} for one picture kept inside a folder.`;

    if (autoSync) {
      return {
        allow: false,
        message:
          `${sizes} It was not added, so the folder keeps syncing. Choose a smaller `
          + 'picture -- the same image saved as a JPEG or WebP is usually a tenth of the size.'
      };
    }

    return {
      allow: true,
      message:
        `${sizes} It stays on this device -- with auto sync off nothing is uploaded, `
        + 'but this folder will not be able to sync while it holds it.'
    };
  }

  return attachmentVerdict({ bytes: size, usage, signedIn, autoSync });
}
