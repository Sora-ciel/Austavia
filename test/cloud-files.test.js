// A folder's pictures made its own: for export, duplicate and rename.
//
// Asked for on 2026-10-05: exports should carry "the background images", and
// duplicating or renaming a folder must not leave it sharing pictures with
// another name's cloud path -- deleting that path deletes them.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { cloudLinksIn, withLinksReplaced, isCloudFile } from '../src/utils/cloudFiles.js';

const CLOUD = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/attachments%2FDamn%2Fa%2Fsrc.png?alt=media&token=1';
const CLOUD2 = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/attachments%2FDamn%2Fb%2Fcontent.jpg?alt=media&token=2';
const WALL = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/attachments%2FDamn%2Fmode-settings%2Fwall.jpg?alt=media';
const SONG = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/attachments%2FDamn%2Fm%2FtrackUrl.mp3?alt=media';

const folder = {
  blocks: [
    { id: 'a', type: 'image', src: CLOUD },
    { id: 'b', type: 'text', content: `<p>hi</p><img src="${CLOUD2}"><img src="https://example.com/x.png">` },
    { id: 't', type: 'task', tasks: [{ id: 1, text: `<img src="${CLOUD}">` }] },
    { id: 'm', type: 'music', trackUrl: SONG }
  ],
  modeSettings: { default: { backgroundImage: WALL, bgOpacity: 80 } }
};

describe("finding a folder's cloud files", () => {
  it('finds pictures in blocks, in writing and in tasks, and the wallpaper -- not other sites', () => {
    assert.deepEqual(cloudLinksIn(folder).sort(), [CLOUD, CLOUD2, WALL].sort());
    assert.equal(isCloudFile('https://example.com/x.png'), false);
  });

  it('sound only when asked for, since it makes an export file large', () => {
    assert.ok(cloudLinksIn(folder, { audio: true }).includes(SONG));
    assert.ok(!cloudLinksIn(folder).includes(SONG));
  });
});

describe('putting them back as data', () => {
  it('replaces every place a link was, and leaves the rest alone', () => {
    const map = new Map([[CLOUD, 'data:a'], [CLOUD2, 'data:b'], [WALL, 'data:w']]);
    const out = withLinksReplaced(folder, map);
    assert.equal(out.blocks[0].src, 'data:a');
    assert.equal(out.blocks[1].content, '<p>hi</p><img src="data:b"><img src="https://example.com/x.png">');
    assert.equal(out.blocks[2].tasks[0].text, '<img src="data:a">');
    assert.equal(out.blocks[3].trackUrl, SONG);
    assert.deepEqual(out.modeSettings.default, { backgroundImage: 'data:w', bgOpacity: 80 });
  });

  it('adds no fields a block did not have', () => {
    const out = withLinksReplaced({ blocks: [{ id: 'x', type: 'clock' }] }, new Map());
    assert.deepEqual(out.blocks[0], { id: 'x', type: 'clock' });
  });
});
