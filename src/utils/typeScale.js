/**
 * How big the writing is, kept as two numbers rather than one.
 *
 * ## What was asked for
 *
 * "Add an advanced parameter in the settings that are in the controls, where
 * you'll be able to change the size of the typo for all modes at the same time.
 * But one for PC and one for mobile. I think it'll also help for me to find a
 * good size for a default too."
 *
 * That last sentence is the reason this exists and it is worth keeping in
 * sight: the size of the writing had been changed twice by guessing, applied,
 * looked at, and rewound. A number you can drag settles that in the time it
 * takes to read a line, and whatever it settles on is what the defaults below
 * should eventually say.
 *
 * ## Two numbers, and which one is in force
 *
 * A phone held at arm's length and a monitor at desk distance do not want the
 * same size, and one number cannot be right for both. So there are two, and
 * something has to choose.
 *
 * It is chosen by the **width of the window**, not by what kind of machine this
 * is. The app already changes its whole layout at 1024px — the controls, the
 * canvas, the modes, eight rules in six files — so under that width it is
 * running its mobile layout, whatever it is running on, and the size that
 * belongs to that layout is the mobile one. Deciding by platform instead would
 * mean a half-width window on a desktop getting the phone's layout at the
 * desktop's size, which is the one combination neither number was set for.
 *
 * It also makes the setting tunable: narrow the window on a computer and the
 * phone's number takes over in front of you.
 *
 * ## Percentages, because the app is written in rem
 *
 * Every size in the app is in `rem`, which is a multiple of one number on the
 * root element. So this scales that, and every mode moves together without a
 * single mode file knowing anything about it. The control bar moves with it,
 * which is the honest consequence of one lever: it measures itself, so at a
 * large size it puts more buttons behind the menu rather than wrapping.
 *
 * 100 means "whatever the browser was going to use", not "16 pixels" — so
 * somebody who has set a larger default size in their browser keeps it, and
 * this is a multiplier on top rather than a number that overrules them.
 */

/**
 * The width at or under which the mobile number is the one in force.
 *
 * The same 1024 the rest of the app changes layout at. If that ever moves, this
 * moves with it: the rule is "the size that belongs to the layout on screen",
 * not "the size for windows under 1024".
 */
export const MOBILE_BREAKPOINT = 1024;

/** Percent of the browser's own text size. */
export const DEFAULT_SCALE = 100;

/**
 * The ends of the slider.
 *
 * Below about 80 the interface stops being comfortably tappable on a phone,
 * since everything in rem shrinks together; above about 150 a text block on a
 * canvas holds so few words that it is scrolling more than it is showing. Both
 * are judgement, and both are deliberately past what anybody should want, so
 * that the useful range sits in the middle of the travel rather than at one end
 * of it.
 */
export const MIN_SCALE = 70;
export const MAX_SCALE = 160;

/** Kept on this device, like every other app-wide preference here. */
export const STORAGE_KEY = 'typeScale';

export const DEFAULT_SCALES = Object.freeze({
  desktop: DEFAULT_SCALE,
  mobile: DEFAULT_SCALE
});

/** The two it can be. */
export const DEVICES = Object.freeze(['desktop', 'mobile']);

/**
 * A number the slider could have produced, or the default.
 *
 * Anything that is not a finite number is the default rather than 0 — the trap
 * being `Number(null)`, which is 0 and would silently mean "as small as it
 * goes". That exact mistake shipped once in `isCompactToolbar` and was caught
 * by its test rather than by looking at it.
 */
export function clampScale(value) {
  // Coerced only from a number or a string that has something in it. `Number()`
  // on its own is not a filter: null, '' and [] all come back as 0, which is
  // finite, survives the check below and clamps to the smallest size there is.
  // The comment above was written before this line was, and the line still got
  // it wrong; the test is what said so.
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(number)) return DEFAULT_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(number)));
}

/**
 * Whether the window on screen is the one the mobile number was set for.
 *
 * A width that is not a number is not a narrow window, it is a missing
 * measurement, and the desktop number is the safer thing to be wrong with.
 */
export function isCompactViewport({ width } = {}) {
  if (typeof width !== 'number' || !Number.isFinite(width)) return false;
  return width <= MOBILE_BREAKPOINT;
}

/** Which of the two names is in force at this width. */
export function deviceFor({ width } = {}) {
  return isCompactViewport({ width }) ? 'mobile' : 'desktop';
}

/** The percentage in force: the pair, and the window it is being read in. */
export function scaleFor({ width, scales } = {}) {
  const pair = normaliseScales(scales);
  return pair[deviceFor({ width })];
}

/**
 * The multiplier the stylesheet wants, from the percentage a person reads.
 *
 * Rounded, because an unrounded ratio ends up in a CSS custom property as
 * fifteen digits and appears in the inspector every time anybody looks.
 */
export function cssScale(percent) {
  return Math.round((clampScale(percent) / 100) * 1000) / 1000;
}

/** A pair, from anything: a stored object, a half-written one, or nothing. */
export function normaliseScales(scales) {
  const source = scales && typeof scales === 'object' ? scales : {};
  return {
    desktop: clampScale(source.desktop ?? DEFAULT_SCALE),
    mobile: clampScale(source.mobile ?? DEFAULT_SCALE)
  };
}

/**
 * The pair as stored, from the raw string in storage.
 *
 * Tolerant on purpose: a preference that cannot be read is a preference that
 * goes back to its default, never one that stops the app loading. There is
 * nothing here worth throwing over.
 */
export function readScales(raw) {
  if (typeof raw !== 'string' || !raw) return { ...DEFAULT_SCALES };
  try {
    return normaliseScales(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SCALES };
  }
}

/** The pair with one of the two changed, clamped, and the other left alone. */
export function withScale(scales, { device, value } = {}) {
  const pair = normaliseScales(scales);
  if (!DEVICES.includes(device)) return pair;
  return { ...pair, [device]: clampScale(value) };
}

/** Whether anything has been changed from the defaults, for a Reset to offer. */
export function isDefault(scales) {
  const pair = normaliseScales(scales);
  return pair.desktop === DEFAULT_SCALE && pair.mobile === DEFAULT_SCALE;
}
