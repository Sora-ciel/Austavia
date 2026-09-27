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
 * black at 72%: dark enough for white writing over the brightest picture,
 * light enough that the picture is still there behind it.
 *
 * Single Note's page is black for a related reason; that one is in
 * modeSurface.js, because it is true of every theme and not only this one.
 */
import { normalizeBlockTheme } from './themeDefaults.js';

export const OUTLINE_THEME_ID = 'outline';

const CLEAR = '#00000000';
const INK = '#ffffff';
const LINE = '#ffffffb3';

export const OUTLINE_PRESET = {
  id: OUTLINE_THEME_ID,
  name: 'Outline',
  description: 'Only the writing, the edges and the shadows. Every surface is see-through, so a wallpaper shows through all of it.',
  controlColors: {
    left: {
      panelBg: CLEAR,
      textColor: INK,
      buttonBg: CLEAR,
      buttonText: INK,
      borderColor: LINE,
      inputBg: CLEAR
    },
    right: {
      panelBg: CLEAR,
      textColor: INK,
      buttonBg: CLEAR,
      buttonText: INK,
      borderColor: LINE
    },
    canvas: {
      outerBg: '#000000'
    }
  },
  blockTheme: normalizeBlockTheme({
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: '1.5px',
    borderRadius: '12px',
    shadow: '0 0 0 1px rgba(0, 0, 0, 0.35), 0 12px 32px rgba(0, 0, 0, 0.45)',
    focusOutline: '#ffffff',
    focusShadow: '0 0 0 2px rgba(255, 255, 255, 0.45), 0 0 14px rgba(255, 255, 255, 0.4)',
    headerBg: 'transparent',
    headerText: INK,
    accentColor: INK,
    accentText: '#000000',
    mediaButtonBg: 'transparent',
    mediaButtonText: INK,
    // Tight and dark enough to outline each letter, so white writing holds
    // up over a white picture; the first version only softened the edges.
    textShadow: '0 0 1px #000000, 0 0 3px #000000, 0 1px 6px rgba(0, 0, 0, 0.85)',
    bgOpacity: 0,
    headerOpacity: 0,
    textOpacity: 100
  }),
  // What pop-ups sit on -- see above. A theme without one keeps its panels'
  // own colour.
  popupBg: 'rgba(0, 0, 0, 0.72)',
  previewBg: 'transparent',
  blockDefaults: { bgColor: '#000000', textColor: INK }
};
