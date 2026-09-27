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

/** What is left, never below zero. */
export function roomLeft(usage) {
  const limit = ceilingOf(usage);
  if (!Number.isFinite(limit)) return Number.POSITIVE_INFINITY;
  const used = Math.max(0, Number((usage && usage.bytes) || 0));
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
