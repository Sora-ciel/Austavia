// Deleting an account, from a button in the app.
//
// Asked for on 2026-11-11, as one of the two things that matter most before
// anyone else uses Austavia: until now a deletion was a request by email,
// carried out by hand from a list in PENDING.md. The privacy policy promises
// it, the EU requires it, and Google Play requires a way to do it from inside
// the app.
//
// This file decides; deleteAccount in index.js acts. What it decides:
//   - which places hold an account, so nothing is left behind;
//   - whether the person proved it is them a moment ago;
//   - what to do about a subscription that is still being paid.
//
// A deletion leaves one small marker, deletedAccounts/{uid}. The triggers that
// keep balances (storageAccounting.js) fire for every file and folder a
// deletion removes, and without the marker they would write a fresh, empty
// balance for an account that no longer exists. The daily pass removes
// whatever is left again, absolutely, and forgets the marker after a month --
// the same rule as everything else in CLAUDE.md: the fast path does the work,
// the periodic pass makes it true.

const { STATUS } = require('./entitlements');

const DELETED_ACCOUNTS = 'deletedAccounts';

// How long ago signing in may have been. Google tokens last an hour; a
// deletion asks for a sign-in made for the purpose, so that a phone left
// unlocked on a table cannot be used to wipe an account.
const RECENT_SIGN_IN_MS = 5 * 60 * 1000;

// How long a marker stays. Past this, every trigger a deletion set off has
// long since landed, and the privacy policy's thirty days are over.
const MARKER_KEPT_MS = 30 * 24 * 60 * 60 * 1000;

// A uid becomes part of a path that is deleted. An empty one would make
// `storage/` itself the target, so anything that is not plainly a uid is
// refused rather than cleaned up.
const UID_SHAPE = /^[A-Za-z0-9_-]{1,128}$/;

function isDeletableUid(uid) {
  return typeof uid === 'string' && UID_SHAPE.test(uid);
}

/** Every database path that belongs to one account. */
function accountPaths(uid, namespace) {
  if (!isDeletableUid(uid)) throw new Error('not a uid');
  return [
    `sync/${namespace}/users/${uid}`,
    `storage/${uid}`,
    `usage/${uid}`,
    `activity/${uid}`,
    `subscriptions/${uid}`,
    `noteSizes/${uid}`
  ];
}

/** The account's folder in Cloud Storage, with its trailing slash. */
function storagePrefix(uid) {
  if (!isDeletableUid(uid)) throw new Error('not a uid');
  return `users/${uid}/`;
}

/**
 * Whether the sign-in on this token was made in the last few minutes.
 * `auth_time` is in seconds, as Firebase writes it.
 */
function signedInRecently({ authTimeSeconds, now = Date.now(), within = RECENT_SIGN_IN_MS } = {}) {
  const at = Number(authTimeSeconds) * 1000;
  if (!Number.isFinite(at) || at <= 0) return false;
  // A sign-in from the future is a clock or a forgery; neither is proof.
  if (at > now + 60 * 1000) return false;
  return now - at <= within;
}

// Statuses after which Polar will not charge again.
const ENDED = new Set([STATUS.REFUNDED, STATUS.NONE]);

/**
 * What to do about the account's subscription before deleting it.
 *
 *   { action: 'none' }            nothing is being paid
 *   { action: 'revoke', id }      end it at Polar first
 *   { action: 'by-hand' }         paying, but the id was never recorded
 *
 * A cancelled subscription is still revoked: it will not renew, but revoking
 * one that is already over is answered as done (polarApi.js), so asking costs
 * nothing and being wrong about it would cost the person a month.
 */
function subscriptionToEnd(record) {
  if (!record || typeof record !== 'object') return { action: 'none' };
  if (record.provider && record.provider !== 'polar') return { action: 'none' };
  if (ENDED.has(record.status)) return { action: 'none' };
  if (!record.status) return { action: 'none' };
  const id = typeof record.subscriptionId === 'string' && record.subscriptionId ? record.subscriptionId : null;
  return id ? { action: 'revoke', id } : { action: 'by-hand' };
}

/** The markers old enough to forget. */
function markersToForget(markers, now = Date.now()) {
  return Object.entries(markers || {})
    .filter(([, marker]) => {
      const at = Number(marker && marker.at);
      return !Number.isFinite(at) || now - at > MARKER_KEPT_MS;
    })
    .map(([uid]) => uid);
}

module.exports = {
  DELETED_ACCOUNTS,
  RECENT_SIGN_IN_MS,
  MARKER_KEPT_MS,
  isDeletableUid,
  accountPaths,
  storagePrefix,
  signedInRecently,
  subscriptionToEnd,
  markersToForget
};
