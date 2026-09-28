/**
 * Outline: the theme that is nothing but writing, edges and shadows.
 *
 * ## What was asked for
 *
 * "Let's make a new base official theme that will be making invisible
 * everything but the text and the shadows or outlines." — 2026-09-27, while
 * putting a wallpaper behind Canvas mode. Every surface is see-through -- the
 * blocks, their headers, both panels and their buttons -- so a wallpaper shows
 * through all of it, and what is left to see is the writing, the lines around
 * things and the shadows under them.
 *
 * ## How "invisible" is said
 *
 * Block surfaces are faded with the theme's own opacity dials (bgOpacity,
 * headerOpacity) rather than given a transparent colour, because a block's
 * colour is also a colour picker's value and a picker has no alpha: the
 * colour stays a real one, and only the surface is faded out. The panels have
 * no dial, so theirs are eight-digit hex with a zero alpha, which the other
 * themes already use for their translucent panels.
 *
 * The writing carries a shadow of its own (textShadow), because white text on
 * whatever wallpaper somebody chooses is only readable if something separates
 * it from the picture -- and a shadow is one of the things this theme keeps.
 *
 * The canvas itself stays black: with no wallpaper it is what the outlines
 * are drawn on, and with one the wallpaper covers it.
 *
 * ## What is not see-through, and why
 *
 * Asked for the same day, once it had been tried: pop-ups -- dialogs, and the
 * panels a toolbar button opens -- "should have a black background with a
 * certain opacity, so it will always be easily readable above all images".
 * Writing that floats over a wallpaper is only readable if something is
 * between the two, and a panel is read, not looked through. So `popupBg` is
 * black at 78% -- tried at 72% first, and asked to be "around 78" once seen:
 * dark enough for white writing over the brightest picture, light enough
 * that the picture is still there behind it.
 *
 * The toolbar followed, the next day's ask: "make it so that controls
 * background is also a black at the same opacity" -- so the panels are the
 * backing at the same 78% (eight-digit hex, which is what a panel colour is),
 * and only their buttons stay see-through, drawn as outlines on it.
 *
 * Single Note's page is black for a related reason; that one is in
 * modeSurface.js, because it is true of every theme and not only this one.
 *
 * ## The template for any see-through theme
 *
 * Said the same day: "when we do other themes that are as invisible as
 * Outline, we'll take Outline's opacity etc. as the default template for
 * those." So the see-through part is not written into Outline -- it is
 * seeThroughPreset(), and Outline is its first use. A later theme in the same
 * family calls it with its own name and colours and starts from exactly these
 * opacities, shadows and backings; anything it wants different, it passes.
 */
import { normalizeBlockTheme } from './themeDefaults.js';

export const OUTLINE_THEME_ID = 'outline';

/** How opaque the backing under a pop-up is -- see above. */
export const POPUP_BACKING_OPACITY = 0.78;

/** An #rrggbb colour at an opacity, as eight-digit hex -- a panel colour's form. */
function hexWithAlpha(hex, alpha) {
  const value = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))?.[1] || '000000';
  return `#${value}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

/** An #rrggbb colour at an opacity, as rgba(). */
function withAlpha(hex, alpha) {
  const value = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))?.[1] || '000000';
  const [r, g, b] = [0, 2, 4].map(at => parseInt(value.slice(at, at + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * A see-through theme: every surface invisible, only writing, edges and
 * shadows left -- Outline's settings, as the starting point for any theme in
 * that family.
 *
 * `ink` is the writing and the edges; `backing` is what pop-ups and the
 * canvas sit on, and should be the opposite of the ink so writing reads over
 * any picture. `blockTheme` and `controlColors` are merged over the template
 * for anything a particular theme wants different.
 */
export function seeThroughPreset({
  id,
  name,
  description,
  ink = '#ffffff',
  backing = '#000000',
  blockTheme = {},
  controlColors = {}
} = {}) {
  const clear = '#00000000';
  const line = `${ink}b3`;
  const panel = hexWithAlpha(backing, POPUP_BACKING_OPACITY);

  return {
    id,
    name,
    description,
    controlColors: {
      left: { panelBg: panel, textColor: ink, buttonBg: clear, buttonText: ink, borderColor: line, inputBg: clear, ...controlColors.left },
      right: { panelBg: panel, textColor: ink, buttonBg: clear, buttonText: ink, borderColor: line, ...controlColors.right },
      canvas: { outerBg: backing, ...controlColors.canvas }
    },
    blockTheme: normalizeBlockTheme({
      borderColor: withAlpha(ink, 0.7),
      borderWidth: '1.5px',
      borderRadius: '12px',
      shadow: `0 0 0 1px ${withAlpha(backing, 0.35)}, 0 12px 32px ${withAlpha(backing, 0.45)}`,
      focusOutline: ink,
      focusShadow: `0 0 0 2px ${withAlpha(ink, 0.45)}, 0 0 14px ${withAlpha(ink, 0.4)}`,
      headerBg: 'transparent',
      headerText: ink,
      accentColor: ink,
      accentText: backing,
      mediaButtonBg: 'transparent',
      mediaButtonText: ink,
      // Tight and dark enough to outline each letter, so the writing holds up
      // over a picture of its own colour; the first version only softened the
      // edges.
      textShadow: `0 0 1px ${backing}, 0 0 3px ${backing}, 0 1px 6px ${withAlpha(backing, 0.85)}`,
      bgOpacity: 0,
      headerOpacity: 0,
      textOpacity: 100,
      ...blockTheme
    }),
    // What pop-ups sit on -- see above. A theme without one keeps its panels'
    // own colour.
    popupBg: withAlpha(backing, POPUP_BACKING_OPACITY),
    previewBg: 'transparent',
    blockDefaults: { bgColor: backing, textColor: ink }
  };
}

export const OUTLINE_PRESET = seeThroughPreset({
  id: OUTLINE_THEME_ID,
  name: 'Outline',
  description: 'Only the writing, the edges and the shadows. Every surface is see-through, so a wallpaper shows through all of it.'
});
