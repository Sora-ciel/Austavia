/**
 * What an account is actually holding, across both places it holds it.
 *
 * ## What was asked for
 *
 * "I wanted the storage to count everything that is synced in an account
 * folder." — 2026-09-27.
 *
 * ## Why it did not
 *
 * The balance was Cloud Storage objects and nothing else, because that is what
 * the triggers watch: an upload lands, `trackStorageUpload` fires, the number
 * moves. Everything else an account keeps in the cloud — the folders
 * themselves, and every picture pasted *into writing*, which is a data URL
 * inside the folder's payload — sat in the Realtime Database and was counted
 * only against a daily bandwidth cap that resets every night.
 *
 * So an account could hold a hundred megabytes of notes and read as empty. "5
 * GB" meant 5 GB of attachments and an unspecified amount of everything else,
 * which is not a thing anybody can be sold.
 *
 * ## Two components, one total
 *
 * The record now carries both and adds them up. They are kept apart rather
 * than merged into one running number because they are maintained by different
 * triggers, correct themselves at different times, and fail in different ways
 * — and a single number would make it impossible to tell which half had
 * drifted.
 *
 * `total` is what the ceiling compares against, and what the app shows.
 */

/** The two halves, and the sum, from whatever a record holds. */
const EMPTY = Object.freeze({ bytes: 0, noteBytes: 0, total: 0 });

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * The components of a stored record, whatever state it is in.
 *
 * Old records have `bytes` and no `noteBytes`; that is not a missing half, it
 * is an account whose notes have not been counted yet, and it reads as zero
 * until the next write of each folder tells us. Treating it as unknown and
 * refusing to total would make every existing account unmeasurable.
 */
function componentsOf(record) {
  const bytes = positive(record && record.bytes);
  const noteBytes = positive(record && record.noteBytes);
  return { bytes, noteBytes, total: bytes + noteBytes };
}

/**
 * The account's total after one half changes.
 *
 * Takes the current record and the new value for one component, and returns
 * both components and the sum — so the caller never adds them up itself and
 * the two can never disagree.
 */
function withComponent(record, name, value) {
  const current = componentsOf(record);
  const next = { ...current, [name]: positive(value) };
  return { bytes: next.bytes, noteBytes: next.noteBytes, total: next.bytes + next.noteBytes };
}

/**
 * The sum of every folder's recorded size.
 *
 * Absolute rather than incremental: handed the whole map, it works out what
 * the number should be rather than applying a change to it. That is what makes
 * it safe to run at any time and safe to run twice — the rule the whole
 * reconcile pass is built on.
 */
function totalNoteBytes(sizes) {
  if (!sizes || typeof sizes !== 'object') return 0;
  return Object.values(sizes).reduce((sum, value) => sum + positive(value), 0);
}

module.exports = {
  EMPTY,
  componentsOf,
  withComponent,
  totalNoteBytes
};
