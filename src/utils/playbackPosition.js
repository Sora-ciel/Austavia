/**
 * What the notification is told about where the track is up to.
 *
 * ## Why there was no progress bar
 *
 * The media session reported `PLAYBACK_POSITION_UNKNOWN`, so Android's own
 * media player — the one in the shade and on the lock screen — had nothing to
 * draw and nothing to scrub. Everything else about the notification was right;
 * this one constant is why it looked less finished than other music players.
 *
 * ## Why this is not sent continuously
 *
 * Android does not want a position every frame, and sending one would be worse
 * than useless. A playback state carries a position *and a speed*, stamped with
 * the moment it was set, and the system works out where the track is now from
 * those three. So it is sent when something changes — a track starts, playback
 * pauses or resumes, somebody seeks — and the bar moves on its own in between.
 *
 * That is also why the speed matters more than it looks. Reporting 1× while
 * paused leaves the system extrapolating forward from a track that is not
 * moving, so the bar keeps creeping and then jumps back the moment anything
 * refreshes it. Paused is 0×.
 *
 * ## Duration is not a number, at first
 *
 * `audioEl.duration` is `NaN` until the browser has read the file's metadata,
 * and a track loaded from disk spends a moment there every single time. A `NaN`
 * sent onward becomes a nonsense length in the shade, so the honest answer
 * while it is unknown is to say nothing about it and let the notification keep
 * showing what it had.
 */

/** Seconds as whole milliseconds, or null when the number is not usable. */
function millisecondsFrom(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 1000);
}

/**
 * What to tell the notification about the position, or `null` when there is
 * nothing worth saying.
 *
 * A position with no duration is still worth sending: the bar needs a length to
 * be drawn, but the lock screen shows an elapsed time either way, and a track
 * whose metadata has not landed yet will get its duration on the next update.
 */
export function positionReport({ position, duration, playing = false } = {}) {
  const positionMs = millisecondsFrom(position);
  if (positionMs === null) return null;

  const durationMs = millisecondsFrom(duration);
  // A duration of zero is what a stream reports, and it is not a length.
  const length = durationMs && durationMs > 0 ? durationMs : null;

  return {
    // Never past the end. A file whose metadata disagrees with its decoder can
    // report a position a fraction beyond its own duration, and the bar then
    // draws slightly over the end of its track.
    positionMs: length === null ? positionMs : Math.min(positionMs, length),
    durationMs: length,
    // The speed the system should extrapolate at. See the note above: this is
    // the difference between a bar that stops when the music stops and one that
    // keeps creeping forward over a paused track.
    speed: playing ? 1 : 0
  };
}

/**
 * Whether a fresh report is worth sending for a position change alone.
 *
 * `timeupdate` fires several times a second and almost all of it says what the
 * system already worked out for itself. The comparison is therefore **not**
 * against the position last sent — it is against where Android will have
 * carried that position to by now. Comparing against the raw last value would
 * fire once a second for ever, on a track that was playing perfectly, which is
 * the cost this exists to avoid.
 *
 * What is left over after the extrapolation is real disagreement: a seek, a
 * track change, or a stall that left the audio behind where the shade thinks it
 * is. A second is comfortably more than the jitter of ordinary playback and
 * comfortably less than the smallest seek anybody makes on purpose.
 *
 * This is the recompute-from-scratch pass that CLAUDE.md asks for. The
 * discrete events — a seek, a new track — are the fast path; this is what makes
 * the bar eventually true when one of them does not arrive.
 */
export const DRIFT_TOLERANCE_MS = 1000;

export function worthReporting({
  positionMs,
  lastReportedMs,
  lastReportedAt,
  now,
  playing = false
} = {}) {
  if (!Number.isFinite(positionMs)) return false;
  if (!Number.isFinite(lastReportedMs)) return true;

  // Where the shade believes the track is, which is what has to be argued with.
  let expected = lastReportedMs;
  if (playing && Number.isFinite(lastReportedAt) && Number.isFinite(now)) {
    expected += Math.max(0, now - lastReportedAt);
  }

  // Paused, nothing is extrapolating, so any real move is news.
  const tolerance = playing ? DRIFT_TOLERANCE_MS : 0;
  return Math.abs(positionMs - expected) > tolerance;
}

/** A seek from the notification, back in the seconds an audio element wants. */
export function seekTarget(positionMs) {
  const value = Number(positionMs);
  if (!Number.isFinite(value) || value < 0) return null;
  return value / 1000;
}
