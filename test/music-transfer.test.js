// Asked for on 2026-10-06: "add the option to export and import our music from
// the playlist mode" -- into the toolbar's Export and Import, beside folders
// and themes. Playlist mode's own music file and the toolbar's export use the
// same zip, so either opens in either. See src/utils/musicTransfer.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MUSIC_MANIFEST,
  archiveFileName,
  describeMusic,
  mergeMusicLibrary,
  packMusic,
  readMusicManifest,
  unpackMusic
} from '../src/utils/musicTransfer.js';

// Enough of JSZip's file() for these: by name, or by pattern.
function fakeZip() {
  const files = new Map();
  const entry = data => ({ async: async () => data });
  return {
    files,
    file(name, data) {
      if (name instanceof RegExp) return [...files.keys()].filter(key => name.test(key)).map(key => entry(files.get(key)));
      if (data === undefined) return files.has(name) ? entry(files.get(name)) : null;
      files.set(name, data);
      return this;
    }
  };
}

describe('music in a file', () => {
  const library = {
    tracks: [
      { id: 't1', title: 'One', fileName: 'one.flac' },
      { id: 't2', title: 'Two' },
      { id: 'gone', title: 'Only on the phone' }
    ],
    playlists: [{ id: 'p', name: 'Mix', trackIds: ['t1', 't2'] }]
  };
  const audio = { t1: 'AUDIO1', t2: 'AUDIO2' };

  it('carries every track this device has the audio of, with its cover and the playlists', async () => {
    const zip = fakeZip();
    const count = await packMusic(zip, library, { loadTrack: async id => audio[id] || null, loadCover: async id => (id === 't1' ? 'COVER' : null) });
    assert.equal(count, 2);
    assert.ok(zip.files.has('audio/t1__one.flac'), 'a flac stays a flac');
    assert.ok(zip.files.has('audio/t2__Two.mp3'));
    assert.equal(zip.files.get('covers/t1'), 'COVER');
    const manifest = JSON.parse(zip.files.get(MUSIC_MANIFEST));
    assert.deepEqual(manifest.tracks.map(t => t.id), ['t1', 't2']);
    assert.equal(manifest.playlists[0].name, 'Mix');
  });

  it('comes back on another device, added to the music already there', async () => {
    const zip = fakeZip();
    await packMusic(zip, library, { loadTrack: async id => audio[id] || null });
    const manifest = await readMusicManifest(zip);
    const saved = {};
    const imported = await unpackMusic(zip, manifest, { saveTrack: async (id, blob) => { saved[id] = blob; } });
    assert.deepEqual(saved, { t1: 'AUDIO1', t2: 'AUDIO2' });

    const here = { tracks: [{ id: 'mine', title: 'Mine' }], playlists: [] };
    const after = mergeMusicLibrary(here, manifest, imported);
    assert.deepEqual(after.tracks.map(t => t.id), ['mine', 't1', 't2']);
    assert.equal(after.playlists.length, 1);
  });

  it('a zip with no music says so', async () => {
    assert.equal(await readMusicManifest(fakeZip()), null);
  });

  it('is described in the dialog by what it holds', () => {
    assert.equal(describeMusic(library), '3 tracks, 1 playlist');
    assert.equal(describeMusic({ tracks: [{ id: 'a' }], playlists: [] }), '1 track');
  });

  it('keeps a file name it was given', () => {
    assert.equal(archiveFileName({ id: 'x', fileName: 'song.m4a' }), 'song.m4a');
  });
});
