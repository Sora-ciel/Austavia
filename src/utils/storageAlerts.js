/**
 * Telling somebody their cloud storage is filling up, before it stops them.
 *
 * ## What was asked for
 *
 * "I think there needs to be a pop up that says if your storage is full, so
 * that people actually know." — 2026-09-27.
 *
 * ## What was already there, and why it was not enough
 *
 * `syncErrors.js` produces a good sentence for somebody whose upload has just
 * been refused, and the app shows it in a banner. But it is only ever reached
 * from the `catch` around an upload — so the first anybody hears about a
 * ceiling is a picture that did not save. The figure in the right-hand panel
 * is the other half, and it is behind a panel nobody opens unless they already
 * suspect something.
 *
 * So the account's own record is watched instead, and the person is told when
 * it *changes*: once when it is nearly full, once when it is full. The words
 * are the same words the failure uses, because a warning that reads
 * differently from the eventual error is two problems to understand rather
 * than one.
 *
 * ## Announcing a change, not a state
 *
 * The record is written on every upload and every delete, so a state alone
 * would put the same banner back on screen every few seconds for as long as
 * somebody stayed over the line. What is announced is the *crossing*, and only
 * ever upwards: filling up is news, and emptying is the thing they were asked
 * to do.
 *
 * Dropping back to comfortable forgets what was said, so the next time it
 * fills up it says so again. Anything else means a person who cleared some
 * space in March is never warned again.
 */

/** How bad it has to get before anything is said, worst first. */
const ANNOUNCED_STATES = ['full', 'nearly'];

/** Whether one state is worse than another. */
function severity(state) {
  const rank = ANNOUNCED_STATES.indexOf(state);
  return rank === -1 ? -1 : ANNOUNCED_STATES.length - rank;
}

const MESSAGES = {
  // Deliberately the same sentence `syncErrors.js` gives when an upload is
  // actually refused. Hearing it first as a warning and then again as the
  // reason is one idea, not two.
  full:
    'Your cloud storage is full, so images and audio are not being uploaded. '
    + 'Delete some to free space — your notes themselves keep syncing.',
  nearly:
    'Your cloud storage is nearly full. Images and audio will stop uploading '
    + 'when it runs out; your notes themselves will keep syncing.'
};

/**
 * What to say about a storage record, given what has already been said.
 *
 * `announced` is the worst state this account has been told about since it was
 * last comfortable. Returns the next value for it alongside the message, so
 * the caller keeps no rules of its own.
 */
export function storageAnnouncement({ state = 'ok', announced = '' } = {}) {
  const now = severity(state);

  // Comfortable again, or a plan with no ceiling. Forget what was said so the
  // next time it fills up is heard.
  if (now === -1) return { announce: false, message: '', announced: '' };

  // Already said this, or worse. Repeating it on every upload would make the
  // banner furniture, and furniture is not read.
  if (now <= severity(announced)) return { announce: false, message: '', announced };

  return { announce: true, message: MESSAGES[state] || '', announced: state };
}
