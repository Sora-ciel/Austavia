import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Asked 2026-10-28: "be able to click on the name of the playlist. All music
// will be written Playlist instead, and when you click it opens a page like
// the one you use in Single Note mode to search notes, but something simpler
// that just lists the different playlists, including the one playlist but this
// time called All music, with the amount of songs on the right."

const mode = readFileSync(new URL('../src/Modes/PlaylistMode.svelte', import.meta.url), 'utf8');

test('the playlist is chosen from its name, which opens the list -- there is no column of playlists', () => {
  assert.match(mode, /class="pl-title"[^>]*on:click=\{\(\) => \(pickerOpen = true\)\}/);
  assert.doesNotMatch(mode, /class="pl-sidebar"/);
});

// Changed the same day: "we'll go back to All music ... make the button have
// the name of what playlist you're on, and All music is one of those
// playlists ... you have the number of music like 'Track: 389'".
test('the button is named after the playlist open, All music being one of them, with its track count beside it', () => {
  assert.match(mode, /selectedPlaylist \? selectedPlaylist\.name : 'All music'/);
  assert.match(mode, /class="pl-track-count">\{playlistTrackCount\}/);
});

test('All music is in the list, first, with its count', () => {
  assert.match(mode, /\{ id: ALL_MUSIC, name: 'All music', count: tracks\.length/);
});

test('every playlist in the list shows how many songs it holds', () => {
  assert.match(mode, /count: playlist\.trackIds\.length/);
});

// Asked the same day: in a playlist other than All music, the button on each
// track that removed it "should be the same as if it was just in All music,
// without that button and change of styling". Removing is in the selection.
test('a playlist lists its tracks as All music does, with no add-or-remove button on each', () => {
  assert.doesNotMatch(mode, /toggleTrackInPlaylist\(/);
  assert.doesNotMatch(mode, /adds or removes/);
  assert.match(mode, /Remove from this playlist/);
});
