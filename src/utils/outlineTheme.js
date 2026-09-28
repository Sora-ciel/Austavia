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
 *
 * How see-through each part is can be set too, which is what makes this a
 * family rather than one theme in several colours: `surfaceOpacity` and
 * `headerOpacity` for blocks (0-100, as the theme dials are), `panelOpacity`
 * for the toolbar and `popupOpacity` for pop-ups (0-1). Left out, each is
 * Outline's.
 */
export function seeThroughPreset({
  id,
  name,
  description,
  ink = '#ffffff',
  backing = '#000000',
  blockTheme = {},
  controlColors = {},
  surfaceOpacity = 0,
  headerOpacity = 0,
  panelOpacity = POPUP_BACKING_OPACITY,
  popupOpacity = POPUP_BACKING_OPACITY
} = {}) {
  const clear = '#00000000';
  const line = `${ink}b3`;
  const panel = hexWithAlpha(backing, panelOpacity);

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
      bgOpacity: surfaceOpacity,
      headerOpacity,
      textOpacity: 100,
      ...blockTheme
    }),
    // What pop-ups sit on -- see above. A theme without one keeps its panels'
    // own colour.
    popupBg: withAlpha(backing, popupOpacity),
    previewBg: 'transparent',
    blockDefaults: { bgColor: backing, textColor: ink }
  };
}

export const OUTLINE_PRESET = seeThroughPreset({
  id: OUTLINE_THEME_ID,
  name: 'Outline',
  description: 'Only the writing, the edges and the shadows. Every surface is see-through, so a wallpaper shows through all of it.'
});

/**
 * Three more in the family, asked for on 2026-09-27: "make 3 other themes that
 * are a bit like Outline, with different colours and levels of 'this will not
 * have opacity, or this will have more'." Each differs from Outline in colour
 * and in one clear direction of see-through.
 */

// Warm, and further than Outline: the toolbar is fully clear too, so nothing
// but the pop-ups has any backing at all.
export const AMBER_WIRE_PRESET = seeThroughPreset({
  id: 'amber-wire',
  name: 'Amber Wire',
  description: 'Amber writing and edges on nothing at all -- even the toolbar is clear. Only the pop-ups keep a backing.',
  ink: '#ffc46b',
  backing: '#140c02',
  panelOpacity: 0
});

// Cool, and less far than Outline: blocks keep a faint tint of the backing
// and their headers a stronger one, so they read as frosted panes rather than
// bare outlines.
export const FROST_GLASS_PRESET = seeThroughPreset({
  id: 'frost-glass',
  name: 'Frost Glass',
  description: 'Pale blue writing on frosted panes: blocks keep a light tint and their headers a stronger one, so the wallpaper shows through softened.',
  ink: '#e8f4ff',
  backing: '#07121f',
  surfaceOpacity: 35,
  headerOpacity: 55,
  panelOpacity: 0.6,
  popupOpacity: 0.85
});

// Light, the other way round: dark writing with pale backings, for bright
// wallpapers where white writing would disappear.
export const CHALK_PRESET = seeThroughPreset({
  id: 'chalk',
  name: 'Chalk',
  description: 'Dark writing with pale backings, for bright wallpapers. Blocks keep a whisper of white; the toolbar and pop-ups are chalky panes.',
  ink: '#16181c',
  backing: '#f4f1ea',
  surfaceOpacity: 20,
  popupOpacity: 0.9
});

/** Every see-through theme, Outline first -- the order they appear in. */
export const SEE_THROUGH_PRESETS = [OUTLINE_PRESET, AMBER_WIRE_PRESET, FROST_GLASS_PRESET, CHALK_PRESET];
