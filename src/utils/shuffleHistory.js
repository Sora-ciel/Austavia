/**
 * What shuffle has already played, so that going back goes back.
 *
 * ## What was asked for
 *
 * "The random button, when activated, should remember the music it puts — so
 * that when you go back on it, it should be the music you listened to before
 * and not a random music. Because otherwise it's a very weird behaviour and you
 * can't go back to a music you liked."
 *
 * Shuffle picked at random in *both* directions. Pressing back gave another
 * track nobody had heard, so the one thing back is for — hearing again the
 * thing that just played — was the one thing it could not do. A song you liked
 * and did not catch the name of was simply gone.
 *
 * ## A path rather than a bag
 *
 * So shuffle keeps the order it actually played things in, and back and forward
 * walk that order. It is the shape a browser's history has, and for the same
 * reason: the interesting question is not "what else is there" but "what did I
 * just have".
 *
 * Forward has two meanings depending on where you are standing, and both are
 * wanted:
 *
 * - **At the end of what has been played** — the ordinary case — it picks
 *   something new, which is what shuffle is for.
 * - **Somewhere in the middle**, because you pressed back, it re-walks what you
 *   already heard rather than picking again. Going back three and forward one
 *   should land on the track you were on two ago, not on a stranger.
 *
 * Playing something directly is a new branch: whatever was ahead is dropped,
 * the way it is when you follow a link after going back in a browser. Keeping
 * it would mean "forward" led somewhere that has nothing to do with what you
 * are listening to now.
 */

/** How much of the path is worth keeping. */
export const MAX_REMEMBERED = 200;

/** Somewhere to start: nothing played, standing before the beginning. */
export const EMPTY = Object.freeze({ played: Object.freeze([]), position: -1 });

const randomFrom = (candidates) => candidates[Math.floor(Math.random() * candidates.length)];

/**
 * Where a step takes you, and what the path looks like afterwards.
 *
 * `pick` is injected so the choosing can be made predictable in a test; the
 * default is what shuffle has always done.
 *
 * A `trackId` of null means nothing to do — standing at the beginning and
 * pressing back. Staying where you are is the honest answer to that; wrapping
 * round to the end would be inventing a history that never happened.
 */
export function stepShuffle({
  played = [],
  position = -1,
  queue = [],
  currentId = null,
  delta = 1,
  pick = randomFrom,
  limit = MAX_REMEMBERED
} = {}) {
  const path = Array.isArray(played) ? played : [];
  const at = Number.isInteger(position) ? position : -1;
  const pool = (Array.isArray(queue) ? queue : []).filter(Boolean);
  const unchanged = { trackId: null, played: path, position: at };

  if (!pool.length) return unchanged;

  if (delta < 0) {
    // Back through what was actually heard.
    if (at <= 0) return unchanged;
    return { trackId: path[at - 1], played: path, position: at - 1 };
  }

  // Forward, and still inside what has been heard: re-walk it.
  if (at >= 0 && at < path.length - 1) {
    return { trackId: path[at + 1], played: path, position: at + 1 };
  }

  // At the end: something new. Anything but what is playing, so a queue of two
  // alternates rather than repeating itself.
  const candidates = pool.filter((id) => id !== currentId);
  const chosen = candidates.length ? pick(candidates) : pool[0];
  if (!chosen) return unchanged;

  return append({ played: path, position: at, trackId: chosen, limit });
}

/**
 * The path with a track played directly added to it.
 *
 * Anything that was ahead is dropped: picking a track by hand is a new branch,
 * and a "forward" that led somewhere unrelated to what is playing would be
 * worse than none.
 */
export function rememberPlayed({ played = [], position = -1, trackId, limit = MAX_REMEMBERED } = {}) {
  const path = Array.isArray(played) ? played : [];
  const at = Number.isInteger(position) ? position : -1;
  if (!trackId) return { played: path, position: at };

  // Already standing on it — pressing play on the track that is playing should
  // not make the path longer.
  if (path[at] === trackId) return { played: path, position: at };

  return append({ played: path, position: at, trackId, limit });
}

function append({ played, position, trackId, limit }) {
  const kept = played.slice(0, Math.max(0, position + 1));
  kept.push(trackId);

  const overflow = Math.max(0, kept.length - Math.max(1, limit));
  const trimmed = overflow ? kept.slice(overflow) : kept;

  return { trackId, played: trimmed, position: trimmed.length - 1 };
}

/** Whether there is anything behind the current position to go back to. */
export function canGoBack({ position = -1 } = {}) {
  return Number.isInteger(position) && position > 0;
}
