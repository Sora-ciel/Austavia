/**
 * What a music block is pointed at, and where "next" goes.
 *
 * A block stores a playlist id and nothing else about the music — no track
 * list, no order, no copy of a title. The library is the single record of what
 * exists, and the block is a view onto it, so a track renamed or removed in
 * Playlist mode is renamed or removed here without anything having to be told.
 *
 * That means every lookup here can fail, and the failures are the point: a
 * playlist deleted while a block still names it, a playlist holding the id of a
 * track that is no longer in the library, an empty library, a block pointed at
 * nothing at all. Each has an answer that is better than a crash and better
 * than a guess.
 */

/** A block with no playlist chosen plays everything. */
export const ALL_MUSIC = '';

const tracksOf = (library) => (Array.isArray(library?.tracks) ? library.tracks : []);
const playlistsOf = (library) => (Array.isArray(library?.playlists) ? library.playlists : []);

export function findPlaylist(library, playlistId) {
  if (!playlistId) return null;
  return playlistsOf(library).find((p) => p?.id === playlistId) || null;
}

/**
 * The tracks a block should show, in the order it should show them.
 *
 * `missing` is true only when the block names a playlist that is not there any
 * more. It is reported rather than smoothed over, because the two silent
 * alternatives are both worse: falling back to the whole library turns a
 * deleted playlist into every song you own, and returning an empty list with no
 * explanation looks like the block is broken.
 *
 * A playlist naming a track the library no longer holds simply skips it. That
 * one is not worth reporting — the track is gone, the playlist is still itself.
 */
export function resolveQueue(library, playlistId) {
  const tracks = tracksOf(library);

  if (!playlistId) return { tracks, missing: false };

  const playlist = findPlaylist(library, playlistId);
  if (!playlist) return { tracks: [], missing: true };

  const byId = new Map(tracks.map((t) => [t.id, t]));
  const ids = Array.isArray(playlist.trackIds) ? playlist.trackIds : [];
  return { tracks: ids.map((id) => byId.get(id)).filter(Boolean), missing: false };
}

/** What to call this block: the playlist's name, or the library itself. */
export function playlistLabel(library, playlistId, { allLabel = 'All music' } = {}) {
  if (!playlistId) return allLabel;
  const playlist = findPlaylist(library, playlistId);
  return playlist?.name || 'Missing playlist';
}

/**
 * The track one step from the current one, wrapping at both ends.
 *
 * When the playing track is not in this block's queue — another block or
 * Playlist mode started something else — stepping forward starts this queue
 * from its top rather than doing nothing. Pressing next on a block that is not
 * playing should start it playing, which is what someone pressing it means.
 */
export function stepTrack(queue, currentId, delta) {
  if (!Array.isArray(queue) || queue.length === 0) return null;

  const index = queue.findIndex((t) => t?.id === currentId);
  if (index === -1) return delta < 0 ? queue[queue.length - 1] : queue[0];

  const next = (index + delta + queue.length) % queue.length;
  return queue[next];
}

/**
 * Whether this block is the one playing.
 *
 * There is one audio element for the whole app, so several blocks and Playlist
 * mode can all be pointed at the same track. A block shows itself as playing
 * only when the track playing is one of its own — otherwise every block on the
 * canvas would light up at once.
 */
export function isQueuePlaying(queue, nowPlayingId, isPlaying) {
  if (!isPlaying || !nowPlayingId) return false;
  return (queue || []).some((t) => t?.id === nowPlayingId);
}

/**
 * The tracks that "next" walks through, when something is played from a list.
 *
 * ## What was asked for
 *
 * "Make it so that even if you search a music, the music your autoplay chooses
 * on are still the playlist you are in[']s pool. Because if not, then you can
 * end up with only one music going in loop, and so far this is not our aim."
 *
 * Playing a track handed the queue whatever was *listed* — and a search filters
 * the listing. So searching for a song and playing it left a queue of one, and
 * the player looped that song for ever. The narrower the search, the worse:
 * finding exactly what you wanted was the surest way to hear nothing else.
 *
 * A search narrows what you can *see*. It was never meant to narrow what plays.
 * So the pool is the playlist you are in — or the whole library, when that is
 * what you are looking at — whatever the search box says.
 *
 * Choosing several tracks by hand is the exception, and stays as it is: a
 * selection is a pool somebody built on purpose, not a view of a larger one.
 *
 * `chosen` is put at the front if it somehow is not in the pool at all, so that
 * pressing play on a track always plays *that* track. Nothing should produce
 * that today; it costs one comparison to make it impossible tomorrow.
 */
export function playbackPool({ pool = [], chosen = null } = {}) {
  const tracks = (Array.isArray(pool) ? pool : []).filter(Boolean);
  if (!chosen) return tracks;
  return tracks.some((t) => t?.id === chosen.id) ? tracks : [chosen, ...tracks];
}

/**
 * Which playlist to open on, given what was remembered.
 *
 * ## What was asked for
 *
 * "Keep in memory the last music you listened to, so that when you go back it's
 * actually the music you listened to and not another one."
 *
 * Playlist mode opened on "All music" every single time, whatever you had been
 * listening to, so going back and pressing play started something else.
 *
 * `null` means All music, which is both a real choice somebody can make and the
 * answer when what was remembered is gone. A playlist deleted on this device or
 * another must not leave the mode pointing at nothing — the same rule the
 * remembered note follows, for the same reason.
 */
export function openingPlaylist(library, rememberedId) {
  if (!rememberedId) return null;
  return findPlaylist(library, rememberedId) ? rememberedId : null;
}
