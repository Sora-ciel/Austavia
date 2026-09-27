// Turning the stored-bytes record into something a person can read.
//
// The server keeps `storage/{uid}` as { bytes, limit, full }. None of that
// means anything to someone looking at the app, and until now the app said
// nothing at all: no usage, no warning on the way up, and at the ceiling a raw
// permission error with no explanation. Fine for a cost guard. Not fine for
// something people pay for — "4.2 GB of 10 GB" is most of what a storage tier
// actually sells, and a silent failure at the limit is a support email.
//
// Pure, so the wording and the arithmetic can be tested without a browser.

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** A byte count as a short human string. */
export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';

  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }

  // Whole numbers below a kilobyte, one decimal above — "1.4 MB" reads better
  // than "1.44 MB" and much better than "1509376 B".
  const rounded = unit === 0 ? Math.round(size) : Math.round(size * 10) / 10;
  return `${rounded} ${UNITS[unit]}`;
}

// A null limit is how the database stores "no ceiling", because Infinity is
// not JSON. It has to read as unlimited everywhere rather than as zero, which
// is what a bare Number(null) would give and would show every unlimited
// account as permanently full.
function limitOf(usage) {
  const raw = usage && usage.limit;
  if (raw === null || raw === undefined) return Number.POSITIVE_INFINITY;

  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

/**
 * Everything the account is holding, not just its attachments.
 *
 * The record carries two components now — `bytes` for Cloud Storage objects
 * and `noteBytes` for the folders themselves, every picture pasted into
 * writing included — and `total` is their sum. Asked for on 2026-09-27: "I
 * wanted the storage to count everything that is synced in an account folder."
 *
 * A record written before that has `bytes` and no `total`, and must keep
 * reading as what it says rather than as zero.
 */
function usedBytes(usage) {
  const total = Number(usage && usage.total);
  if (Number.isFinite(total) && total >= 0) return total;
  return Math.max(0, Number((usage && usage.bytes) || 0));
}

/**
 * What to show for an account's storage.
 *
 * `state` is what the UI colours on, and it is deliberately three values and
 * not a percentage: "nearly full" needs to arrive before the wall does, or the
 * first a person hears of a limit is an upload that failed.
 */
export function describeStorageUsage(usage) {
  const bytes = usedBytes(usage);
  const limit = limitOf(usage);

  if (!Number.isFinite(limit)) {
    return {
      state: 'unlimited',
      percent: 0,
      used: formatBytes(bytes),
      limit: null,
      label: `${formatBytes(bytes)} used`
    };
  }

  const percent = limit > 0 ? Math.min(100, Math.round((bytes / limit) * 100)) : 100;

  // Trusts the server's verdict rather than recomputing it. The bytes and the
  // flag are written together in one transaction, and the flag is what the
  // token and the rules agree on — a UI that decided for itself could tell
  // someone they were fine while their uploads were being refused.
  const full = (usage && usage.full === true) || bytes >= limit;

  return {
    state: full ? 'full' : percent >= 80 ? 'nearly' : 'ok',
    percent,
    used: formatBytes(bytes),
    limit: formatBytes(limit),
    label: `${formatBytes(bytes)} of ${formatBytes(limit)}`
  };
}

/** What to say when there is something to say, and nothing when there is not. */
export function storageMessageFor(usage) {
  const { state } = describeStorageUsage(usage);

  if (state === 'full') {
    return 'Storage is full. Delete some images or audio to free space — everything else keeps syncing.';
  }
  if (state === 'nearly') {
    return 'Storage is nearly full.';
  }

  return '';
}
