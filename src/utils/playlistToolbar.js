/**
 * What the playlist toolbar shows when there is no room for all of it.
 *
 * ## What was asked for
 *
 * "I want to improve playlist mode … the UI for mobile because there's too
 * much button taking too much space. The playlist names create a scroll which
 * we don't want."
 *
 * Measured on a 375×812 phone before this existed: the toolbar was 181px — nine
 * buttons and a search box wrapping onto four rows — and the playlist panel
 * below it took another 249px because it was pinned to 30vh whether it held ten
 * playlists or one. That is 430px of furniture on an 812px screen, and the
 * music itself got 335px.
 *
 * ## The split
 *
 * Four things are worth a button on a phone: adding music, playing the list,
 * shuffling it, and picking tracks. They are what someone opens the mode to do,
 * and they are the four that are painful to reach through a menu because they
 * are used constantly.
 *
 * Making a playlist goes next to the playlists, as a `＋` at the end of the row
 * of names — that is where someone looks for it, and it costs nothing there.
 *
 * The rest — re-reading tags, export, import — are things done occasionally and
 * deliberately. They go behind one button. None of them is removed; a toolbar
 * that quietly drops an action is worse than a crowded one.
 *
 * Two of them stay behind that button at every width: removing duplicates and
 * cleaning up after a failed import. They are housekeeping — used once in a
 * while, never in a hurry — and a wide window is not a reason to spend a button
 * on them. It is also what keeps the bar on one line on a laptop, which is the
 * same complaint as the phone's with more room to hide it.
 *
 * ## Why this is a module
 *
 * It is a rule somebody asked for, so it has to be able to say so — see
 * CLAUDE.md. Inside the component it would be a `{#if compact}` that anybody
 * could tidy away while rearranging the markup, with nothing to fail. The tests
 * next to this file are written in the words of the request.
 */

/**
 * Every action the toolbar can offer, in the order it offers them.
 *
 * The list is here rather than in the markup so a test can assert that the
 * compact layout loses none of them. Adding one to the component without adding
 * it here fails that test, which is the point.
 */
export const PLAYLIST_ACTIONS = [
  'add',
  'newPlaylist',
  'play',
  'shuffle',
  'select',
  'scan',
  'export',
  'import',
  'dedupe',
  'cleanUp'
];

/**
 * The four that stay on the bar when space is short, in bar order.
 */
export const COMPACT_BAR = ['add', 'play', 'shuffle', 'select'];

/**
 * Housekeeping: behind the overflow button however much room there is.
 */
export const ALWAYS_MENU = ['dedupe', 'cleanUp'];

/**
 * Below this width the toolbar collapses.
 *
 * It is about the toolbar only. The body going to one column and the playlists
 * going to a single row happen in CSS at a wider breakpoint, because those are
 * a change of shape rather than a change of what exists.
 */
export const COMPACT_WIDTH = 720;

/** Whether the window is narrow enough to collapse the toolbar. */
export function isCompactToolbar({ width } = {}) {
  // A width nobody supplied is not a narrow window. `Number(null)` is 0, which
  // is narrower than any phone, so the type is checked rather than coerced.
  if (typeof width !== 'number' || !Number.isFinite(width)) return false;
  return width <= COMPACT_WIDTH;
}

/**
 * Where each action goes.
 *
 * `bar` is on the toolbar, `strip` is with the playlist names, `menu` is behind
 * the overflow button. Every action is in exactly one of them, always.
 */
export function toolbarLayout({ compact = false } = {}) {
  if (!compact) {
    return {
      bar: PLAYLIST_ACTIONS.filter((id) => !ALWAYS_MENU.includes(id)),
      strip: [],
      menu: [...ALWAYS_MENU]
    };
  }

  return {
    bar: [...COMPACT_BAR],
    strip: ['newPlaylist'],
    menu: PLAYLIST_ACTIONS.filter(
      (id) => !COMPACT_BAR.includes(id) && id !== 'newPlaylist'
    )
  };
}
