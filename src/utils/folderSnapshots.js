/**
 * The copy a folder had before the cloud replaced it.
 *
 * ## What was asked for
 *
 * After a folder reverted to an older version: "before a download overwrites a
 * folder, keep the copy it replaced", so that the answer to a sync going wrong
 * is Restore rather than a message asking whether anything can be done.
 *
 * ## Why the undo history is not this
 *
 * Written text already has an undo history that survives a cloud download --
 * `textHistory.js` pushes the outgoing content onto the past instead of
 * dropping it, and that is what got a note back the day this was asked for. It
 * is not a substitute, and the gaps are not small:
 *
 * - **It is in memory.** A reload, a crash, a closed tab, and it is gone. The
 *   recovery worked because the tab had been left open.
 * - **It is per text block, and only for blocks whose editor has mounted.** In
 *   Single Note mode exactly one note is mounted at a time, so a download that
 *   rewrites four notes leaves three with no history at all.
 * - **It is only text.** A block that was deleted, moved, renamed, or a
 *   picture, a task list, a playlist, the mode settings -- none of that is in
 *   an editor's undo, so none of it comes back.
 * - **You have to know.** In the right block, before anything else, with no
 *   sign anywhere that it is worth trying.
 *
 * A snapshot is the whole folder, on disk, listed somewhere you can find it.
 *
 * ## What this is not
 *
 * Not a fix for the race that caused the incident, and not an argument against
 * fixing it. It is insurance against the class rather than the instance: every
 * future way a folder can be wrongly replaced is covered by the same list,
 * including the ones not yet found.
 *
 * Not synced either. A snapshot is what *this* device was holding, which is
 * exactly what no other device has.
 */

/** How many replaced copies to keep for one folder. */
export const MAX_SNAPSHOTS = 10;

/**
 * How much room they may take, per folder.
 *
 * A count on its own is not a limit: pictures are stored inline, so one folder
 * of photographs can be tens of megabytes and ten of those would fill a
 * browser's storage on its own and start getting the whole database evicted.
 * Whichever limit bites first wins, and the oldest goes.
 */
export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

/** Roughly what a payload takes, which is all a budget needs. */
export function sizeOf(payload) {
  try {
    return JSON.stringify(payload ?? null)?.length ?? 0;
  } catch {
    // Circular, or something that will not serialise. Unknown size is treated
    // as large so it cannot quietly sit outside the budget for ever.
    return MAX_SNAPSHOT_BYTES;
  }
}

/** The characters of writing a payload holds, for telling two copies apart. */
export function characterCountOf(payload) {
  const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
  return blocks.reduce((total, block) => {
    const content = typeof block?.content === 'string' ? block.content : '';
    return total + content.length;
  }, 0);
}

/**
 * Whether replacing `current` with `incoming` actually loses anything.
 *
 * A download that carries the same content as what is already here is the
 * ordinary case -- it happens every time another device restamps without
 * changing anything -- and keeping a snapshot of it would push the copies that
 * matter off the end of the list.
 */
export function worthKeeping({ current, incoming } = {}) {
  const blocks = Array.isArray(current?.blocks) ? current.blocks : null;
  // Nothing here yet: a first download is not replacing anything.
  if (!blocks || !blocks.length) return false;

  return sameContent(current, incoming) === false;
}

/** Whether two payloads hold the same blocks, ignoring their timestamps. */
export function sameContent(a, b) {
  const left = Array.isArray(a?.blocks) ? a.blocks : null;
  const right = Array.isArray(b?.blocks) ? b.blocks : null;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/**
 * A snapshot record, ready to store.
 *
 * `takenAt` is passed in rather than read from the clock, so that the deciding
 * here can be exercised without one.
 */
export function snapshotOf(payload, { takenAt, reason = 'replaced by the cloud' } = {}) {
  return {
    takenAt: Number(takenAt) || 0,
    reason,
    blockCount: Array.isArray(payload?.blocks) ? payload.blocks.length : 0,
    characterCount: characterCountOf(payload),
    bytes: sizeOf(payload),
    // The folder's own stamp, so a restored copy can say where it came from.
    modifiedAt: Number(payload?.modifiedAt || payload?.updatedAt || 0),
    payload
  };
}

/**
 * The list with a new snapshot in it, newest first and inside both limits.
 *
 * Trimming takes from the old end, which is the only end it can take from: the
 * newest copy is the one most likely to be the one somebody wants back.
 */
export function withSnapshot(list, snapshot, options = {}) {
  const limit = options.limit ?? MAX_SNAPSHOTS;
  const byteBudget = options.byteBudget ?? MAX_SNAPSHOT_BYTES;

  const existing = Array.isArray(list) ? list : [];
  const next = [snapshot, ...existing]
    .filter(Boolean)
    .sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0))
    .slice(0, Math.max(1, limit));

  // The newest is kept whatever it costs. A folder bigger than the whole
  // budget would otherwise be the one case that gets no protection at all,
  // and it is the case with the most to lose.
  const kept = [];
  let used = 0;
  for (const entry of next) {
    const bytes = Number(entry?.bytes) || 0;
    if (kept.length && used + bytes > byteBudget) break;
    kept.push(entry);
    used += bytes;
  }
  return kept;
}

/** What the list should say about a snapshot, without saying it in English. */
export function describeSnapshot(snapshot) {
  return {
    takenAt: Number(snapshot?.takenAt) || 0,
    blockCount: Number(snapshot?.blockCount) || 0,
    characterCount: Number(snapshot?.characterCount) || 0,
    bytes: Number(snapshot?.bytes) || 0
  };
}
