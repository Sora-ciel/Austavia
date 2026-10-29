/**
 * The order the music is listed in, and the one chosen on this device.
 *
 * ## What was asked for
 *
 * 2026-10-28: "a way to list the music, by the creation date, the newer
 * first. And it would be the default way to list the music. And you would be
 * able to change it to another way to order the list. The one chosen is saved
 * by device." And, asked which date: "no, we want the file's own date" -- the
 * music file's `lastModified`, kept on each track as `fileDate`.
 *
 * ## Tracks with no date yet
 *
 * A track records its file's date from now on (the import), and the tracks
 * already there are given theirs from their stored file on any device that has
 * the audio (`withFileDates`). Until a track has one, it goes after every
 * dated track: newest-first lists those by the newest added (the library is
 * kept in the order things were added), oldest-first by the oldest added.
 *
 * The order is used for the list and for what plays next, so pressing play
 * plays what is on screen in the order it is shown.
 */

export const TRACK_ORDERS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'title', label: 'Title' },
  { id: 'artist', label: 'Artist' },
  { id: 'album', label: 'Album' },
  { id: 'length', label: 'Length' }
];

export const DEFAULT_TRACK_ORDER = 'newest';
export const TRACK_ORDER_KEY = 'austavia.playlist.order';

const known = id => TRACK_ORDERS.some(order => order.id === id);

const dateOf = track => {
  const value = Number(track?.fileDate);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const text = value => String(value ?? '').trim().toLocaleLowerCase();
const byText = field => (a, b) => {
  const x = text(a.track[field]);
  const y = text(b.track[field]);
  // Empty last, whatever the order.
  if (!x !== !y) return x ? -1 : 1;
  return x.localeCompare(y, undefined, { numeric: true }) || a.index - b.index;
};

/** The tracks in the chosen order; a new list, the given one untouched. */
export function sortTracks(tracks = [], orderId = DEFAULT_TRACK_ORDER) {
  const order = known(orderId) ? orderId : DEFAULT_TRACK_ORDER;
  const entries = (tracks || []).map((track, index) => ({ track, index }));
  if (order === 'newest' || order === 'oldest') {
    const newest = order === 'newest';
    entries.sort((a, b) => {
      const x = dateOf(a.track);
      const y = dateOf(b.track);
      if (x !== null && y !== null && x !== y) return newest ? y - x : x - y;
      if ((x === null) !== (y === null)) return x === null ? 1 : -1;
      return newest ? b.index - a.index : a.index - b.index;
    });
  } else if (order === 'length') {
    entries.sort((a, b) => (Number(a.track.durationSeconds) || Infinity) - (Number(b.track.durationSeconds) || Infinity) || a.index - b.index);
  } else {
    entries.sort(byText(order));
  }
  return entries.map(entry => entry.track);
}

/** The order chosen on this device, or the default. */
export function readTrackOrder(storage) {
  try {
    const value = storage?.getItem(TRACK_ORDER_KEY);
    return known(value) ? value : DEFAULT_TRACK_ORDER;
  } catch {
    return DEFAULT_TRACK_ORDER;
  }
}

export function writeTrackOrder(storage, orderId) {
  if (!known(orderId)) return;
  try {
    storage?.setItem(TRACK_ORDER_KEY, orderId);
  } catch {
    // Not remembered: the next visit opens on the default.
  }
}

/**
 * The library with `fileDate` filled in for tracks that lack one, from
 * `dates` (track id -> the stored file's lastModified). The same list back
 * when nothing is new, so the caller's save is skipped. Absolute and
 * repeatable: it only ever fills a gap, from the file itself.
 */
export function withFileDates(tracks = [], dates = new Map()) {
  let changed = false;
  const next = (tracks || []).map(track => {
    if (dateOf(track) !== null) return track;
    const date = Number(dates.get(track?.id));
    if (!Number.isFinite(date) || date <= 0) return track;
    changed = true;
    return { ...track, fileDate: date };
  });
  return changed ? next : tracks;
}
