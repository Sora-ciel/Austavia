import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pictureBlocksKept, pictureUrl } from '../src/utils/pictureStore.js';

// Reported 2026-11-25, and wanted: "the image changes still makes it slow on
// android" -- typing near pictures. Measured at a phone's speed beside six
// photo blocks: 28 freezes in 60 letters, the longest 350ms, because picture
// blocks still kept their photo inside the folder and every save carried it.
// By reference: one, 53ms. (PENDING 2, step 3.)

const photo = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
const keep = async src => (src.startsWith('data:image/') ? 'austavia-picture:abc' : src);

test('a picture block holding its photo is moved onto a reference', async () => {
  const changed = await pictureBlocksKept([{ id: 'p', type: 'image', src: photo }], keep);
  assert.deepEqual(changed.get('p'), { from: photo, to: 'austavia-picture:abc' });
});

test('a video, a cloud link, a reference already, or writing are left as they are', async () => {
  const changed = await pictureBlocksKept([
    { id: 'v', type: 'image', src: 'data:video/mp4;base64,AAAA' },
    { id: 'l', type: 'image', src: 'https://firebasestorage.googleapis.com/x' },
    { id: 'r', type: 'image', src: 'austavia-picture:abc' },
    { id: 't', type: 'text', src: photo }
  ], keep);
  assert.equal(changed.size, 0);
});

test('a picture that cannot be kept is left inside the block, not lost', async () => {
  const changed = await pictureBlocksKept([{ id: 'p', type: 'image', src: photo }], async src => src);
  assert.equal(changed.size, 0);
});

test('anything that is not a reference is shown as it is', () => {
  assert.equal(pictureUrl(photo), photo);
  assert.equal(pictureUrl('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(pictureUrl(''), '');
});
