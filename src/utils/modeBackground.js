// A mode's wallpaper: what the settings mean, and what they come out as.
//
// Single Note grew this first — an image behind the writing, with opacity,
// blur, luminosity and a cover/contain choice. Canvas mode wants the same
// thing, so rather than a second copy that drifts, both modes normalise
// through here and render through components/ModeBackground.svelte.
//
// Pure, so the clamping and the awkward legacy case below can be tested
// without a browser.

export const BACKGROUND_DEFAULTS = {
  backgroundImage: '',
  backgroundImageMobile: '',
  // 0–100. 100 shows the image fully, 0 hides it.
  bgOpacity: 100,
  bgBlur: 0,
  // 0–200. 100 leaves the image alone, below blends black in, above white.
  bgLuminosity: 100,
  bgSize: 'cover',
  // Pictures pasted into a note, dimmed the same way the wallpaper is. A photo
  // pasted in is whatever brightness it happened to be, which on a dark theme
  // is usually a hole burned in the page.
  imageOpacity: 100,
  imageLuminosity: 100,
  // On by default, because one pair of controls is the simpler thing to meet
  // first: the pictures in the note match the picture behind it until somebody
  // wants them not to.
  imagesFollowBackground: true,
  // Set when somebody removes a background a theme supplied, so it stays
  // removed for this folder instead of coming straight back on next render.
  bgThemeOptOut: false
};

function clampRange(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Settings as stored, made safe to render.
 *
 * `keepImage` decides what survives from the stored image fields. Themes layer
 * their own wallpaper on at render time and it must never end up in a save, so
 * the caller passes a filter rather than this module knowing about themes.
 */
export function normalizeBackgroundSettings(raw = {}, { keepImage = value => value } = {}) {
  const given = raw || {};

  // Saves from before the 0–100 rewrite stored opacity as a 0–1 fraction.
  // Which format a save uses is read off bgLuminosity, which arrived with that
  // rewrite — deciding by magnitude instead turns a legitimate 1% into 100%,
  // because the two formats overlap at exactly 1.
  const rawOpacity = Number(given.bgOpacity);
  const isLegacyFraction =
    given.bgLuminosity === undefined && rawOpacity > 0 && rawOpacity <= 1;

  return {
    ...BACKGROUND_DEFAULTS,
    ...given,
    backgroundImage: keepImage(typeof given.backgroundImage === 'string' ? given.backgroundImage : '') || '',
    backgroundImageMobile:
      keepImage(typeof given.backgroundImageMobile === 'string' ? given.backgroundImageMobile : '') || '',
    bgOpacity: Number.isFinite(rawOpacity)
      ? clampRange(isLegacyFraction ? rawOpacity * 100 : rawOpacity, 0, 100, BACKGROUND_DEFAULTS.bgOpacity)
      : BACKGROUND_DEFAULTS.bgOpacity,
    bgBlur: Math.max(0, Number(given.bgBlur) || 0),
    bgLuminosity: clampRange(given.bgLuminosity, 0, 200, BACKGROUND_DEFAULTS.bgLuminosity),
    bgSize: given.bgSize === 'contain' ? 'contain' : 'cover',
    bgThemeOptOut: given.bgThemeOptOut === true,
    imageOpacity: clampRange(given.imageOpacity, 0, 100, BACKGROUND_DEFAULTS.imageOpacity),
    imageLuminosity: clampRange(given.imageLuminosity, 0, 200, BACKGROUND_DEFAULTS.imageLuminosity),
    // Absent means following, so a folder saved before these existed behaves
    // the way it always did rather than suddenly holding two unset dials.
    imagesFollowBackground: given.imagesFollowBackground !== false
  };
}

/**
 * How pictures inside a note should be dimmed.
 *
 * Two dials, and a switch deciding whether they are their own or the
 * wallpaper's. Following is the default: the usual wish is that everything in
 * the note sits at the same level, and one pair of sliders says that without
 * having to keep two in step by hand. Turning it off is for the case the
 * wallpaper wants to be faint and the pictures do not.
 *
 * Returned as numbers rather than a CSS string so the caller decides where the
 * filter goes, and so this can be checked without a browser.
 */
export function noteImageFilter(settings) {
  const s = settings || {};
  const follows = s.imagesFollowBackground !== false;

  const opacity = clampRange(follows ? s.bgOpacity : s.imageOpacity, 0, 100, 100);
  const luminosity = clampRange(follows ? s.bgLuminosity : s.imageLuminosity, 0, 200, 100);

  return { opacity: opacity / 100, brightness: luminosity / 100, follows };
}

/**
 * The same thing as a CSS filter, or null when it would do nothing.
 *
 * Null rather than `filter: none` so a note with nothing to dim carries no
 * filter at all — a filter creates a stacking context even when it changes
 * nothing, and that has a habit of moving things that were positioned.
 */
export function noteImageFilterCss(settings) {
  const { opacity, brightness } = noteImageFilter(settings);
  if (opacity === 1 && brightness === 1) return null;
  return `opacity(${opacity}) brightness(${brightness})`;
}

/**
 * Whether this screen should use the narrow image rather than the wide one.
 *
 * Decided by shape, not by size. It used to be a width threshold — the same
 * 1024px the toolbar uses to decide it is on a phone — and a phone turned
 * sideways is still under it. So rotating did nothing: the wide picture, which
 * is the one that suits a wide screen, never appeared on the device that has
 * two shapes.
 *
 * The two images are really a tall one and a wide one. A desktop is always
 * wider than it is tall and keeps the wide one exactly as before; a phone gets
 * whichever matches how it is being held.
 */
export function usesPortraitBackground({ width = 0, height = 0 } = {}) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
  return h > w;
}

/** Which of the two images this screen should show. */
export function backgroundImageFor(settings, { isMobile = false } = {}) {
  const s = settings || {};
  return (isMobile ? s.backgroundImageMobile : s.backgroundImage) || '';
}

/**
 * What the background layer should look like, ready for a style attribute.
 *
 * Blur is why the layer bleeds past its container: a blurred edge fades to
 * nothing, so without spilling over, a visible band of the colour underneath
 * appears around the picture. The bleed grows with the blur because that is
 * what it is compensating for.
 */
export function backgroundLayerStyle(settings, { isMobile = false } = {}) {
  const s = settings || {};
  const image = backgroundImageFor(s, { isMobile });
  if (!image) return null;

  const opacity = clampRange(s.bgOpacity, 0, 100, 100) / 100;
  const blur = Math.max(0, Number(s.bgBlur) || 0);
  const luminosity = clampRange(s.bgLuminosity, 0, 200, 100);

  const filters = [];
  if (blur > 0) filters.push(`blur(${blur}px)`);
  if (luminosity !== 100) filters.push(`brightness(${luminosity / 100})`);

  return {
    image,
    opacity,
    filter: filters.length ? filters.join(' ') : 'none',
    size: s.bgSize === 'contain' ? 'contain' : 'cover',
    bleed: blur > 0 ? Math.ceil(blur * 2) : 0
  };
}
