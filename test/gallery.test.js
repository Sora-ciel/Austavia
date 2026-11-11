import { test } from 'node:test';
import assert from 'node:assert/strict';

import { galleryOf } from '../src/utils/gallery.js';

// The viewer shows every picture of what is open, and knows which block each
// is, so it can crop that block (asked 2026-11-10).
test('the viewer gets every picture in order, which block each is, and starts on the one pressed', () => {
  const blocks = [
    { id: 'a', type: 'image', src: 'https://x/a.png' },
    { id: 't', type: 'text' },
    { id: 'b', type: 'image', src: { type: 'storage' }, resolvedSrc: 'https://x/b.png', crop: { x: 0, y: 0, w: 0.5, h: 1 } },
    { id: 'c', type: 'image', src: '' }
  ];
  const g = galleryOf(blocks, 'https://x/b.png');
  assert.deepEqual(g.images, ['https://x/a.png', 'https://x/b.png']);
  assert.deepEqual(g.blockIds, ['a', 'b']);
  assert.equal(g.start, 1);
  assert.deepEqual(Object.keys(g.crops), ['b']);
});

test('a picture with no block around it is still shown', () => {
  assert.deepEqual(galleryOf([], 'https://x/z.png'), { images: ['https://x/z.png'], blockIds: [], crops: {}, start: 0 });
});
