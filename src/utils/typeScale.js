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
 * That last sentence is the reason this exists, and it has already paid: the
 * size of the writing had been changed twice by guessing, applied, looked at,
 * and rewound. A number you can drag settles that in the time it takes to read
 * a line, and the 109 in DEFAULT_SCALES below is what came back from doing it.
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

/**
 * Percent of the browser's own text size, where 100 is "leave it alone".
 *
 * This is the neutral, not the default: it is what an unreadable stored value
 * falls back to and what the slider's middle means. What each of the two starts
 * at is DEFAULT_SCALES below.
 */
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

/**
 * The size each kind of screen actually reads at, folded into the base.
 *
 * Neither number is a guess. Both came back from building the slider and living
 * with it -- 109 on a computer first ("I have seen that 109% on PC so let's
 * make this the new PC default"), then 97 on a phone once there had been long
 * enough on one to say. Finding them was the whole reason the setting was
 * asked for, and these two lines are it paying for itself twice.
 *
 * They are the **base** rather than the default position of the slider, which
 * is the change asked for afterwards: "make those text the base, then reset the
 * ranges to 100%, so that the text really is those defaults and now the range
 * at 100% looks like the real normal range."
 *
 * The difference is what the slider means. It used to read 109 when nothing had
 * been touched, so the neutral mark and the default sat in different places and
 * the travel either side of normal was lopsided. Now the base carries the
 * chosen size and the slider is a multiplier on top of it, so 100 means "the
 * size this app is meant to be read at" on both kinds of screen, and 120 means
 * the same amount bigger on either.
 */
export const BASE_SCALES = Object.freeze({
  desktop: 109,
  mobile: 97
});

/**
 * Where the slider starts: the neutral, on both.
 *
 * It is 100 rather than a number per device precisely because the numbers moved
 * into BASE_SCALES above.
 */
export const DEFAULT_SCALES = Object.freeze({
  desktop: DEFAULT_SCALE,
  mobile: DEFAULT_SCALE
});

/**
 * What the slider used to start at, needed only to read what was stored before.
 *
 * Until this change the stored number was an absolute percentage of the
 * browser's own size, so 109 meant 109%. Now it is a multiplier on the base, so
 * 109 would mean 109% of 109%. The same digits, a different meaning, which is
 * the one kind of change a stored value cannot survive on its own.
 */
const PREVIOUS_DEFAULTS = Object.freeze({
  desktop: 109,
  mobile: 100
});

/**
 * Bumped when the stored numbers change meaning, so old ones can be recognised.
 *
 * A stored pair without this is from before the base existed and is read as
 * absolute percentages -- see rebaseStoredScales.
 */
export const SCHEME_VERSION = 2;

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
export function clampScale(value, fallback = DEFAULT_SCALE) {
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
  if (!Number.isFinite(number)) return fallback;
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

/** The base this screen's writing is sized from, before the slider touches it. */
export function baseFor({ width } = {}) {
  return BASE_SCALES[deviceFor({ width })];
}

/**
 * The one number the stylesheet gets: the base for this screen, multiplied by
 * where the slider is.
 *
 * The slider is clamped and the result is **not**, which is the point of doing
 * it here rather than by handing `cssScale` a product. 160 on a computer means
 * 160% of the base, or 174% outright; clamping that back to 160 would quietly
 * shorten the top of the travel on exactly the screen with the most room.
 */
export function cssScaleFor({ width, scales } = {}) {
  const device = deviceFor({ width });
  const slider = clampScale(normaliseScales(scales)[device], DEFAULT_SCALES[device]);
  return Math.round((BASE_SCALES[device] / 100) * (slider / 100) * 1000) / 1000;
}

/**
 * A pair stored before the base existed, read as what it meant at the time.
 *
 * Two different things have to happen, and telling them apart is the whole job:
 *
 * - **Somebody sitting on the old default meant "the default"**, so they get
 *   the new one. That is what makes a phone actually arrive at 97 rather than
 *   keeping 100 for ever, which is the change that was asked for.
 * - **Somebody who had moved the slider meant that size**, so the size is kept
 *   and the number is converted. 130 on a computer was 130% outright; against a
 *   base of 109 the same size is a slider at 119.
 *
 * Getting this backwards either way is silently wrong: everybody's writing
 * jumps 9% on a release that was supposed to change nothing for them, or
 * nobody ever receives the new phone size.
 */
export function rebaseStoredScales(stored) {
  const source = stored && typeof stored === 'object' ? stored : {};
  const pair = {};
  for (const device of DEVICES) {
    const before = source[device];
    const wasDefault =
      before == null || clampScale(before, PREVIOUS_DEFAULTS[device]) === PREVIOUS_DEFAULTS[device];
    pair[device] = wasDefault
      ? DEFAULT_SCALES[device]
      : clampScale(
          Math.round((clampScale(before, PREVIOUS_DEFAULTS[device]) / BASE_SCALES[device]) * 100),
          DEFAULT_SCALES[device]
        );
  }
  return pair;
}

/** The pair as it should be written down, carrying what its numbers mean. */
export function scalesToStore(scales) {
  return { ...normaliseScales(scales), v: SCHEME_VERSION };
}

/** A pair, from anything: a stored object, a half-written one, or nothing. */
export function normaliseScales(scales) {
  const source = scales && typeof scales === 'object' ? scales : {};
  return {
    desktop: clampScale(source.desktop, DEFAULT_SCALES.desktop),
    mobile: clampScale(source.mobile, DEFAULT_SCALES.mobile)
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
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SCALES };
    // Written before the numbers changed meaning, so it says percentages of the
    // browser's own size rather than multiples of the base.
    if (parsed.v !== SCHEME_VERSION) return rebaseStoredScales(parsed);
    return normaliseScales(parsed);
  } catch {
    return { ...DEFAULT_SCALES };
  }
}

/** The pair with one of the two changed, clamped, and the other left alone. */
export function withScale(scales, { device, value } = {}) {
  const pair = normaliseScales(scales);
  if (!DEVICES.includes(device)) return pair;
  return { ...pair, [device]: clampScale(value, DEFAULT_SCALES[device]) };
}

/** Whether anything has been changed from the defaults, for a Reset to offer. */
export function isDefault(scales) {
  const pair = normaliseScales(scales);
  return (
    pair.desktop === DEFAULT_SCALES.desktop && pair.mobile === DEFAULT_SCALES.mobile
  );
}
