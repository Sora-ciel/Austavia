/**
 * Which record describes what is playing.
 *
 * ## What was asked for
 *
 * "When importing, we should be able to have the player show. So far it shows
 * only after the importing is finished, but I can already start a music
 * before — so we need to make it so that even while still importing I can see
 * the player when I start a music."
 *
 * The audio was never the problem: a file is playable the moment it has been
 * copied in, which is seconds into an import. What was missing was the *record*
 * of it. An import commits to the library in batches so that a failure part-way
 * through does not throw away everything before it, which means a track can be
 * playing for a minute before the library has heard of it — and the player was
 * drawn from the library alone, so it had nothing to draw and drew nothing.
 *
 * ## Two places to look, in that order
 *
 * The library first. It is the record that lasts, and it is the one that gains
 * the title and the artwork when the tags are read, so once it has an entry
 * that entry is the answer.
 *
 * Then whatever travelled with the request to play. Playlist mode knows what it
 * is playing before the library does, so it hands those records over with the
 * play — only the ones the library is missing, which on any ordinary day is
 * none of them.
 *
 * And nothing, if neither has it. An id with no record anywhere is not a track
 * still being imported, it is a track that has gone — and a player showing
 * "Untitled" over music that has been deleted is worse than no player.
 */

/**
 * The track record for what is playing, or null if there is nothing to show.
 *
 * `handedOver` is whatever came with the request to play; an empty list is the
 * normal case.
 */
export function nowPlayingRecord(trackId, libraryTracks = [], handedOver = []) {
  if (!trackId) return null;

  const known = (libraryTracks || []).find((track) => track?.id === trackId);
  if (known) return known;

  return (handedOver || []).find((track) => track?.id === trackId) || null;
}

/** The fields worth carrying — enough to name the track, and nothing heavy. */
const CARRIED_FIELDS = ['id', 'title', 'artist', 'album', 'duration'];

/**
 * The records that have to travel with a play request.
 *
 * Only the ones the library does not have yet. Sending the whole queue would
 * copy thousands of objects on every press of play to solve a problem that
 * exists for about a minute after an import starts.
 */
export function tracksTheLibraryLacks(queueIds = [], tracks = [], libraryTracks = []) {
  const wanted = new Set(queueIds || []);
  const known = new Set((libraryTracks || []).map((track) => track?.id));

  return (tracks || [])
    .filter((track) => track?.id && wanted.has(track.id) && !known.has(track.id))
    .map((track) => {
      const carried = {};
      for (const field of CARRIED_FIELDS) {
        if (track[field] !== undefined) carried[field] = track[field];
      }
      return carried;
    });
}

/**
 * Everything this device can actually play right now.
 *
 * The store's own listing is the usual answer, and it is the right one — except
 * while an import is running. Asking what is stored opens a read against the
 * same store the import is writing to, so the answer queues behind a transaction
 * that is moving hundreds of megabytes, and arrives a chunk late. Meanwhile the
 * rows for the files already copied are on screen, marked as not on this
 * device, and refuse to play.
 *
 * A file this session has just written is on this device whatever the listing
 * has got round to saying. So the two are put together: what the store says,
 * plus what we know because we did it.
 */
export function playableIds(availableIds = [], justCopied = []) {
  const ids = new Set(availableIds || []);
  for (const track of justCopied || []) if (track?.id) ids.add(track.id);
  return ids;
}
