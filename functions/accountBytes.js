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
function sizeOf(entry) {
  // A plain number is how the first version of this wrote them; an object
  // carrying the folder's stamp alongside is how it writes them now. Both are
  // on disk, so both are read.
  if (entry && typeof entry === 'object') return positive(entry.bytes);
  return positive(entry);
}

function measuredAt(entry) {
  return entry && typeof entry === 'object' ? positive(entry.at) : 0;
}

function totalNoteBytes(sizes) {
  if (!sizes || typeof sizes !== 'object') return 0;
  return Object.values(sizes).reduce((sum, entry) => sum + sizeOf(entry), 0);
}

/**
 * Which folders the weekly pass has to actually open, and which it does not.
 *
 * The pass has to be able to correct a folder whose size was never recorded or
 * was recorded before its last change -- otherwise a single missed trigger is
 * wrong for ever, which is the failure CLAUDE.md's whole reconcile rule exists
 * to prevent.
 *
 * But re-reading every folder means downloading every note in every account,
 * pictures and all, once a week. So the *index* is read instead -- it is tiny,
 * fixed-shape, and carries each folder's `updatedAt` -- and only folders whose
 * recorded stamp is missing or behind are opened.
 *
 * That makes the pass absolute where it matters and cheap everywhere else: a
 * folder nobody has touched since it was measured cannot have changed size.
 */
function foldersNeedingMeasure({ index, sizes } = {}) {
  if (!index || typeof index !== 'object') return [];

  return Object.keys(index).filter(fileId => {
    const entry = index[fileId];
    const updatedAt = positive(entry && entry.updatedAt);
    const recorded = sizes && typeof sizes === 'object' ? sizes[fileId] : undefined;

    if (recorded === undefined || recorded === null) return true; // never measured
    // A plain number carries no stamp, so it cannot be shown to be current.
    return measuredAt(recorded) < updatedAt;
  });
}

/**
 * Sizes left behind by folders that no longer exist.
 *
 * Without this an account carries the weight of everything it has ever deleted
 * in any week when the delete's own trigger was missed.
 */
function orphanSizes({ index, sizes } = {}) {
  if (!sizes || typeof sizes !== 'object') return [];
  const live = index && typeof index === 'object' ? index : {};
  return Object.keys(sizes).filter(fileId => !(fileId in live));
}

module.exports = {
  EMPTY,
  componentsOf,
  withComponent,
  totalNoteBytes,
  foldersNeedingMeasure,
  orphanSizes
};
