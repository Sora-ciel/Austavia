import { test } from 'node:test';
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
  isDefault
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

test('a computer starts at 109, which is the number the slider found', () => {
  // "I have seen that 109% on PC so let's make this the new PC default." The
  // setting was asked for partly to find this, so the number living here is
  // the point rather than an afterthought.
  assert.equal(DEFAULT_SCALES.desktop, 109);
  assert.equal(DEFAULT_SCALES.mobile, DEFAULT_SCALE, 'a phone waits for its own answer');
  assert.equal(scaleFor({ width: 1440, scales: undefined }), 109, 'with nothing stored at all');
  assert.equal(scaleFor({ width: 390, scales: undefined }), 100);
});

test('the two defaults are what Reset goes back to, not a flat 100', () => {
  assert.equal(isDefault(DEFAULT_SCALES), true);
  assert.equal(isDefault({ desktop: 100, mobile: 100 }), false, '100 on a computer is a choice now');
  assert.equal(isDefault({ desktop: 109, mobile: 110 }), false);
});

test('a preference that cannot be read goes back to the default', () => {
  // It is a text size. There is nothing here worth refusing to start over.
  assert.deepEqual(readScales('not json'), DEFAULT_SCALES);
  assert.deepEqual(readScales(''), DEFAULT_SCALES);
  assert.deepEqual(readScales(null), DEFAULT_SCALES);
  assert.deepEqual(readScales('null'), DEFAULT_SCALES);
  assert.deepEqual(readScales('{"desktop":"huge"}'), DEFAULT_SCALES);
});

test('a preference stored by an older build is read as far as it goes', () => {
  // Half a pair is not a broken pair, and the half that is missing takes that
  // device's own default rather than a shared one.
  assert.deepEqual(readScales('{"desktop":120}'), { desktop: 120, mobile: 100 });
  assert.deepEqual(normaliseScales({ mobile: 140 }), { desktop: 109, mobile: 140 });
});

test('a stored size from outside the slider is brought back inside it', () => {
  // Hand-edited storage, or a build whose ends were further apart.
  assert.deepEqual(readScales('{"desktop":400,"mobile":5}'), {
    desktop: MAX_SCALE,
    mobile: MIN_SCALE
  });
});

test('asking to change a device that does not exist changes nothing', () => {
  const pair = { desktop: 110, mobile: 120 };
  assert.deepEqual(withScale(pair, { device: 'tablet', value: 200 }), pair);
  assert.deepEqual(withScale(pair, {}), pair);
  assert.deepEqual(withScale(pair), pair);
});
