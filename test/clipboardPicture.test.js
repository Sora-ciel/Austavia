import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pictureTypeIn,
  pictureAmong,
  canReadClipboard,
  pictureAction,
  typeOfDataUrl,
  PREFERRED_TYPES
} from '../src/utils/clipboardPicture.js';

// Named after the report: "on mobile app I can't paste images in Single Note
// mode -- but I tried and even on the site on Chrome", with a screenshot of
// Gboard saying "Chrome no permite pegar imágenes aquí".
//
// That message is the keyboard's, about the app it is typing into. In the
// Android app the declaration is ours to make and we make it; in Chrome it is
// Chrome's, and Chrome said no. Nothing here can change Chrome's mind, so this
// is the route that does not go through the keyboard at all.

test('a screenshot is preferred, because a screenshot is what gets pasted', () => {
  assert.equal(pictureTypeIn(['text/plain', 'image/png']), 'image/png');
  assert.equal(pictureTypeIn(['image/jpeg', 'image/png']), 'image/png', 'png over jpeg');
  assert.equal(pictureTypeIn(['image/gif', 'image/jpeg']), 'image/jpeg', 'jpeg over gif');
});

test('an image type nobody listed is still taken', () => {
  // Better to hand it to the browser and let it refuse than to refuse it here.
  assert.equal(pictureTypeIn(['text/html', 'image/avif']), 'image/avif');
});

test('a clipboard holding only writing is not a picture', () => {
  assert.equal(pictureTypeIn(['text/plain', 'text/html']), null);
  assert.equal(pictureTypeIn([]), null);
  assert.equal(pictureTypeIn(null), null);
  assert.equal(pictureTypeIn(['image', 'imagery/png']), null, 'not fooled by a near miss');
});

test('the first entry that holds a picture is the one taken', () => {
  const items = [
    { types: ['text/plain'] },
    { types: ['text/html', 'image/jpeg'] },
    { types: ['image/png'] }
  ];
  const found = pictureAmong(items);
  assert.equal(found.type, 'image/jpeg');
  assert.equal(found.item, items[1]);
  assert.equal(pictureAmong([{ types: ['text/plain'] }]), null);
  assert.equal(pictureAmong([]), null);
  assert.equal(pictureAmong(null), null);
});

test('a clipboard that cannot be read is not an error, it is the picker', () => {
  // The whole shape of this. Every reason the clipboard might not oblige has
  // the same sensible answer, because the person pressed a button meaning "put
  // a picture here" and deserves one either way.
  assert.equal(pictureAction({ canRead: false }), 'pick');
  assert.equal(pictureAction({ canRead: true, failed: true }), 'pick', 'permission refused');
  assert.equal(pictureAction({ canRead: true, found: false }), 'pick', 'nothing on it');
  assert.equal(pictureAction(), 'pick');
});

test('a picture actually on the clipboard goes straight in', () => {
  assert.equal(pictureAction({ canRead: true, found: true }), 'insert');
});

test('whether the clipboard can be read at all is asked, not assumed', () => {
  assert.equal(canReadClipboard({ read: () => {} }), true);
  assert.equal(canReadClipboard({ writeText: () => {} }), false, 'writing is not reading');
  assert.equal(canReadClipboard(undefined), false);
  assert.equal(canReadClipboard(null), false);
});

test('a data URL says what it is, and junk says nothing', () => {
  assert.equal(typeOfDataUrl('data:image/png;base64,AAAA'), 'image/png');
  assert.equal(typeOfDataUrl('data:image/jpeg,AAAA'), 'image/jpeg');
  assert.equal(typeOfDataUrl('data:text/plain;base64,AAAA'), '', 'not a picture');
  assert.equal(typeOfDataUrl('nonsense'), '');
  assert.equal(typeOfDataUrl(null), '');
});

test('the preference order is written down, so changing it is a decision', () => {
  assert.deepEqual(PREFERRED_TYPES, ['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
});
