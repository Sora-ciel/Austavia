/**
 * Ordinary themes added on 2026-09-27 -- "3 more 'normal'", in colours the
 * app did not have yet, so there are as many ordinary themes as see-through
 * ones (utils/outlineTheme.js). A green was asked for by name; the other two
 * fill gaps: the only light theme was Paper Notebook, and nothing paired a
 * deep blue with gold.
 *
 * Same shape as the themes written in App.svelte's STYLE_PRESETS, and listed
 * straight after them, so the ordinary themes stay together and the
 * see-through ones follow as a group.
 */
import { normalizeBlockTheme } from './themeDefaults.js';

export const MOSS_GROVE_PRESET = {
  id: 'moss-grove',
  name: 'Moss Grove',
  description: 'Deep forest greens with sage writing and bright moss accents.',
  controlColors: {
    left: {
      panelBg: '#0f1a12ee',
      textColor: '#e3f0e2',
      buttonBg: '#17271b',
      buttonText: '#8fe39a',
      borderColor: '#2a4430',
      inputBg: '#122016'
    },
    right: {
      panelBg: '#101c13f2',
      textColor: '#e3f0e2',
      buttonBg: '#19291d',
      buttonText: '#8fe39a',
      borderColor: '#2d4833'
    },
    canvas: { outerBg: '#0a120c' }
  },
  blockTheme: normalizeBlockTheme({
    borderColor: 'rgba(143, 227, 154, 0.35)',
    borderRadius: '14px',
    shadow: '0 20px 44px rgba(3, 10, 5, 0.7), 0 0 18px rgba(143, 227, 154, 0.14)',
    focusOutline: '#8fe39a',
    focusShadow: '0 0 0 2px rgba(143, 227, 154, 0.35), 0 0 14px rgba(143, 227, 154, 0.5)',
    headerText: '#8fe39a',
    headerFont: "'Inter', system-ui, sans-serif",
    headerLetterSpacing: '0.08em',
    accentColor: '#8fe39a',
    accentText: '#0a1a0d',
    mediaButtonBg: 'rgba(143, 227, 154, 0.15)',
    mediaButtonText: '#8fe39a'
  }),
  previewBg: '#132016',
  blockDefaults: { bgColor: '#15241a', textColor: '#cfeccd' }
};

// A light theme, which the app had only one of.
export const PEACH_SORBET_PRESET = {
  id: 'peach-sorbet',
  name: 'Peach Sorbet',
  description: 'A light theme: soft peach paper, cocoa writing and coral accents.',
  controlColors: {
    left: {
      panelBg: '#fff1e8',
      textColor: '#4a2c22',
      buttonBg: '#ffdcc8',
      buttonText: '#b8452e',
      borderColor: '#f2c3ab',
      inputBg: '#fff8f3'
    },
    right: {
      panelBg: '#fff5ef',
      textColor: '#4a2c22',
      buttonBg: '#ffe2d2',
      buttonText: '#b8452e',
      borderColor: '#f0c6b0'
    },
    canvas: { outerBg: '#fdeee4' }
  },
  blockTheme: normalizeBlockTheme({
    borderColor: '#f0bfa6',
    borderWidth: '1.5px',
    borderRadius: '16px',
    shadow: '0 14px 30px rgba(184, 69, 46, 0.12)',
    focusOutline: '#e8664a',
    focusShadow: '0 0 0 2px rgba(232, 102, 74, 0.3), 0 0 12px rgba(232, 102, 74, 0.35)',
    headerBg: 'linear-gradient(120deg, #ffe4d4, #ffd3bd)',
    headerText: '#8a3321',
    headerFont: "'Inter', system-ui, sans-serif",
    headerLetterSpacing: '0.06em',
    accentColor: '#e8664a',
    accentText: '#fff7f2',
    mediaButtonBg: '#ffdcc8',
    mediaButtonText: '#8a3321'
  }),
  previewBg: '#fff3ea',
  blockDefaults: { bgColor: '#fffaf6', textColor: '#4a2c22' }
};

export const INDIGO_GILT_PRESET = {
  id: 'indigo-gilt',
  name: 'Indigo Gilt',
  description: 'Deep indigo night with gilded gold writing on its edges.',
  controlColors: {
    left: {
      panelBg: '#12122eee',
      textColor: '#ecebff',
      buttonBg: '#1c1c44',
      buttonText: '#f2c14e',
      borderColor: '#2f2f66',
      inputBg: '#161638'
    },
    right: {
      panelBg: '#141432f2',
      textColor: '#ecebff',
      buttonBg: '#1f1f4a',
      buttonText: '#f2c14e',
      borderColor: '#34346e'
    },
    canvas: { outerBg: '#0b0b22' }
  },
  blockTheme: normalizeBlockTheme({
    borderColor: 'rgba(242, 193, 78, 0.38)',
    borderRadius: '12px',
    shadow: '0 22px 48px rgba(4, 4, 18, 0.72), 0 0 20px rgba(242, 193, 78, 0.14)',
    focusOutline: '#f2c14e',
    focusShadow: '0 0 0 2px rgba(242, 193, 78, 0.35), 0 0 14px rgba(242, 193, 78, 0.5)',
    headerText: '#f2c14e',
    headerFont: "'Chakra Petch', 'Segoe UI', sans-serif",
    headerLetterSpacing: '0.12em',
    accentColor: '#f2c14e',
    accentText: '#141432',
    mediaButtonBg: 'rgba(242, 193, 78, 0.16)',
    mediaButtonText: '#f2c14e'
  }),
  previewBg: '#16163a',
  // The blocks' writing is the toolbar buttons' gold -- asked for on
  // 2026-09-28, "use the same colour as you use on the buttons in the
  // controls for the text in blocks". It was a paler gold of its own.
  blockDefaults: { bgColor: '#1a1a42', textColor: '#f2c14e' }
};

/*
 * Experiments, asked for on 2026-09-28: "do other themes while playing with
 * other colours -- make one that doesn't have shadows, or a neon-like style,
 * or others with three important colours. I will check them and keep the
 * good ideas." Each tries one thing the others do not, named below, so the
 * ones worth keeping are easy to tell apart from the ones that are not.
 */

// No shadows anywhere -- not under blocks, not around focus -- and small
// corners. Flat colour and thin lines only.
export const FLATLINE_PRESET = {
  id: 'flatline',
  name: 'Flatline',
  description: 'No shadows at all: flat slate panels, thin lines, small corners and one blue accent.',
  controlColors: {
    left: { panelBg: '#1e2329', textColor: '#dfe4ea', buttonBg: '#2a3038', buttonText: '#6aa9ff', borderColor: '#39414b', inputBg: '#232830' },
    right: { panelBg: '#1e2329', textColor: '#dfe4ea', buttonBg: '#2a3038', buttonText: '#6aa9ff', borderColor: '#39414b' },
    canvas: { outerBg: '#171b20' }
  },
  blockTheme: normalizeBlockTheme({
    borderColor: '#3a434e',
    borderWidth: '1px',
    borderRadius: '4px',
    shadow: 'none',
    focusOutline: '#6aa9ff',
    focusShadow: 'none',
    headerBg: '#232932',
    headerText: '#9fb3c8',
    headerLetterSpacing: '0.04em',
    headerTransform: 'none',
    controlRadius: '3px',
    accentColor: '#6aa9ff',
    accentText: '#0d1520',
    mediaButtonBg: '#2a3038',
    mediaButtonText: '#dfe4ea'
  }),
  previewBg: '#1e2329',
  blockDefaults: { bgColor: '#20262d', textColor: '#dfe4ea' }
};

// Neon: pure black, glowing cyan edges, and writing that glows too -- the
// text shadow used as light rather than as an outline.
export const NEON_GRID_PRESET = {
  id: 'neon-grid',
  name: 'Neon Grid',
  description: 'Neon signage: pure black, glowing cyan edges and glowing writing, with magenta sparks.',
  controlColors: {
    left: { panelBg: '#000000ee', textColor: '#b9fbff', buttonBg: '#05080a', buttonText: '#00f0ff', borderColor: '#00f0ff66', inputBg: '#020405' },
    right: { panelBg: '#000000f2', textColor: '#b9fbff', buttonBg: '#05080a', buttonText: '#ff2bd6', borderColor: '#ff2bd666' },
    canvas: { outerBg: '#000000' }
  },
  blockTheme: normalizeBlockTheme({
    borderColor: '#00f0ff',
    borderWidth: '1.5px',
    borderRadius: '6px',
    shadow: '0 0 6px rgba(0, 240, 255, 0.9), 0 0 22px rgba(0, 240, 255, 0.45), inset 0 0 12px rgba(0, 240, 255, 0.18)',
    focusOutline: '#ff2bd6',
    focusShadow: '0 0 8px rgba(255, 43, 214, 0.9), 0 0 26px rgba(255, 43, 214, 0.5)',
    headerText: '#ff2bd6',
    headerFont: "'Chakra Petch', 'Segoe UI', sans-serif",
    headerLetterSpacing: '0.16em',
    accentColor: '#ff2bd6',
    accentText: '#000000',
    mediaButtonBg: 'rgba(0, 240, 255, 0.12)',
    mediaButtonText: '#00f0ff',
    textShadow: '0 0 4px rgba(0, 240, 255, 0.85), 0 0 12px rgba(0, 240, 255, 0.45)'
  }),
  previewBg: '#000000',
  blockDefaults: { bgColor: '#000000', textColor: '#b9fbff' }
};

// Three colours, each with one job: navy for surfaces, orange for things you
// press, teal for headings.
export const HARBOR_SIGNAL_PRESET = {
  id: 'harbor-signal',
  name: 'Harbor Signal',
  description: 'Three colours, three jobs: navy surfaces, signal-orange buttons and teal headings.',
  controlColors: {
    left: { panelBg: '#0d2238ee', textColor: '#f4efe6', buttonBg: '#14304d', buttonText: '#ff8c42', borderColor: '#23486e', inputBg: '#10283f' },
    right: { panelBg: '#0e253df2', textColor: '#f4efe6', buttonBg: '#163352', buttonText: '#ff8c42', borderColor: '#274d75' },
    canvas: { outerBg: '#08182a' }
  },
  blockTheme: normalizeBlockTheme({
    borderColor: 'rgba(63, 208, 201, 0.45)',
    borderRadius: '10px',
    shadow: '0 16px 36px rgba(2, 8, 16, 0.7)',
    focusOutline: '#ff8c42',
    focusShadow: '0 0 0 2px rgba(255, 140, 66, 0.4), 0 0 14px rgba(255, 140, 66, 0.45)',
    headerBg: '#0f2a45',
    headerText: '#3fd0c9',
    headerLetterSpacing: '0.1em',
    accentColor: '#ff8c42',
    accentText: '#1a0c02',
    mediaButtonBg: 'rgba(255, 140, 66, 0.16)',
    mediaButtonText: '#ff8c42'
  }),
  previewBg: '#0f2a45',
  blockDefaults: { bgColor: '#102b47', textColor: '#f4efe6' }
};

// Brutalist: black and white only, thick borders, square corners, hard
// offset shadows instead of soft ones.
export const BRUTAL_MONO_PRESET = {
  id: 'brutal-mono',
  name: 'Brutal Mono',
  description: 'Black and white only: thick borders, square corners and hard offset shadows instead of soft ones.',
  controlColors: {
    left: { panelBg: '#ffffff', textColor: '#000000', buttonBg: '#ffffff', buttonText: '#000000', borderColor: '#000000', inputBg: '#ffffff' },
    right: { panelBg: '#ffffff', textColor: '#000000', buttonBg: '#ffffff', buttonText: '#000000', borderColor: '#000000' },
    canvas: { outerBg: '#f2f2f2' }
  },
  blockTheme: normalizeBlockTheme({
    borderColor: '#000000',
    borderWidth: '3px',
    borderRadius: '0px',
    shadow: '6px 6px 0 #000000',
    focusOutline: '#000000',
    focusShadow: '8px 8px 0 #000000',
    headerBg: '#000000',
    headerText: '#ffffff',
    headerFont: "'Inter', system-ui, sans-serif",
    headerLetterSpacing: '0.14em',
    controlRadius: '0px',
    accentColor: '#000000',
    accentText: '#ffffff',
    mediaButtonBg: '#ffffff',
    mediaButtonText: '#000000'
  }),
  previewBg: '#ffffff',
  blockDefaults: { bgColor: '#ffffff', textColor: '#000000' }
};

export const EXTRA_PRESETS = [
  MOSS_GROVE_PRESET,
  PEACH_SORBET_PRESET,
  INDIGO_GILT_PRESET,
  FLATLINE_PRESET,
  NEON_GRID_PRESET,
  HARBOR_SIGNAL_PRESET,
  BRUTAL_MONO_PRESET
];
