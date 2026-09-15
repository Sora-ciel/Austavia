import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isImage, imagesFrom, hasImage } from '../src/utils/pastedImages.js';

// Named after the request: "on phone it says that Austavia doesn't permit to
// paste an image like that. So we need to allow it."

const file = (name, type, size = 10) => ({ name, type, size });
const item = (type, produces) => ({ kind: 'file', type, getAsFile: () => produces });

test('a picture pasted into a note is found', () => {
  const found = imagesFrom({ files: [file('shot.png', 'image/png')] });
  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'shot.png');
});

test('a picture is found when the clipboard only offers items', () => {
  // A WebView often fills `items` and leaves `files` empty, which is why this
  // cannot just read one of them.
  const picture = file('from-items.jpg', 'image/jpeg');
  assert.deepEqual(imagesFrom({ items: [item('image/jpeg', picture)] }), [picture]);
});

test('the same picture in both lists is pasted once', () => {
  const picture = file('shot.png', 'image/png', 4096);
  const found = imagesFrom({ files: [picture], items: [item('image/png', picture)] });
  assert.equal(found.length, 1);
});

test('two different pictures are both pasted', () => {
  const found = imagesFrom({
    files: [file('one.png', 'image/png', 10), file('two.png', 'image/png', 20)]
  });
  assert.equal(found.length, 2);
});

test('pasting writing is still pasting writing', () => {
  // The handler has to say no to these, or every ordinary paste gets swallowed
  // by the code looking for pictures.
  assert.equal(hasImage({ items: [{ kind: 'string', type: 'text/plain' }] }), false);
  assert.equal(hasImage({ files: [file('notes.txt', 'text/plain')] }), false);
  assert.equal(hasImage({}), false);
  assert.equal(hasImage(null), false);
  assert.equal(hasImage(), false);
});

test('something claiming to be a picture that produces nothing is dropped', () => {
  // Rather than passed on as a hole for the caller to trip over.
  assert.deepEqual(imagesFrom({ items: [item('image/png', null)] }), []);
  assert.deepEqual(imagesFrom({ items: [{ kind: 'file', type: 'image/png' }] }), []);
});

test('a file with no type is not assumed to be a picture', () => {
  assert.equal(isImage(undefined), false);
  assert.equal(isImage(''), false);
  assert.equal(isImage('application/pdf'), false);
  assert.equal(isImage('image/png'), true);
  assert.equal(isImage('image/svg+xml'), true);
});
