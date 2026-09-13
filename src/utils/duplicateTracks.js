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

/** Clusters that really are the same file, byte for byte. */
export const IDENTICAL = 'identical';
/** Clusters that only share a name — the wider net, off unless asked for. */
export const SAME_NAME = 'sameName';

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
export function chooseSurvivor(
  ids = [],
  { tracks = [], playlists = [], playingId = null, sizes = null, preferLargest = false } = {}
) {
  if (playingId && (ids || []).includes(playingId)) return playingId;

  const sizeOf = (id) => {
    if (!sizes) return 0;
    const value = sizes instanceof Map ? sizes.get(id) : sizes[id];
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  };

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
      // For a group that only shares a name, the biggest file is the whole
      // point: at the same length, more bytes is more of the recording.
      if (preferLargest) {
        const bySize = sizeOf(b) - sizeOf(a);
        if (bySize) return bySize;
      }

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
/**
 * Clusters, however they were handed over, as `{ ids, rule }` with nothing
 * appearing in two of them.
 *
 * Overlap is not a hypothetical: two files that are byte-identical also share a
 * name, so the same pair arrives from both passes. Left alone that produces two
 * answers about which copy stays — and a replacement map where the copy that
 * stays is itself deleted. Merging anything that touches into one group means
 * the question is asked once. A group made of both kinds is the wider rule,
 * since that rule already covers the narrower one.
 */
function mergeClusters(clusters = []) {
  const merged = [];

  for (const raw of clusters || []) {
    const ids = Array.isArray(raw) ? raw : raw?.ids;
    if (!Array.isArray(ids) || ids.length < 2) continue;
    const rule = Array.isArray(raw) ? IDENTICAL : raw?.rule || IDENTICAL;

    const overlapping = merged.filter((group) => ids.some((id) => group.ids.has(id)));
    const group = overlapping[0] || { ids: new Set(), rule: IDENTICAL };

    for (const other of overlapping.slice(1)) {
      for (const id of other.ids) group.ids.add(id);
      if (other.rule === SAME_NAME) group.rule = SAME_NAME;
      merged.splice(merged.indexOf(other), 1);
    }

    for (const id of ids) group.ids.add(id);
    if (rule === SAME_NAME) group.rule = SAME_NAME;
    if (!overlapping.length) merged.push(group);
  }

  return merged.map((group) => ({ ids: [...group.ids], rule: group.rule }));
}

export function planDeduplication(
  library = {},
  clusters = [],
  { playingId = null, sizes = null } = {}
) {
  const tracks = Array.isArray(library?.tracks) ? library.tracks : [];
  const playlists = Array.isArray(library?.playlists) ? library.playlists : [];

  /** every clone -> the copy that stays */
  const replacement = new Map();
  let identicalCount = 0;
  let sameNameCount = 0;

  for (const cluster of mergeClusters(clusters)) {
    const survivor = chooseSurvivor(cluster.ids, {
      tracks,
      playlists,
      playingId,
      sizes,
      preferLargest: cluster.rule === SAME_NAME
    });
    if (!survivor) continue;

    for (const id of cluster.ids) {
      if (id === survivor) continue;
      replacement.set(id, survivor);
      if (cluster.rule === SAME_NAME) sameNameCount += 1;
      else identicalCount += 1;
    }
  }

  if (!replacement.size) {
    return {
      tracks,
      playlists,
      removedIds: [],
      removedCount: 0,
      identicalCount: 0,
      sameNameCount: 0,
      changed: false
    };
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
    identicalCount,
    sameNameCount,
    changed: true
  };
}

/**
 * ## The wider net: the same song saved twice at different quality
 *
 * Asked for: "a wider thing that we can check or not, to delete the not
 * exactly duplicates. Basically if they have the exact same name, then delete
 * the one with the least amount of bytes — to remove the lesser quality
 * duplicate when the music is supposed to be the same. Put it as a check that
 * is unchecked by default that says clearly what it does."
 *
 * This is a different promise from the one above and it is worth being plain
 * about the difference. The exact-copy pass can say *this is the same file*;
 * this one can only say *these are called the same thing*. It deletes music
 * that is not identical, on the strength of a name, and the bigger file is kept
 * because at equal length more bytes is more of the recording. That is a guess,
 * a good one for a library where the same album got imported twice at two
 * bitrates and a bad one for anybody who names things loosely. Which is why it
 * is off until somebody turns it on.
 *
 * Two things narrow it, both for the same reason — the cost of being wrong here
 * is somebody's music:
 *
 * - **A group with two different artists in it is left alone.** Two songs
 *   called "Intro" by two bands are two songs, and the artist saying so is
 *   evidence. A missing artist is not evidence either way, so it does not
 *   split a group; two artists that disagree do, and then the whole group is
 *   declined rather than guessed at.
 * - **The name is compared after trimming and without case.** "Song" and
 *   "song " are the same name to a person, and this has to match what a person
 *   means by it.
 */

/** The name two tracks have to share, or null when there is nothing to compare. */
export function comparableName(track) {
  const raw = track?.title ?? track?.fileName ?? '';
  const name = String(raw).trim().toLowerCase();
  return name || null;
}

function comparableArtist(track) {
  const artist = String(track?.artist ?? '').trim().toLowerCase();
  return artist || null;
}

/**
 * Groups of tracks that share a name, and are not contradicted by their artist.
 *
 * `tracks` are library records. Returns clusters in the shape planDeduplication
 * takes, tagged so it knows to keep the biggest file rather than the
 * best-labelled one.
 */
export function sameNameClusters(tracks = []) {
  const byName = new Map();

  for (const track of tracks || []) {
    if (!track?.id) continue;
    const name = comparableName(track);
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(track);
  }

  const clusters = [];
  for (const group of byName.values()) {
    if (group.length < 2) continue;

    const artists = new Set(group.map(comparableArtist).filter(Boolean));
    if (artists.size > 1) continue; // two names that disagree; not ours to decide

    clusters.push({ ids: group.map((track) => track.id), rule: SAME_NAME });
  }

  return clusters;
}
