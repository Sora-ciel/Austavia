// Mr.Lee — a temporary guest theme built from the Hato pigeon-hoodie
// wallpapers. "Hato" stays as the internal name for the artwork and its asset
// folder; "Mr.Lee" is what the two presets are called on screen.
//
// Everything the theme needs lives in this file plus `public/hato/`. Removing
// it is: delete this file, delete `public/hato/`, and drop the `hato`
// references in `App.svelte` and `components/ControlIcon.svelte`.
import { writable } from 'svelte/store';
import { normalizeBlockTheme } from './themeDefaults.js';

export const HATO_ID_PREFIX = 'hato-';
const BG_ROOT = '/hato/';

// Set by App whenever a preset is applied. Non-null means a Mr.Lee preset is
// active, which is what makes the toolbar icons turn into characters.
export const hatoThemeId = writable(null);

// Which crowd member stands in for which toolbar icon. Only decorative or
// self-evident controls are swapped — anything destructive or directional
// (trash, undo, export, up/down) keeps its glyph, because a face there would
// cost the button its meaning.
export const HATO_BUDDIES = {
  menu: 'grin',
  mode: 'cone',
  plus: 'hand',
  settings: 'rose',
  folder: 'smile',
  camera: 'shock'
};

export function hatoBuddySrc(name) {
  const buddy = HATO_BUDDIES[name];
  return buddy ? `${BG_ROOT}buddies/${buddy}.png` : '';
}

// True for any path this theme owns. Used to drop wallpaper paths that an
// earlier build wrote straight into saves — see normalizeModeSettings.
export function isHatoBackground(url) {
  return typeof url === 'string' && url.startsWith(BG_ROOT);
}

const CARTOON_FONT = "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif";

// Two themes over four colours. Each pairs one of them as the sky the crowd
// stands against with a second as the accent, and keeps the other two in
// supporting roles, so purple, pink, orange and pale blue all appear in both.
//
// Dusk runs dark chrome, Day runs light — the wallpapers are a night sky and
// a daylight one, and matching the chrome to each is what keeps the two from
// reading as one theme in two hues.
//
// `chrome` carries the surfaces, because they are the half that flips between
// the two; deriving them from a single lightness flag made both harder to
// read than writing them out. Panels are translucent so the colour underneath
// carries through. The canvas deliberately is not: a translucent surface
// stacked on a translucent surround comes out darker than the surround and
// splits the canvas into two visible sheets. Blocks keep the heavy black
// outline and flat offset shadow the drawing itself uses, since nothing in
// this artwork is soft-edged.
function mrLeePreset({ id, name, description, wallpaper, sky, accent, spark, ink, chrome }) {
  return {
    id,
    name,
    description,
    controlColors: {
      left: {
        panelBg: chrome.panel + 'e8',
        textColor: chrome.panelInk,
        buttonBg: chrome.buttonBg,
        buttonText: chrome.buttonInk,
        borderColor: chrome.border,
        inputBg: chrome.inputBg
      },
      right: {
        panelBg: chrome.panel + 'f0',
        textColor: chrome.panelInk,
        buttonBg: chrome.buttonBg,
        buttonText: chrome.buttonInk,
        borderColor: chrome.border
      },
      canvas: {
        // Surround and working surface are one flat field, so the canvas reads
        // as a single sheet rather than a lighter page floating on a darker
        // one. This is the sky seen through the panel tint, given opaque.
        outerBg: chrome.canvas,
        innerBg: chrome.canvas
      }
    },
    blockTheme: normalizeBlockTheme({
      borderColor: '#000000',
      borderWidth: '3px',
      borderRadius: '18px',
      shadow: chrome.blockShadow,
      focusOutline: spark,
      focusShadow: `0 0 0 3px ${spark}59, 0 0 14px ${spark}8c`,
      headerBg: `linear-gradient(135deg, ${sky}, ${accent})`,
      headerText: ink,
      headerFont: CARTOON_FONT,
      headerLetterSpacing: '0.05em',
      headerTransform: 'uppercase',
      bodyFont: CARTOON_FONT,
      accentColor: accent,
      accentText: ink,
      controlRadius: '10px',
      mediaButtonBg: chrome.mediaBg,
      mediaButtonText: chrome.buttonInk
    }),
    previewBg: sky,
    // Translucent, so blocks read as glass over the wallpaper rather than as
    // patches cut out of it. Editing this colour in the picker flattens it to
    // opaque — the picker has no alpha channel.
    blockDefaults: { bgColor: chrome.blockBg, textColor: chrome.panelInk },
    // Single note mode falls back to this wallpaper on any file that has not
    // set a background of its own. See `withThemeBackground` in App.svelte.
    singleBackground: {
      desktop: `${BG_ROOT}${wallpaper}.webp`,
      mobile: `${BG_ROOT}${wallpaper}-mobile.webp`
    },
    // The characters in place of toolbar icons -- a setting of the theme, so
    // a copy of it keeps them. See utils/themeExtras.js.
    buddyIcons: true
  };
}

export const HATO_PRESETS = [
  mrLeePreset({
    id: 'hato-dusk',
    name: 'Mr.Lee Dusk',
    description: 'The crowd against a deep purple sky, lit hot pink, with orange focus rings.',
    wallpaper: 'purple',
    sky: '#630ca2',
    accent: '#ff0080',
    spark: '#ff962d',
    ink: '#ffffff',
    chrome: {
      panel: '#1c0d2b',
      panelInk: '#ffffff',
      // A white wash, so buttons lift off the panel without bringing in a
      // fourth colour; the pink is carried by the label and the hairline.
      buttonBg: '#ffffff1a',
      // Lifted off the scarf pink the rest of the theme uses: at #ff0080 the
      // label only reaches 3.7:1 on this fill, which is under the 4.5:1 body
      // text wants. The accent itself stays exact everywhere it isn't text.
      buttonInk: '#ff5fab',
      border: '#ff008059',
      inputBg: '#00000059',
      canvas: '#2c0d47',
      blockBg: '#1c0d2bc7',
      blockShadow: '0 6px 0 #000000cc, 0 22px 40px #00000073',
      mediaBg: '#ffffff1f'
    }
  }),
  mrLeePreset({
    id: 'hato-day',
    name: 'Mr.Lee Day',
    description: 'Daylight chrome in near-white, buttons washed sky blue and lettered burnt orange, sparked pink.',
    wallpaper: 'blue',
    sky: '#78b2ff',
    accent: '#ff962d',
    spark: '#ff0080',
    ink: '#131a24',
    chrome: {
      // Plain white, not a blue-tinted near-white: against the periwinkle
      // canvas a tinted panel reads as a slightly-off colour rather than as a
      // deliberate one. The canvas carries the sky tint; the chrome doesn't.
      panel: '#ffffff',
      panelInk: '#16233d',
      // Buttons take the sky itself as their fill and the accent, darkened
      // until it carries on a light surface, as their lettering — cool fill
      // under warm text, which is the pairing the artwork runs on.
      buttonBg: '#78b2ff3d',
      buttonInk: '#a34500',
      // The accent one step down. At full strength orange only reaches 2.2:1
      // on white and the hairline washes out; this holds 3.4:1 and still
      // reads orange rather than brown.
      border: '#d96d00',
      inputBg: '#ffffffbf',
      canvas: '#d7e7ff',
      blockBg: '#ffffffd6',
      // Light chrome can't carry the near-black drop shadow the dark theme
      // uses — at this lightness it reads as grime rather than as ink.
      blockShadow: '0 6px 0 #00000059, 0 22px 40px #0000002e',
      mediaBg: '#16233d14'
    }
  })
];
