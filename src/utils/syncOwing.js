/**
 * Whether this device owes the cloud anything for a folder.
 *
 * ## The rule, and why it exists
 *
 * A newer copy in the cloud does not automatically win. Work done here and not
 * yet sent must not be thrown away for a copy that merely carries a later
 * stamp — that is how a block moved twice went back to where the first move put
 * it, when another instance restamped a copy it had only received and older
 * content arrived looking newer.
 *
 * So a download is refused while this device still has something unsent.
 *
 * ## The half that was missing, and the deadlock it caused
 *
 * "Unsent" was worked out by comparing the folder's stamp against the stamp of
 * the last upload. That is right for a folder this device wrote — and wrong for
 * one it *received*, because a download changes the local stamp and nothing was
 * recording that the cloud already had it.
 *
 * From then on the two numbers disagreed for ever. Every newer copy was
 * refused, as unsent work that did not exist. Nothing cleared it: there was
 * genuinely nothing to upload, so the upload pass never ran and never updated
 * the record either. It came back only when somebody happened to type.
 *
 * It appeared in a log as nine refusals over a hundred seconds, each naming the
 * same pair of numbers, while the other device carried on writing into a cloud
 * this one had stopped listening to.
 *
 * A copy taken from the cloud is, by definition, what the cloud has. Recording
 * that at the moment it lands is the whole fix, and `owesUpload` below is then
 * simply true.
 */

/**
 * Does this folder have local work the cloud has not seen?
 *
 * `lastSent` is the folder's stamp as of the last time this device uploaded it
 * *or received it*, and `undefined` for a folder neither has happened to.
 */
export function owesUpload({ lastSent, localUpdatedAt } = {}) {
  // Never uploaded and never received: nothing is owed, and blocking here would
  // stop a fresh sign-in ever receiving anything.
  if (lastSent === undefined || lastSent === null) return false;
  return Number(localUpdatedAt || 0) !== Number(lastSent);
}

/**
 * Whether a cloud copy should be taken.
 *
 * Three things have to be true: there is something newer up there, this device
 * is not holding unsent work, and — the case that is easy to forget — a device
 * with no copy at all takes one whatever the stamps say.
 */
export function shouldTakeCloudCopy({
  hasLocalCopy = false,
  lastSent,
  localUpdatedAt,
  localModifiedAt = 0,
  remoteModifiedAt = 0
} = {}) {
  if (!hasLocalCopy) return true;
  if (owesUpload({ lastSent, localUpdatedAt })) return false;
  return Number(remoteModifiedAt) > Number(localModifiedAt);
}

/**
 * What to record once a copy has been taken.
 *
 * Returned rather than written, so the rule can be argued with here and the
 * writing stays where the map is.
 */
export function receivedFromCloud(remotePayload) {
  return Number(remotePayload?.updatedAt || 0);
}
