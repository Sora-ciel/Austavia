/**
 * Whether the playback notification should be on screen.
 *
 * ## What was asked for
 *
 * "When swiping the music out, it removes the music it was on in app. It
 * shouldn't remove, just stop in app."
 *
 * Swiping the notification away fired the same stop that the player's own Stop
 * button does, which clears the track: the id, the object URL, the resume
 * position, the expanded player. So a gesture that means "put this away" was
 * throwing away what you were listening to, and there was nothing to press play
 * on afterwards.
 *
 * Swiping away should pause and leave the track where it is.
 *
 * ## Why that needs a rule rather than a line
 *
 * Pausing is not enough on its own. The notification is shown from a reactive
 * statement that runs whenever the track or the play state changes — so
 * pausing, which changes the play state, immediately puts the notification back
 * up. The swipe would undo itself.
 *
 * So a dismissal has to be remembered, and then it has to end. Rather than a
 * flag that something has to remember to clear — the kind that goes stale and
 * leaves the notification gone for the rest of the session — the dismissal is
 * recorded **against the track it was made on**, and two ordinary things end it
 * without anybody clearing anything:
 *
 * - **Pressing play** asks for it back, and a playing track always shows.
 * - **Changing track** is a different thing to show, so the old dismissal no
 *   longer describes it.
 */

/**
 * Whether to show it.
 *
 * `dismissedFor` is the id of the track that was swiped away, or null. It only
 * silences that track, and only while it is paused.
 */
export function shouldShowNotification({
  hasTrack = false,
  playing = false,
  trackId = null,
  dismissedFor = null
} = {}) {
  if (!hasTrack) return false;
  if (playing) return true;
  // Paused, and this is the track that was put away.
  return !(dismissedFor !== null && dismissedFor === trackId);
}

/**
 * What to remember when the notification is swiped away.
 *
 * Null when there is nothing playing, so a stray dismissal cannot silence
 * whatever gets played next.
 */
export function dismissalFor(trackId) {
  return trackId == null ? null : trackId;
}
