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

test('the whole library reads "Playlist" as the title, and "All music" in the list, first, with its count', () => {
  assert.match(mode, /selectedPlaylist \? selectedPlaylist\.name : 'Playlist'/);
  assert.match(mode, /\{ id: ALL_MUSIC, name: 'All music', count: tracks\.length/);
});

test('every playlist in the list shows how many songs it holds', () => {
  assert.match(mode, /count: playlist\.trackIds\.length/);
});
