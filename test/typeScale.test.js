import {
  test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MOBILE_BREAKPOINT,
  DEFAULT_SCALE,
  MIN_SCALE,
  MAX_SCALE,
  DEFAULT_SCALES,
  clampScale,
  isCompactViewport,
  deviceFor,
  scaleFor,
  cssScale,
  normaliseScales,
  readScales,
  withScale,
  isDefault,
  BASE_SCALES,
  cssScaleFor,
  scalesToStore,
  rebaseStoredScales
} from '../src/utils/typeScale.js';

// Named after the request: "Add an advanced parameter in the settings that are
// in the controls, where you'll be able to change the size of the typo for all
// modes at the same time. But one for PC and one for mobile. I think it'll also
// help for me to find a good size for a default too."

test('there is one size for a computer and another for a phone', () => {
  const scales = { desktop: 100, mobile: 125 };
  assert.equal(scaleFor({ width: 1440, scales }), 100);
  assert.equal(scaleFor({ width: 390, scales }), 125);
});

test('which one is in force follows the layout on screen, not the machine', () => {
  // The app changes its whole layout at 1024px. A window narrower than that is
  // running the mobile layout whatever it is running on, so it gets the size
  // that layout was tuned at — and narrowing a window on a computer is then a
  // way to tune the phone's number without picking up a phone.
  assert.equal(deviceFor({ width: MOBILE_BREAKPOINT + 1 }), 'desktop');
  assert.equal(deviceFor({ width: MOBILE_BREAKPOINT }), 'mobile');
  assert.equal(deviceFor({ width: MOBILE_BREAKPOINT - 1 }), 'mobile');
});

test('a width nobody has measured yet is not a narrow window', () => {
  // `Number(null)` is 0, which is narrower than any phone. Shipping that once
  // made a toolbar collapse on a desktop, and it was a test rather than a look
  // that caught it.
  assert.equal(isCompactViewport({ width: null }), false);
  assert.equal(isCompactViewport({ width: undefined }), false);
  assert.equal(isCompactViewport({ width: NaN }), false);
  assert.equal(isCompactViewport({}), false);
  assert.equal(isCompactViewport(), false);
  assert.equal(deviceFor(), 'desktop', 'and the desktop number is what it falls back to');
});

test('changing one size leaves the other alone', () => {
  // The whole point of two numbers: setting the phone from a computer must not
  // quietly take the computer with it.
  const started = { desktop: 100, mobile: 100 };
  const changed = withScale(started, { device: 'mobile', value: 130 });
  assert.deepEqual(changed, { desktop: 100, mobile: 130 });
  assert.deepEqual(started, { desktop: 100, mobile: 100 }, 'and the original is untouched');
});

test('a size cannot be dragged past either end of the slider', () => {
  assert.equal(clampScale(MAX_SCALE + 50), MAX_SCALE);
  assert.equal(clampScale(MIN_SCALE - 50), MIN_SCALE);
  assert.equal(clampScale(118.4), 118, 'and it is a whole number');
});

test('a size that is not a number goes back to the default, not to nothing', () => {
  // Zero here would be writing with no writing.
  for (const nonsense of [null, undefined, '', 'big', NaN, {}, []]) {
    assert.equal(clampScale(nonsense), DEFAULT_SCALE);
  }
});

test('100 means whatever the browser was already going to use', () => {
  // Not "16 pixels". Somebody who has set a larger text size in their browser
  // keeps it, and this multiplies it rather than overruling them.
  assert.equal(cssScale(100), 1);
  assert.equal(cssScale(125), 1.25);
  assert.equal(cssScale(70), 0.7);
});

test('the multiplier is short enough to read in an inspector', () => {
  // 115/100 is exact, but a third of the range is not, and an unrounded ratio
  // lands in the stylesheet as fifteen digits.
  assert.equal(String(cssScale(133)).length <= 5, true, String(cssScale(133)));
});

test('the sizes the slider found are the base, and 100 is where it rests', () => {
  // Asked for: "make those text the base, then reset the ranges to 100%, so
  // that the text really is those defaults and now the range at 100% looks like
  // the real normal range." Both numbers came from living with the slider --
  // 109 on a computer, then 97 on a phone.
  assert.equal(BASE_SCALES.desktop, 109);
  assert.equal(BASE_SCALES.mobile, 97);
  assert.equal(DEFAULT_SCALES.desktop, DEFAULT_SCALE, 'the slider rests at neutral');
  assert.equal(DEFAULT_SCALES.mobile, DEFAULT_SCALE);
});

test('an untouched slider gives the base itself, on both kinds of screen', () => {
  // What "the text really is those defaults" has to mean: nothing stored, and
  // the writing comes out at exactly the size that was chosen.
  assert.equal(cssScaleFor({ width: 1440, scales: undefined }), 1.09);
  assert.equal(cssScaleFor({ width: 390, scales: undefined }), 0.97);
});

test('the same slider number means the same amount bigger on either screen', () => {
  // The lopsidedness this change removes. 120 used to be 120% outright, which
  // was +10% of the default on a computer and +20% on a phone.
  assert.equal(cssScaleFor({ width: 1440, scales: { desktop: 120 } }), 1.308);
  assert.equal(cssScaleFor({ width: 390, scales: { mobile: 120 } }), 1.164);
  assert.equal(1.308 / 1.09, 1.2);
  assert.equal(Math.round((1.164 / 0.97) * 100) / 100, 1.2);
});

test('the top of the slider is not clipped back to the base', () => {
  // The trap in doing this by multiplying two clamped numbers: 160 on a
  // computer is 174% outright, and clamping the product would quietly shorten
  // the travel on the screen with the most room for it.
  assert.equal(cssScaleFor({ width: 1440, scales: { desktop: MAX_SCALE } }), 1.744);
  assert.equal(cssScaleFor({ width: 1440, scales: { desktop: MIN_SCALE } }), 0.763);
});

test('Reset goes back to a flat 100 on both, which is now the whole of it', () => {
  assert.equal(isDefault(DEFAULT_SCALES), true);
  assert.equal(isDefault({ desktop: 100, mobile: 100 }), true);
  assert.equal(isDefault({ desktop: 109, mobile: 100 }), false, 'what used to be the default is a choice now');
});

// ── Reading what older builds wrote ──────────────────────────────
// The numbers changed meaning: they were percentages of the browser's own
// size, and they are multiples of the base now. Same digits, different
// meaning, which is the one change a stored value cannot survive on its own.

test('somebody sitting on the old default receives the new one', () => {
  // The point of the change. A phone that had never been touched read 100,
  // which meant 100% outright; it should now be the 97 base, not kept at 100.
  const migrated = readScales(JSON.stringify({ desktop: 109, mobile: 100 }));
  assert.deepEqual(migrated, { desktop: 100, mobile: 100 });
  assert.equal(cssScaleFor({ width: 390, scales: migrated }), 0.97, 'the phone actually moved');
  assert.equal(cssScaleFor({ width: 1440, scales: migrated }), 1.09, 'the computer did not');
});

test('somebody who had moved the slider keeps the size they chose', () => {
  // 130 on a computer meant 130% outright. Against a base of 109 the same size
  // is a slider at 119, and their writing must not jump on this release.
  const migrated = readScales(JSON.stringify({ desktop: 130, mobile: 120 }));
  assert.equal(migrated.desktop, 119);
  assert.equal(migrated.mobile, 124);
  // Within a rounding step of the size they actually had before.
  assert.ok(Math.abs(cssScaleFor({ width: 1440, scales: migrated }) - 1.3) < 0.01);
  assert.ok(Math.abs(cssScaleFor({ width: 390, scales: migrated }) - 1.2) < 0.01);
});

test('a pair written by this build is not rebased a second time', () => {
  // Without the stamp, a pair saved now looks exactly like one saved before,
  // and every reload would shrink it again.
  const saved = JSON.stringify(scalesToStore({ desktop: 100, mobile: 100 }));
  assert.deepEqual(readScales(saved), { desktop: 100, mobile: 100 });
  assert.deepEqual(readScales(JSON.stringify(scalesToStore(readScales(saved)))), {
    desktop: 100,
    mobile: 100
  });
});

test('a half-written old pair rebases the half it has', () => {
  assert.deepEqual(readScales('{"desktop":120}'), { desktop: 110, mobile: 100 });
});

test('a preference that cannot be read goes back to the default', () => {
  // It is a text size. There is nothing here worth refusing to start over.
  assert.deepEqual(readScales('not json'), DEFAULT_SCALES);
  assert.deepEqual(readScales(''), DEFAULT_SCALES);
  assert.deepEqual(readScales(null), DEFAULT_SCALES);
  assert.deepEqual(readScales('null'), DEFAULT_SCALES);
  assert.deepEqual(readScales('{"desktop":"huge"}'), DEFAULT_SCALES);
});

test('half a pair is not a broken pair', () => {
  // The half that is missing takes its own default rather than a shared one.
  assert.deepEqual(normaliseScales({ mobile: 140 }), { desktop: 100, mobile: 140 });
});

test('a stored size from outside the slider is brought back inside it', () => {
  // Hand-edited storage, or a build whose ends were further apart. The old
  // build would already have been *showing* the clamped size, so that is the
  // size to keep: 400 was being drawn at 160% outright, which against a base of
  // 109 is a slider at 147 -- 160% again, not 400 and not 160 of the new range.
  const brought = readScales('{"desktop":400,"mobile":5}');
  assert.deepEqual(brought, { desktop: 147, mobile: 72 });
  assert.ok(Math.abs(cssScaleFor({ width: 1440, scales: brought }) - MAX_SCALE / 100) < 0.01);
  assert.ok(Math.abs(cssScaleFor({ width: 390, scales: brought }) - MIN_SCALE / 100) < 0.01);
});

test('asking to change a device that does not exist changes nothing', () => {
  const pair = { desktop: 110, mobile: 120 };
  assert.deepEqual(withScale(pair, { device: 'tablet', value: 200 }), pair);
  assert.deepEqual(withScale(pair, {}), pair);
  assert.deepEqual(withScale(pair), pair);
});
