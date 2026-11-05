/**
 * Which of a folder's mode settings the Undo button reaches.
 *
 * ## What was asked for
 *
 * 2026-10-26, on deleting a habit: "the undo button already exists. It's just
 * not linked to our already working snapshot thing. So it should just be
 * linked instead of rewritten." The history in App.svelte (pushHistory, undo,
 * redo) held the blocks and their order and nothing else, so a habit, which
 * lives in the folder's mode settings, could be deleted and not brought back.
 * This adds what Undo should see to that same history, rather than a second
 * undo beside it.
 *
 * ## Content, not preferences
 *
 * What goes in is what somebody *made*: the habits. What stays out is how
 * the folder is shown -- the wallpaper, its sliders, column counts, which way
 * Task mode adds. Those change by the dozen while a slider is dragged, and an
 * Undo meant for a deleted note should not also put the wallpaper back. The
 * wallpaper's pictures are megabytes besides, and every history entry is a
 * full copy.
 *
 * ## Why this is safe to restore
 *
 * The history is only ever a true record if everything it holds is pushed
 * when it changes. Habits are pushed from handleModeSettingChange, the one
 * place they change while a folder is open; every other place that replaces
 * the mode settings (opening a folder, a download, a new folder) clears the
 * history at the same time. An entry written by a build before this has no
 * habits in it, and is left alone rather than read as "no habits".
 */

import { normalizeHabits, habitsEqual } from './habitStore.js';
import { normalizePageRows, samePage } from './pageLayout.js';

/**
 * What of the mode settings goes into a history entry: the habits, and which
 * blocks a page shows (2026-11-04) -- putting a block on a page or taking it
 * off is something made, and Undo puts it back.
 */
export function settingsForHistory(modeSettings) {
  return {
    habits: normalizeHabits(modeSettings?.habit?.habits),
    page: normalizePageRows(modeSettings?.page?.rows)
  };
}

/**
 * The mode settings as a history entry left them -- or the same object, when
 * the entry says nothing about them or they already match.
 */
export function settingsFromHistory(modeSettings, entry) {
  const saved = entry?.settings;
  if (!saved) return modeSettings;
  let next = modeSettings;
  if (Array.isArray(saved.habits) && !habitsEqual(modeSettings?.habit?.habits, saved.habits)) {
    next = { ...next, habit: { ...(next?.habit || {}), habits: normalizeHabits(saved.habits) } };
  }
  // An entry from before pages were in the history says nothing of them, and
  // is not read as "an empty page".
  if (Array.isArray(saved.page) && !samePage(modeSettings?.page?.rows, saved.page)) {
    next = { ...next, page: { ...(next?.page || {}), rows: normalizePageRows(saved.page) } };
  }
  return next;
}
