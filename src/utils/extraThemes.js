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
  blockDefaults: { bgColor: '#1a1a42', textColor: '#f5d98a' }
};

export const EXTRA_PRESETS = [MOSS_GROVE_PRESET, PEACH_SORBET_PRESET, INDIGO_GILT_PRESET];
