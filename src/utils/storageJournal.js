/**
 * A line per launch, so that losing something local has a *when*.
 *
 * ## What was asked for
 *
 * "Just to make sure — now if this happens again we'll be able to see what did
 * it, or at least when it happened?" — 2026-09-26, after every imported track
 * disappeared from a packaged desktop build.
 *
 * The answer was no. `describeLocalStorage` says what the database holds *now*,
 * which separates three cases that otherwise look identical, and that is worth
 * having. But an empty store looks the same the day it empties and a month
 * later, so nothing in it can say when, or which build was running.
 *
 * So each launch writes down what it found: the version, and how much was in
 * each store. Two launches either side of a loss then name the window and the
 * build, which is most of the way to naming the cause.
 *
 * ## It deliberately does not live in the database it watches
 *
 * The thing being watched is IndexedDB. A journal kept there would be wiped by
 * exactly the event it exists to record — so it goes in `localStorage`, which
 * is a separate store that survives an IndexedDB loss.
 *
 * That is not a guarantee, and the gap is itself informative. A data folder
 * that has been swapped — the Tauri identifier changed once already, and
 * WebView2 keys its folder on it — takes both, and the journal comes back
 * empty. **A launch with no history at all is therefore evidence in its own
 * right**: not "nothing has been recorded yet" but "this profile has never
 * seen this app before", which is a different fault with a different fix.
 */

/** Where the journal is kept. Namespaced, because localStorage is shared. */
export const JOURNAL_KEY = 'austavia:storage-journal';

/**
 * How many launches to keep.
 *
 * Enough to cover the gap between noticing something is missing and getting
 * round to reporting it, which in practice is days. Small enough that the
 * whole thing is a couple of kilobytes and can be pasted into a message.
 */
export const JOURNAL_KEPT = 40;

/** The counts worth watching, and what they are called in the report. */
const WATCHED = [
  ['audio', 'audio tracks'],
  ['blocks', 'folders'],
  ['files', 'block files'],
  ['covers', 'covers']
];

/** One launch, reduced to the few numbers that would show a loss. */
export function journalEntry({ at = Date.now(), version = 'unknown', store = {} } = {}) {
  const counts = store.counts || {};
  return {
    at: Number(at) || Date.now(),
    version: String(version || 'unknown'),
    // Zero means the database was not there before this launch — see
    // describeLocalStorage, which reads the version before opening.
    onDisk: store.versionOnDisk ?? null,
    opened: !store.error,
    blocks: Number(counts.blocks) || 0,
    files: Number(counts['block-files']) || 0,
    audio: Number(store.audioKeys) || 0,
    covers: Number(store.coverKeys) || 0,
    index: Boolean(store.hasLibraryIndex)
  };
}

/** The journal with this launch on the end, oldest dropped once it is full. */
export function appendLaunch(entries, entry, kept = JOURNAL_KEPT) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const next = [...list, entry];
  return next.length <= kept ? next : next.slice(next.length - kept);
}

/**
 * Where something went missing, and between which two launches.
 *
 * Only ever reports a **drop**. Things arriving is the normal business of an
 * app and saying so would bury the one line that matters.
 *
 * A launch that could not open the database is skipped rather than compared
 * against: it reports zeroes because it could not look, and treating that as a
 * loss would cry wolf every time the database was briefly busy.
 */
export function findLosses(entries) {
  const list = (Array.isArray(entries) ? entries : []).filter(e => e && e.opened);
  const losses = [];

  for (let i = 1; i < list.length; i += 1) {
    const before = list[i - 1];
    const after = list[i];

    for (const [key, label] of WATCHED) {
      if (before[key] > 0 && after[key] < before[key]) {
        losses.push({
          what: label,
          from: before[key],
          to: after[key],
          at: after.at,
          fromVersion: before.version,
          toVersion: after.version,
          // The distinction that decides how alarmed to be: some of it going
          // is a deletion somebody probably made, all of it going is not.
          everything: after[key] === 0
        });
      }
    }
  }

  return losses;
}

function when(at) {
  const date = new Date(Number(at) || 0);
  if (Number.isNaN(date.getTime())) return 'an unknown time';
  // Local, and to the minute: this is read by a person trying to remember what
  // they were doing, not diffed by a machine.
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The journal as it appears in the diagnostics.
 *
 * Losses first and loudly, because that is the reason anybody is reading it.
 * The last few launches after them, so the numbers can be seen moving rather
 * than taken on trust.
 */
export function describeJournal(entries, { show = 6 } = {}) {
  const list = (Array.isArray(entries) ? entries : []).filter(Boolean);
  const lines = [''];

  if (!list.length) {
    lines.push('launch history: none');
    // Not a shrug. See the note at the top of this file.
    lines.push('  this profile has no record of the app ever starting here before');
    return lines;
  }

  const losses = findLosses(list);
  if (losses.length) {
    lines.push('launch history — SOMETHING WENT MISSING');
    for (const loss of losses) {
      lines.push(
        `  ${loss.what}: ${loss.from} → ${loss.to}` +
          (loss.everything ? ' (all of it)' : '') +
          ` at ${when(loss.at)}`
      );
      lines.push(
        loss.fromVersion === loss.toVersion
          ? `    both launches were ${loss.toVersion}`
          : `    between ${loss.fromVersion} and ${loss.toVersion}`
      );
    }
  } else {
    lines.push('launch history: nothing has gone missing across the launches recorded');
  }

  lines.push(`  ${list.length} launch(es) recorded, last ${Math.min(show, list.length)}:`);
  for (const entry of list.slice(-show)) {
    lines.push(
      `    ${when(entry.at)}  ${entry.version}` +
        `  folders ${entry.blocks} · files ${entry.files} · audio ${entry.audio}` +
        (entry.opened ? '' : '  (database would not open)')
    );
  }

  return lines;
}
