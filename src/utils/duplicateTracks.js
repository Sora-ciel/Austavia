/**
 * Finding the same song stored twice, and deciding which copy goes.
 *
 * ## What was asked for
 *
 * "Then we'll add something to remove double of music. Basically if there's
 * one or more copy of a music, like the same exact file, then we can remove
 * the clones."
 *
 * The same exact file — so the test is the bytes, not the title. Two rips of
 * the same song at different bitrates are two files, and nobody asked for a
 * judgement call about which of those is worth keeping. Two imports of the same
 * folder are the case this is for, and there the bytes are identical.
 *
 * ## Size first, bytes second
 *
 * Reading every file to compare it is the obvious way and the wrong one: a
 * library is measured in gigabytes, and hashing all of it to discover that
 * nothing matches is minutes of work for an empty answer.
 *
 * Two identical files are identical in length, so anything whose length is
 * unique cannot be a duplicate of anything and never has to be read. In a
 * library with no duplicates that is the whole of it — the scan costs a
 * directory listing. Only files that share a length with another are read, and
 * only they are hashed.
 *
 * A shared length is not enough on its own, which is why the hash follows. Two
 * different songs of exactly the same byte length is unlikely but perfectly
 * possible, and deleting one of those is deleting music somebody has.
 *
 * ## What gets kept
 *
 * The copy being listened to always stays, whatever else is true of it —
 * deleting the file behind the audio that is playing stops the music, and a
 * tidy-up that stops the music is a worse trade than keeping the less
 * well-labelled copy.
 *
 * Otherwise, the copy that knows the most about itself. Tags are read after an
 * import, and one copy may have been scanned when another was not, so keeping
 * the richer record loses nothing and sometimes saves the artwork. Ties go to
 * the copy that is already in a playlist, and then to whichever was added
 * first — the original, as far as the library can tell.
 *
 * Playlists are repointed rather than cleaned up afterwards: a playlist holding
 * a copy that is about to go keeps the copy that stays, in the same place. A
 * playlist that happened to hold both ends up holding one, which is what it
 * meant.
 */

/**
 * Files that share their length with at least one other file.
 *
 * Everything else is unique by definition and is not worth reading. `entries`
 * is `[{ id, size }]`; the result is groups of ids, biggest group first, and
 * each group is worth hashing.
 */
export function sizeGroups(entries = []) {
  const bySize = new Map();

  for (const entry of entries || []) {
    if (!entry || !entry.id) continue;
    const size = Number(entry.size);
    if (!Number.isFinite(size) || size <= 0) continue;
    if (!bySize.has(size)) bySize.set(size, []);
    bySize.get(size).push(entry.id);
  }

  return [...bySize.values()]
    .filter((ids) => ids.length > 1)
    .sort((a, b) => b.length - a.length);
}

/**
 * The sets of ids that really are the same file.
 *
 * `entries` is `[{ id, size, hash }]` — whatever the caller managed to hash.
 * An entry with no hash is left out rather than guessed at: a file that could
 * not be read is not evidence of anything, and the one thing this must never do
 * is delete on a maybe.
 */
export function clustersFromHashes(entries = []) {
  const byFingerprint = new Map();

  for (const entry of entries || []) {
    if (!entry || !entry.id || !entry.hash) continue;
    const size = Number(entry.size);
    if (!Number.isFinite(size)) continue;
    const key = `${size}:${entry.hash}`;
    if (!byFingerprint.has(key)) byFingerprint.set(key, []);
    byFingerprint.get(key).push(entry.id);
  }

  return [...byFingerprint.values()].filter((ids) => ids.length > 1);
}

/** How much a record knows about itself, for choosing between copies. */
function metadataScore(track) {
  if (!track) return -1;
  const fields = ['title', 'artist', 'album', 'year', 'lyrics', 'duration'];
  return fields.reduce((score, field) => {
    const value = track[field];
    return score + (value === undefined || value === null || value === '' ? 0 : 1);
  }, 0);
}

/**
 * Which copy stays, out of a set that are all the same file.
 *
 * Exported because it is the part somebody will want to argue with, and an
 * argument is easier against something that can be called on its own.
 */
export function chooseSurvivor(ids = [], { tracks = [], playlists = [], playingId = null } = {}) {
  if (playingId && (ids || []).includes(playingId)) return playingId;

  const byId = new Map((tracks || []).map((track) => [track.id, track]));
  const order = new Map((tracks || []).map((track, index) => [track.id, index]));

  const inPlaylists = new Map();
  for (const playlist of playlists || []) {
    for (const id of playlist?.trackIds || []) {
      inPlaylists.set(id, (inPlaylists.get(id) || 0) + 1);
    }
  }

  const known = (ids || []).filter((id) => byId.has(id));
  const candidates = known.length ? known : [...(ids || [])];

  return candidates
    .slice()
    .sort((a, b) => {
      const byMetadata = metadataScore(byId.get(b)) - metadataScore(byId.get(a));
      if (byMetadata) return byMetadata;

      const byPlaylist = (inPlaylists.get(b) || 0) - (inPlaylists.get(a) || 0);
      if (byPlaylist) return byPlaylist;

      const byAge = (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity);
      if (byAge) return byAge;

      return String(a).localeCompare(String(b));
    })[0];
}

/**
 * The library with the clones taken out, and the ids whose audio to delete.
 *
 * Nothing is written here and nothing is deleted here — this works out what
 * should be true and hands it back, so it can be run against a library in a
 * test without a store, and run twice without doing anything the second time.
 */
export function planDeduplication(library = {}, clusters = [], { playingId = null } = {}) {
  const tracks = Array.isArray(library?.tracks) ? library.tracks : [];
  const playlists = Array.isArray(library?.playlists) ? library.playlists : [];

  /** every clone -> the copy that stays */
  const replacement = new Map();
  for (const cluster of clusters || []) {
    if (!Array.isArray(cluster) || cluster.length < 2) continue;
    const survivor = chooseSurvivor(cluster, { tracks, playlists, playingId });
    if (!survivor) continue;
    for (const id of cluster) if (id !== survivor) replacement.set(id, survivor);
  }

  if (!replacement.size) {
    return { tracks, playlists, removedIds: [], removedCount: 0, changed: false };
  }

  const keptTracks = tracks.filter((track) => !replacement.has(track?.id));

  const keptPlaylists = playlists.map((playlist) => {
    const ids = playlist?.trackIds || [];
    const seen = new Set();
    const repointed = [];

    for (const id of ids) {
      const kept = replacement.get(id) || id;
      if (seen.has(kept)) continue; // it already holds the copy that stays
      seen.add(kept);
      repointed.push(kept);
    }

    const unchanged =
      repointed.length === ids.length && repointed.every((id, i) => id === ids[i]);
    return unchanged ? playlist : { ...playlist, trackIds: repointed };
  });

  return {
    tracks: keptTracks,
    playlists: keptPlaylists,
    removedIds: [...replacement.keys()],
    removedCount: replacement.size,
    changed: true
  };
}
