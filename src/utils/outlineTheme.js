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
 * The toolbar was put on the same 78% for a while ("make it so that controls
 * background is also a black at the same opacity"), and then taken back off:
 * once Amber Wire showed a fully clear toolbar, that was the one wanted for
 * the whole family. See seeThroughPreset.
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
 * How see-through each part is can be set too: `surfaceOpacity` and
 * `headerOpacity` for blocks (0-100, as the theme dials are), `panelOpacity`
 * for the toolbar and `popupOpacity` for pop-ups (0-1).
 *
 * The defaults are Amber Wire's, because they were chosen: "I really love the
 * opacity settings of Amber Wire, so I would like all the Outline themes to
 * follow those" (2026-09-27). Blocks and headers clear, the toolbar clear too,
 * and only pop-ups on the 78% backing. Every see-through theme takes them, and
 * one that differs should be a decision, not a leftover.
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
  panelOpacity = 0,
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
    // The card in the theme list is drawn on the theme's own backing. It was
    // see-through, like the theme, and a see-through card over the dark
    // settings panel hid Chalk's dark writing entirely.
    previewBg: withAlpha(backing, popupOpacity),
    blockDefaults: { bgColor: backing, textColor: ink }
  };
}

export const OUTLINE_PRESET = seeThroughPreset({
  id: OUTLINE_THEME_ID,
  name: 'Outline',
  description: 'Only the writing, the edges and the shadows. Every surface is see-through, so a wallpaper shows through all of it.'
});

/**
 * The rest of the family. Three asked for on 2026-09-27 -- "a bit like
 * Outline, with different colours" -- and six more the same day, so that
 * there are as many see-through themes as ordinary ones. All of them on the
 * family's levels (see seeThroughPreset); only their colours differ.
 */
const wire = (id, name, ink, backing, description) =>
  seeThroughPreset({ id, name, ink, backing, description });

export const AMBER_WIRE_PRESET = wire('amber-wire', 'Amber Wire', '#ffc46b', '#140c02',
  'Amber writing and edges on nothing at all. Only the pop-ups keep a backing.');

export const FROST_GLASS_PRESET = wire('frost-glass', 'Frost Glass', '#e8f4ff', '#07121f',
  'Pale ice-blue writing and edges over the wallpaper, with navy pop-ups.');

// The other way round from the rest: dark writing, pale backings -- for a
// bright wallpaper, where white writing would disappear.
export const CHALK_PRESET = wire('chalk', 'Chalk', '#16181c', '#f4f1ea',
  'Dark writing with pale pop-ups, for bright wallpapers where white writing would vanish.');

export const MINT_WIRE_PRESET = wire('mint-wire', 'Mint Wire', '#7dffb2', '#02140a',
  'Fresh mint-green writing and edges over the wallpaper, with deep green pop-ups.');

export const CORAL_WIRE_PRESET = wire('coral-wire', 'Coral Wire', '#ff8a70', '#1a0703',
  'Warm coral writing and edges, like a sunset traced over the wallpaper.');

export const LILAC_WIRE_PRESET = wire('lilac-wire', 'Lilac Wire', '#cdb4ff', '#0e0717',
  'Soft lilac writing and edges, with dusky violet pop-ups.');

export const LIME_WIRE_PRESET = wire('lime-wire', 'Lime Wire', '#d4ff5c', '#0c1200',
  'Electric lime writing and edges -- loud on purpose, and readable over almost anything.');

export const ROSE_WIRE_PRESET = wire('rose-wire', 'Rose Wire', '#ff9ecb', '#1a0610',
  'Rose-pink writing and edges over the wallpaper, with deep berry pop-ups.');

export const COBALT_WIRE_PRESET = wire('cobalt-wire', 'Cobalt Wire', '#7aa2ff', '#030a1f',
  'Vivid cobalt-blue writing and edges, with midnight pop-ups.');

/**
 * Every see-through theme, Outline first -- the order they appear in, after
 * all the ordinary themes, so the list reads as two groups.
 */
export const SEE_THROUGH_PRESETS = [
  OUTLINE_PRESET,
  AMBER_WIRE_PRESET,
  FROST_GLASS_PRESET,
  CHALK_PRESET,
  MINT_WIRE_PRESET,
  CORAL_WIRE_PRESET,
  LILAC_WIRE_PRESET,
  LIME_WIRE_PRESET,
  ROSE_WIRE_PRESET,
  COBALT_WIRE_PRESET
].map(theme => ({ ...theme, family: 'see-through' }));
