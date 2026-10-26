/**
 * Keeping what this build does not understand.
 *
 * ## What was asked for
 *
 * 2026-10-26: "make something so that new details are still kept even though
 * a certain version doesn't know what it means yet ... so that in no situation
 * we'll have this little problem again. It's an app that will be used by
 * clients all over the world." Somebody's phone is always a version behind
 * their computer. Whatever the newer one writes, the older one must carry
 * through untouched, or every new feature arrives with a way to lose data.
 *
 * ## The rule
 *
 * Anything that cleans up stored data -- normalising habits, goals, mode
 * settings -- rebuilds what it knows and *adds back* everything it does not
 * (`withUnknown`). It never rebuilds from a list of known fields alone. What it
 * does not know it neither reads nor changes: it is somebody else's, from a
 * build that understands it.
 *
 * Kept in a fixed key order (`canonical`), because two devices must write the
 * same bytes for the same data or each will think the other has edited it
 * (syncRules.js).
 */

/**
 * How big a field this build does not know may be and still be carried. Not a
 * limit on features -- a newer build's notes on a habit's days, or a whole new
 * mode's settings, can be large, and dropping them is exactly the loss this
 * file exists to prevent. Only a guard against a corrupt value: ten million
 * characters, past any folder that could still be saved.
 */
export const MAX_UNKNOWN_SIZE = 10_000_000;

/** The same value, with every object's keys in sorted order. */
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}

/**
 * The fields of `raw` not in `known`, kept as they came (canonically), and
 * only those small enough to carry. Keys starting with `_` are this build's
 * own bookkeeping and never stored.
 */
export function unknownFields(raw, known, { maxSize = MAX_UNKNOWN_SIZE } = {}) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const knownSet = known instanceof Set ? known : new Set(known);
  for (const key of Object.keys(raw).sort()) {
    if (knownSet.has(key) || key.startsWith('_')) continue;
    const value = raw[key];
    if (value === undefined || typeof value === 'function') continue;
    let size = 0;
    try { size = JSON.stringify(value)?.length ?? 0; } catch { continue; }
    if (size === 0 || size > maxSize) continue;
    out[key] = canonical(value);
  }
  return out;
}

/** `rebuilt`, with the unknown fields of `raw` added back after it. */
export function withUnknown(rebuilt, raw, known = Object.keys(rebuilt), options) {
  return { ...rebuilt, ...unknownFields(raw, known, options) };
}
