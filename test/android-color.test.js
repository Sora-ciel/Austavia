// The timer notification in the theme's colours.
//
// Asked for on 2026-10-05: "hopefully it follows the colour of the themes and
// has the buttons like our pop-up". Android reads #AARRGGBB; the themes are
// written in CSS.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { toAndroidColor } from '../src/utils/androidColor.js';

describe('a theme colour, as Android reads it', () => {
  it('takes the hex forms CSS writes, with the alpha moved to the front', () => {
    assert.equal(toAndroidColor('#17171a'), '#FF17171A');
    assert.equal(toAndroidColor('#fff'), '#FFFFFFFF');
    assert.equal(toAndroidColor('#111111f0'), '#F0111111');
  });

  it('takes rgb() and rgba()', () => {
    assert.equal(toAndroidColor('rgb(255, 92, 200)'), '#FFFF5CC8');
    assert.equal(toAndroidColor('rgba(0, 0, 0, 0.5)'), '#80000000');
  });

  it('a see-through theme\'s backing comes out solid for the notification\'s background', () => {
    assert.equal(toAndroidColor('rgba(12, 12, 14, 0.78)', { opaque: true }), '#FF0C0C0E');
  });

  it('leaves what it cannot read to the notification\'s own colours', () => {
    assert.equal(toAndroidColor('linear-gradient(135deg, #630ca2, #ff0080)'), null);
    assert.equal(toAndroidColor('var(--bg)'), null);
    assert.equal(toAndroidColor(''), null);
    assert.equal(toAndroidColor(undefined), null);
  });
});
