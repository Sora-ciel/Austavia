/**
 * Music in and out of the app as a zip: the audio, its cover art, and the
 * library -- titles, artists, playlists.
 *
 * ## What was asked for
 *
 * "Add the option to export and import our music from the playlist mode" --
 * 2026-10-06, into the app's Export and Import, beside the folders and themes.
 * Playlist mode already packed music this way, on its own button; this is
 * that packing, moved where both can use it, so a zip made by either opens in
 * either:
 *
 * - `library.json` -- `{ tracks, playlists }`, as the library holds them.
 * - `audio/<id>__<file name>` -- each track's audio, in its own container.
 * - `covers/<id>` -- its cover art, when it has one.
 * - `austavia-export.json` -- the folders and themes, when the export from
 *   the toolbar carries music too. A zip without it is music only.
 *
 * Audio is never in the cloud (see storage.js), so a file is the only way it
 * moves between devices.
 *
 * The zip itself is passed in -- a JSZip, or anything with the same `file()`
 * -- along with the reads and writes, so the deciding here runs without a
 * browser.
 */
import { extensionOf } from './audioTags.js';

export const MUSIC_MANIFEST = 'library.json';
export const FOLDERS_ENTRY = 'austavia-export.json';

/**
 * The name a track's audio is stored under. Its real container extension is
 * kept -- defaulting everything to .mp3 renamed flac and m4a files on the way
 * out and broke them on import.
 */
export function archiveFileName(track) {
  const extension = extensionOf(track?.fileName) || 'mp3';
  return track?.fileName || `${track?.title || track?.id}.${extension}`;
}

/** How much music a library holds, as the dialogs say it. */
export function describeMusic(library) {
  const tracks = Array.isArray(library?.tracks) ? library.tracks.length : 0;
  const playlists = Array.isArray(library?.playlists) ? library.playlists.length : 0;
  const parts = [`${tracks} ${tracks === 1 ? 'track' : 'tracks'}`];
  if (playlists) parts.push(`${playlists} ${playlists === 1 ? 'playlist' : 'playlists'}`);
  return parts.join(', ');
}

/**
 * The library after an import: tracks and playlists from the file added, and
 * one with the same id as one already here taken from the file -- the same
 * track, brought over again.
 */
export function mergeMusicLibrary(current, incoming, importedTrackIds = null) {
  const keep = importedTrackIds ? new Set(importedTrackIds) : null;
  const tracks = new Map((current?.tracks || []).map(track => [track.id, track]));
  for (const track of incoming?.tracks || []) {
    if (!track?.id || (keep && !keep.has(track.id))) continue;
    tracks.set(track.id, { ...(tracks.get(track.id) || {}), ...track });
  }
  const playlists = new Map((current?.playlists || []).map(playlist => [playlist.id, playlist]));
  for (const playlist of incoming?.playlists || []) {
    if (playlist?.id) playlists.set(playlist.id, playlist);
  }
  return { tracks: [...tracks.values()], playlists: [...playlists.values()] };
}

/** Puts a library's music into `zip`. Returns how many tracks went in. */
export async function packMusic(zip, library, { loadTrack, loadCover }) {
  const manifest = [];
  for (const track of library?.tracks || []) {
    const blob = await loadTrack(track.id);
    if (!blob) continue; // listed here, its audio on another device
    const fileName = archiveFileName(track);
    zip.file(`audio/${track.id}__${fileName}`, blob);
    const cover = loadCover ? await loadCover(track.id) : null;
    if (cover) zip.file(`covers/${track.id}`, cover);
    manifest.push({ ...track, fileName });
  }
  zip.file(MUSIC_MANIFEST, JSON.stringify({ tracks: manifest, playlists: library?.playlists || [] }, null, 2));
  return manifest.length;
}

/** The library a zip carries, or `null` when it carries no music. */
export async function readMusicManifest(zip) {
  const entry = zip.file(MUSIC_MANIFEST);
  if (!entry) return null;
  const data = JSON.parse(await entry.async('string'));
  return {
    tracks: Array.isArray(data?.tracks) ? data.tracks.filter(track => track?.id) : [],
    playlists: Array.isArray(data?.playlists) ? data.playlists.filter(playlist => playlist?.id) : []
  };
}

/**
 * Writes a zip's audio and covers to this device. Returns the ids of the
 * tracks whose audio was in it.
 */
export async function unpackMusic(zip, manifest, { saveTrack, saveCover, onTrack }) {
  const imported = [];
  for (const track of manifest?.tracks || []) {
    const entry = zip.file(new RegExp(`^audio/${escapeRegExp(track.id)}__`))[0];
    if (!entry) continue;
    await saveTrack(track.id, await entry.async('blob'));
    const cover = zip.file(`covers/${track.id}`);
    if (cover && saveCover) await saveCover(track.id, await cover.async('blob'));
    if (onTrack) onTrack(track.id);
    imported.push(track.id);
  }
  return imported;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
