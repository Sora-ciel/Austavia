// A record of what sync decided, and why.
//
// Two instances open on one account have twice been caught handing a folder
// back and forth with nobody editing, and both times the cause had to be
// guessed at from the outside, because the only way to watch it happen was to
// have the app running signed in on two machines — where there is no console to
// read and nothing keeps a history.
//
// So the decisions write themselves down here instead. The question that
// matters is never "did it save?" but "what did it think had changed?", and
// that is what describeDifference answers: the exact field, and both values.
// One line of that ends an argument the last two rounds of guessing could not.
//
// Nothing here touches the network or the DOM. It is a ring buffer and a diff,
// both plain functions, so test/sync-log.test.js runs the real thing.

// Enough to cover several minutes of ticks — long enough to catch a loop in the
// act — without holding a session's whole history in memory.
const MAX_ENTRIES = 300;

// Values are printed into the log, and a note can carry megabytes of base64, so
// anything long is cut down before it is kept.
const MAX_VALUE_CHARS = 80;

// ── Surviving a restart ───────────────────────────────────────────
//
// The log used to live only in memory, which loses it exactly when it is worth
// most: a sync that hangs on a phone is fixed by force-stopping the app, and
// force-stopping is what throws away the record of what it was doing. Every
// time the problem was made to go away, the evidence went with it.
//
// So the tail of it is written down and read back on the next run, kept apart
// from this run's lines. What is carried over is the minutes leading up to the
// restart — the part describing the state that had to be killed.
const STORAGE_KEY = 'syncLogTail';
export const CARRY_OVER_MS = 5 * 60 * 1000;
// A cap as well as a window, so a loop writing hundreds of lines a second
// cannot fill storage with five minutes of itself.
const CARRY_OVER_MAX = 120;

/**
 * Which lines from the last run are worth keeping, given when this one starts.
 *
 * Marked `previous` so a reader can tell what happened before the restart from
 * what happened after it — the two are almost never the same story, and the
 * first is usually the one being asked about.
 */
export function carryOver(stored, now = Date.now(), window = CARRY_OVER_MS) {
  if (!Array.isArray(stored)) return [];
  return stored
    .filter(entry => entry && Number.isFinite(Number(entry.at)) && now - Number(entry.at) <= window)
    .slice(-CARRY_OVER_MAX)
    .map(entry => ({ ...entry, previous: true }));
}

function readStored() {
  try {
    if (typeof localStorage === 'undefined') return [];
    return carryOver(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    // Unreadable or unparseable is the same as absent. A diagnostic that
    // refuses to start because its own history is corrupt helps nobody.
    return [];
  }
}

// Writing on every line would mean a JSON round trip per log entry during the
// busiest moment there is. Coalesced instead, and flushed when the app is being
// put away — which on a phone is the last moment there is.
let writeTimer = null;
function persistSoon() {
  if (typeof localStorage === 'undefined' || writeTimer !== null) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    persistNow();
  }, 2000);
}

export function persistNow() {
  try {
    if (typeof localStorage === 'undefined') return;
    const tail = entries.slice(-CARRY_OVER_MAX).map(({ previous, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tail));
  } catch {
    // Storage full or blocked. Logging must never be the thing that throws.
  }
}

let entries = readStored();
let listeners = new Set();

function notify() {
  for (const listener of listeners) {
    try { listener(entries); } catch { /* a bad listener must not break logging */ }
  }
}

/**
 * Writes one line. `kind` is a short tag ('save', 'skip', 'upload', 'download',
 * 'remount', 'snapshot', 'restore', 'error'); `detail` is anything worth
 * keeping alongside it.
 */
export function logSync(kind, folder, message, detail = null) {
  entries = [
    ...entries.slice(-(MAX_ENTRIES - 1)),
    { at: Date.now(), kind, folder: folder ?? '', message, detail }
  ];
  persistSoon();
  notify();
}

export function getSyncLog() {
  return entries;
}

export function clearSyncLog() {
  entries = [];
  // Clearing means clearing, including what was carried over — otherwise the
  // lines come back on the next start and the button appears not to work.
  persistNow();
  notify();
}

export function subscribeSyncLog(listener) {
  listeners.add(listener);
  // Guarded like every other call into a listener. Logging exists to survive a
  // situation that is already going wrong, so it must never be the thing that
  // throws — least of all at subscription, before anything has been recorded.
  try { listener(entries); } catch { /* a bad listener must not break logging */ }
  return () => listeners.delete(listener);
}

function shorten(value) {
  if (typeof value === 'string') {
    return value.length > MAX_VALUE_CHARS
      ? `${value.slice(0, MAX_VALUE_CHARS)}… (${value.length} chars)`
      : value;
  }
  if (value === undefined) return '(absent)';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return `{${Object.keys(value).join(', ')}}`;
  return String(value);
}

/**
 * Where two versions of a folder differ, as a list of field paths with both
 * values — `blocks.0.tasks: (absent) -> [0 items]` and the like.
 *
 * Stops at `limit` findings: when something is looping, the first one or two
 * name the culprit, and walking a whole note's worth of differences would bury
 * it. Order is stable so the same difference reads the same way each tick.
 */
export function describeDifference(before, after, limit = 5) {
  const found = [];

  function walk(a, b, path) {
    if (found.length >= limit) return;
    if (a === b) return;

    const aIsObject = a !== null && typeof a === 'object';
    const bIsObject = b !== null && typeof b === 'object';

    if (!aIsObject || !bIsObject || Array.isArray(a) !== Array.isArray(b)) {
      found.push({ path: path || '(root)', before: shorten(a), after: shorten(b) });
      return;
    }

    if (Array.isArray(a)) {
      if (a.length !== b.length) {
        found.push({ path: `${path}.length`, before: a.length, after: b.length });
        return;
      }
      for (let i = 0; i < a.length && found.length < limit; i += 1) {
        walk(a[i], b[i], `${path}.${i}`);
      }
      return;
    }

    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      if (found.length >= limit) return;
      walk(a[key], b[key], path ? `${path}.${key}` : key);
    }
  }

  walk(before, after, '');
  return found;
}

/** The log as text, for copying somewhere it can be read or sent. */
export function formatSyncLog(list = entries) {
  if (!list.length) return 'Nothing logged yet.';
  return list
    .map(entry => {
      const time = new Date(entry.at).toISOString().slice(11, 23);
      const folder = entry.folder ? ` [${entry.folder}]` : '';
      const detail = entry.detail ? `\n    ${formatDetail(entry.detail)}` : '';
      return `${time} ${entry.kind.padEnd(8)}${folder} ${entry.message}${detail}`;
    })
    .join('\n');
}

function formatDetail(detail) {
  if (Array.isArray(detail)) {
    return detail
      .map(item =>
        item && typeof item === 'object' && 'path' in item
          ? `${item.path}: ${item.before} -> ${item.after}`
          : String(item)
      )
      .join('\n    ');
  }
  if (detail && typeof detail === 'object') {
    return Object.entries(detail).map(([k, v]) => `${k}: ${shorten(v)}`).join(', ');
  }
  return String(detail);
}
