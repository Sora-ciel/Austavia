// Handing a file to the person, on a phone and on a computer.
//
// Reported on 2026-10-05: "the screenshot button doesn't seem to work well on
// mobile -- the download and the copy. I can't find the downloaded file, and
// neither the copied one. ... show a thing as if it was share on phone, and
// include gallery, so you can save it in the gallery". Android's WebView does
// not act on a web download. What follows was wanted.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deliveryRoute } from '../src/utils/fileDelivery.js';

describe('how a screenshot or an export reaches you', () => {
  it('on the Android app, through the share sheet -- where Photos, Files and the rest can take it', () => {
    assert.equal(deliveryRoute({ nativeAndroid: true }), 'share');
  });

  it('on a computer or in a browser, as a download, which works there', () => {
    assert.equal(deliveryRoute({ nativeAndroid: false }), 'download');
  });
});
