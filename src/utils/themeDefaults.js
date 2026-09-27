export const CONTROL_COLOR_DEFAULTS = {
  left: {
    panelBg: '#111111b0',
    textColor: '#ffffff',
    buttonBg: '#333333',
    buttonText: '#ffffff',
    borderColor: '#444444',
    inputBg: '#1d1d1d'
  },
  right: {
    panelBg: '#222222',
    textColor: '#ffffff',
    buttonBg: '#222222',
    buttonText: '#ffffff',
    borderColor: '#444444'
  },
  canvas: {
    outerBg: '#000000',
    innerBg: '#000000'
  }
};

export const BLOCK_THEME_DEFAULTS = {
  borderColor: 'rgba(255, 255, 255, 0.22)',
  borderWidth: '1px',
  borderRadius: '14px',
  shadow:
    '0 18px 45px rgba(0, 0, 0, 0.5), 0 0 22px rgba(88, 160, 255, 0.08)',
  focusOutline: 'rgba(110, 168, 255, 0.85)',
  focusShadow:
    '0 0 0 2px rgba(110, 168, 255, 0.35), 0 0 12px rgba(110, 168, 255, 0.5)',
  headerBg: 'var(--bg)',
  headerText: 'var(--text)',
  headerFont: "'Inter', system-ui, sans-serif",
  headerLetterSpacing: '0.06em',
  headerTransform: 'uppercase',
  bodyFont: "'Inter', system-ui, sans-serif",
  accentColor: '#ff5f5f',
  accentText: '#ffffff',
  controlRadius: '8px',
  // 0–100, each on its own. A block's body, its header strip and its writing
  // are faded separately because fading them together is what `opacity` on the
  // element already does, and that is rarely what anyone wants — a translucent
  // card with solid text is the useful arrangement, and it needs the surface
  // and the writing to move independently.
  bgOpacity: 100,
  headerOpacity: 100,
  textOpacity: 100,
  mediaButtonBg: 'rgba(255, 255, 255, 0.08)',
  mediaButtonText: '#ffffff',
  // A shadow under a block's writing. None by default; Outline uses one to
  // keep white writing readable over any wallpaper -- see utils/outlineTheme.js.
  textShadow: 'none'
};

export const CUSTOM_THEME_ID = 'custom';
export const DEFAULT_PREVIEW_BG = 'rgba(20, 20, 24, 0.8)';

/**
 * The canvas's two backgrounds, which start life as one colour.
 *
 * Canvas mode paints an outer area and an inner one. Nothing says they should
 * differ, and when they do the seam between them is visible — four of the six
 * built-in themes drifted apart that way, each by a shade or two, so the same
 * app looked subtly different depending on which theme was on.
 *
 * A theme that names only one colour now gets it for both, which is what makes
 * this structural rather than a one-time tidy-up: a new theme cannot arrive
 * mismatched by omission, and anyone adding one gets a single background
 * without having to know there were ever two. Naming both still works, for a
 * theme that genuinely wants the distinction.
 */
export function normalizeCanvasColors(raw = {}) {
  const given = raw || {};

  // Whichever was provided seeds the other. Outer leads because it is the
  // colour the app is framed in.
  const outerBg = given.outerBg || given.innerBg || CONTROL_COLOR_DEFAULTS.canvas.outerBg;
  const innerBg = given.innerBg || outerBg;

  return { ...CONTROL_COLOR_DEFAULTS.canvas, ...given, outerBg, innerBg };
}

export function normalizeControlColors(raw = {}) {
  const left = {
    ...CONTROL_COLOR_DEFAULTS.left,
    ...(raw.left || {})
  };

  const right = {
    ...CONTROL_COLOR_DEFAULTS.right,
    ...(raw.right || {})
  };

  const canvas = normalizeCanvasColors(raw.canvas);

  return { left, right, canvas };
}

export function normalizeBlockTheme(raw = {}) {
  return { ...BLOCK_THEME_DEFAULTS, ...(raw || {}) };
}
