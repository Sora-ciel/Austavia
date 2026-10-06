/**
 * What a theme is besides its panel and block colours.
 *
 * ## What was asked for
 *
 * "Our official themes aren't entirely redoable in the custom theme page. They
 * should be" -- 2026-10-06, after a copy of a see-through theme came out
 * different from the original: the list that opens from Modes had lost its
 * backing and floated invisibly over the wallpaper.
 *
 * A custom theme was three things: `controlColors`, `blockTheme`, `previewBg`.
 * The official ones had grown more, each added for a reason at the time and
 * none of them carried by a copy, by the editor, by an export or by sync:
 *
 * - `popupBg` -- what pop-ups, dialogs and that Modes list sit on. The
 *   see-through family's toolbar is clear, so without it a pop-up is clear too.
 * - `playerVeil` -- what the mini player lays over the cover art.
 * - `blockDefaults` -- the colours a new block is born in.
 * - `singleBackground` -- a wallpaper the theme brings, as Mr.Lee's do.
 * - `buddyIcons` -- Mr.Lee's characters in place of toolbar icons, which used
 *   to be decided by the theme's id and so could never follow a copy.
 *
 * They live here as one list so that everything which moves a theme -- the
 * copy, the editor, the export, the sync -- takes all of them, and a field
 * added later is added once.
 */

export const THEME_EXTRA_FIELDS = ['popupBg', 'playerVeil', 'blockDefaults', 'singleBackground', 'buddyIcons'];

function isSet(value) {
  if (value === undefined || value === null || value === '' || value === false) return false;
  if (typeof value === 'object') return Object.values(value).some(isSet);
  return true;
}

function cleaned(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (isSet(inner)) out[key] = inner;
    }
    return out;
  }
  return value;
}

/** The extras a theme sets, and only those -- an empty one is not set. */
export function extrasOf(theme) {
  const out = {};
  for (const field of THEME_EXTRA_FIELDS) {
    const value = theme?.[field];
    if (isSet(value)) out[field] = cleaned(value);
  }
  return out;
}

/**
 * `theme` with its extras replaced by `extras`: one cleared in the editor is
 * gone, rather than surviving from the version before.
 */
export function withExtras(theme, extras) {
  const out = { ...(theme || {}) };
  for (const field of THEME_EXTRA_FIELDS) delete out[field];
  return { ...out, ...extrasOf(extras) };
}

/**
 * Everything that makes a theme look the way it does: what a copy, an export
 * and the cloud must all hold for the theme to come back the same.
 */
export function lookOf(theme) {
  const out = {};
  for (const field of ['controlColors', 'blockTheme', 'previewBg']) {
    if (theme?.[field] !== undefined && theme?.[field] !== null) out[field] = theme[field];
  }
  return { ...out, ...extrasOf(theme) };
}
