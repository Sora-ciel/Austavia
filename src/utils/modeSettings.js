/**
 * A folder's mode settings: what each mode keeps with the folder, and the
 * one place they are cleaned up on the way in and out.
 *
 * Moved out of App.svelte on 2026-10-26 so a test can reach it, when it
 * turned out to delete whatever it did not know. It rebuilt the settings from
 * its own list of modes and fields, so a newer build's settings -- a new mode,
 * a new field in the playlist or the habit list -- were dropped by any device
 * a version behind, at its next save. Asked the same day: "make something so
 * that new details are still kept even though a certain version doesn't know
 * what it means yet." So each level now adds back what it does not know
 * (utils/keepUnknown.js).
 *
 * Normalised on the way in as well as out, so a folder written by an older
 * build, a newer one, or by hand is the same shape by the time anything reads
 * it -- and so a round trip through the cloud is byte-identical and does not
 * read as an edit.
 */

import { BACKGROUND_DEFAULTS, normalizeBackgroundSettings, carryNotePictureSettings } from './modeBackground.js';
import { normalizeHabits } from './habitStore.js';
import { withUnknown } from './keepUnknown.js';
import { normalizePageSettings } from './pageLayout.js';

export const DEFAULT_MODE_SETTINGS = {
  simple: {
    columnCount: 2
  },
  task: {
    addDirection: 'above'
  },
  // When on, every block is repainted in the active theme's colours; each
  // block keeps its own colours stashed so switching back restores them.
  blocksFollowTheme: false,
  // Track metadata and playlists sync with the folder; the audio itself
  // stays on each device (see storage.js) and moves via export/import.
  playlist: { tracks: [], playlists: [] },
  // Asked for on 2026-09-26: one habit list per folder, shared between
  // devices. It lives here rather than behind its own sync because here it
  // already is one -- see utils/habitStore.js.
  habit: { habits: [] },
  // Page mode (2026-11-04): which of the folder's blocks the page shows, in
  // order -- see utils/pageLayout.js.
  page: { rows: [] },
  // The folder's one wallpaper, drawn by every mode, under
  // Canvas mode's own id -- see hasWallpaper in modeRegistry.js. Single Note
  // had one of its own under `single`; it is no longer kept at all, so a
  // folder that still carries one loses it on its next save.
  default: { ...BACKGROUND_DEFAULTS }
};

/**
 * Settings this build reads. `single` is in the list so that it is *not* kept:
 * asked on 2026-09-27 for Single Note's old wallpaper to be "actually deleted",
 * so it is dropped here and gone at the next save -- a decision, unlike the
 * accidental dropping this file now prevents.
 */
const KNOWN = ['simple', 'task', 'blocksFollowTheme', 'playlist', 'habit', 'page', 'default', 'single'];

export function normalizeModeSettings(settings, { keepImage = value => value } = {}) {
  const incomingSimple = settings?.simple || {};
  const incomingTask = settings?.task || {};
  const incomingPlaylist = settings?.playlist || {};
  const incomingHabit = settings?.habit || {};
  return withUnknown({
    ...DEFAULT_MODE_SETTINGS,
    simple: {
      ...DEFAULT_MODE_SETTINGS.simple,
      ...incomingSimple,
      columnCount: Math.max(1, Number.parseInt(incomingSimple.columnCount, 10) || DEFAULT_MODE_SETTINGS.simple.columnCount)
    },
    task: {
      ...DEFAULT_MODE_SETTINGS.task,
      ...incomingTask,
      addDirection: incomingTask.addDirection === 'below' ? 'below' : 'above'
    },
    blocksFollowTheme: settings?.blocksFollowTheme === true,
    playlist: withUnknown({
      tracks: Array.isArray(incomingPlaylist.tracks) ? incomingPlaylist.tracks : [],
      playlists: Array.isArray(incomingPlaylist.playlists) ? incomingPlaylist.playlists : []
    }, incomingPlaylist, ['tracks', 'playlists']),
    habit: withUnknown({ habits: normalizeHabits(incomingHabit.habits) }, incomingHabit, ['habits']),
    page: normalizePageSettings(settings?.page),
    // The wallpaper goes through the shared normaliser, so the awkward parts
    // -- the pre-0.8.35 opacity stored as a 0-1 fraction, all the clamping --
    // are written once; it keeps what it does not know already. A theme's own
    // wallpaper is layered on at render time and must never reach a save, so
    // the caller says which stored pictures to keep (keepImage). The
    // note-picture dials are carried over from `single` first, so dropping it
    // takes only the old wallpaper -- see carryNotePictureSettings.
    default: normalizeBackgroundSettings(
      carryNotePictureSettings(settings?.default, settings?.single),
      { keepImage }
    )
  }, settings, KNOWN);
}
