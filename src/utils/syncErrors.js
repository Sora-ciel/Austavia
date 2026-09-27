// Saying what went wrong in words somebody can act on.
//
// A failed sync was reported by printing whatever the SDK threw, so the most
// ordinary situation in the app — an account at its storage ceiling — appeared
// as "User does not have permission to access users/…/attachments/…". That is
// true and it is useless: it reads as a bug, it says nothing about what to do,
// and the one thing it strongly implies (that something is broken) is wrong.
//
// The ceiling is enforced in three different places and each fails in its own
// dialect: storage.rules refuses an upload, database.rules.json refuses a write
// while `blocked` is set, and the network simply is not there. All three arrive
// here as an exception with a code buried in it.
//
// Pure, so the wording is testable without a browser or a signed-in account.

function codeOf(error) {
  if (!error) return '';

  // Firebase SDKs put a code on the error; a rules rejection from the Realtime
  // Database only says so in the message.
  const raw = String(error.code || '').toLowerCase();
  if (raw) return raw;

  const message = String(error.message || error).toUpperCase();
  if (message.includes('PERMISSION_DENIED')) return 'permission_denied';
  return '';
}

/**
 * The property the database refused as too large, or '' when that is not
 * what this is. The Realtime Database SDK checks sizes before sending and
 * throws a plain Error with no code: "...contains a string greater than
 * 10485760 utf8 bytes in property 'path.to.value'".
 */
function oversizedValue(error) {
  const message = String((error && error.message) || error || '');
  if (!/greater than \d+ utf8 bytes/i.test(message)) return '';
  const property = /in property '([^']+)'/.exec(message);
  return property ? property[1] : '(unknown)';
}

/**
 * A sentence to show someone whose sync just failed.
 *
 * `storageUsage` is the server's own record for the account. It is what
 * separates "you are out of space" from "something else refused this", which
 * the error alone cannot tell you — both arrive as an identical
 * storage/unauthorized.
 */
export function explainSyncFailure(error, { storageUsage } = {}) {
  const tooLarge = oversizedValue(error);
  if (tooLarge) {
    // Refused by the SDK before anything was sent: one value in the folder is
    // over the database's limit for a single string. Nothing in the folder
    // syncs until it is gone, which is the part that has to be said.
    const which = tooLarge.includes('backgroundImage')
      ? 'The background picture in this folder is'
      : 'Something in this folder -- most likely a picture -- is';
    return `${which} larger than the cloud takes for one piece of a folder (10 MB). `
      + 'The folder is staying on this device, and nothing else in it syncs until that '
      + 'picture is replaced with a smaller one or removed.';
  }

  const code = codeOf(error);
  const isFull = Boolean(storageUsage && storageUsage.full);

  // Refused by storage.rules. Full is by far the likeliest reason, and the
  // account's own record says whether that is what happened rather than
  // guessing from the code.
  if (code === 'storage/unauthorized' || code === 'storage/quota-exceeded') {
    return isFull
      ? 'Your cloud storage is full, so images and audio are not being uploaded. '
        + 'Delete some to free space — your notes themselves keep syncing.'
      : 'The cloud refused an upload. Sign out and back in, and try again.';
  }

  // Refused by database.rules.json, which denies writes while `blocked` is
  // set — the daily bandwidth ceiling. It clears itself overnight, which is
  // the part worth saying, because otherwise this looks permanent.
  if (code === 'permission_denied') {
    return 'You have reached today\'s sync limit, so changes are staying on this '
      + 'device for now. It resets at midnight UTC and everything syncs then.';
  }

  if (code === 'storage/retry-limit-exceeded' || code === 'unavailable') {
    return 'The connection dropped part-way through. Nothing was lost — it will '
      + 'try again on its own.';
  }

  if (code === 'storage/unauthenticated' || code === 'auth/user-token-expired') {
    return 'Your sign-in expired. Sign in again to carry on syncing.';
  }

  // Anything unrecognised keeps the original text. A wrong friendly message is
  // worse than a technical one: it sends somebody looking in the wrong place.
  return String((error && error.message) || error || 'unknown error');
}
