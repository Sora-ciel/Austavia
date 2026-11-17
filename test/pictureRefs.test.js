// Pictures in writing stored by reference (src/utils/pictureRefs.js).
//
// Asked 2026-11-17: "do the image change" -- PENDING section 2 -- so writing
// in a heavy folder does not lag. A note with a photograph carried 1.5M+
// characters of it on every keystroke, save and undo step.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPictureRef, refFor, hashOfRef, pictureRefsIn, dataPicturesIn, withPictureSources, holdsInlinePictures
} from '../src/utils/pictureRefs.js';

const PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(2000);

test('a note keeps a short reference where the picture was', () => {
  const html = `<p>hello</p><p><img src="${PHOTO}" width="300px"></p>`;
  const ref = refFor('abc_123-XYZ');
  const out = withPictureSources(html, new Map([[PHOTO, ref]]));
  assert.equal(out, `<p>hello</p><p><img src="${ref}" width="300px"></p>`);
  assert.ok(out.length < 100, 'a few dozen characters, not thousands');
  assert.deepEqual(pictureRefsIn(out), [ref]);
  assert.equal(holdsInlinePictures(out), false);
});

test('pictures still inside the writing are found, once each', () => {
  const html = `<img src="${PHOTO}"><img src='${PHOTO}'><img src="https://x/y.png">`;
  assert.deepEqual(dataPicturesIn(html), [PHOTO]);
  assert.equal(holdsInlinePictures(html), true);
});

test('only a well-formed reference is one', () => {
  assert.equal(isPictureRef(refFor('a1')), true);
  assert.equal(hashOfRef(refFor('a1')), 'a1');
  for (const bad of ['', 'austavia-picture:', 'austavia-picture:a/b', 'data:image/png;base64,x', null]) {
    assert.equal(isPictureRef(bad), false, String(bad));
  }
});
