import { test } from 'node:test';
import assert from 'node:assert/strict';

import { folderIdOf, settingsForRename, settingsForCopy, settingsInPlaceOf, followLink } from '../src/utils/folderIdentity.js';
import { normalizeModeSettings } from '../src/utils/modeSettings.js';

// Nests, asked 2026-11-04 (PENDING, "Page mode, and nests"): folders are found
// in other folders "using a link to folders instead of actually being inside"
// -- and a link has to survive the folder being renamed.

test('a folder never renamed is known by its name, the same on every device', () => {
  assert.equal(folderIdOf('Damn', {}), 'legacy:Damn');
  assert.equal(folderIdOf('Damn', undefined), 'legacy:Damn');
});

test('a renamed folder is still the same folder, so a link to it still leads to it', () => {
  const renamed = settingsForRename({ simple: { columnCount: 2 } }, 'Damn');
  assert.equal(folderIdOf('Damn (new)', renamed), 'legacy:Damn');
  const twice = settingsForRename(renamed, 'Damn (new)');
  assert.equal(folderIdOf('Third', twice), 'legacy:Damn');
});

test('a duplicate is a different folder, with an id of its own', () => {
  const original = settingsForRename({}, 'Damn');
  assert.equal(folderIdOf('Damn 1', settingsForCopy(original)), 'legacy:Damn 1');
});

test('an import in place of a folder stays that folder', () => {
  const current = settingsForRename({}, 'Old');
  const imported = settingsForRename({}, 'Somewhere else');
  assert.equal(folderIdOf('Now', settingsInPlaceOf(imported, 'Now', current)), 'legacy:Old');
  assert.equal(folderIdOf('Now', settingsInPlaceOf(imported, 'Now', {})), 'legacy:Now');
});

test('the id is kept by the mode settings, and through a round trip', () => {
  const settings = normalizeModeSettings(settingsForRename({}, 'Damn'));
  assert.equal(folderIdOf('Renamed', normalizeModeSettings(settings)), 'legacy:Damn');
});

test('a link leads to the folder with its id, whatever it is called now, or nowhere', () => {
  const directory = [{ name: 'Renamed', id: 'legacy:Damn' }, { name: 'Other', id: 'legacy:Other' }];
  assert.equal(followLink({ folderId: 'legacy:Damn', name: 'Damn' }, directory).name, 'Renamed');
  assert.equal(followLink({ folderId: 'legacy:Gone', name: 'Gone' }, directory), null);
});

import { folderCard } from '../src/utils/folderDirectory.js';

test('a folder\'s tile shows its wallpaper, or else its first picture', () => {
  const withWallpaper = { modeSettings: { default: { backgroundImage: 'data:image/png;base64,AA' } }, blocks: [{ type: 'image', src: 'https://x/y.png' }] };
  assert.equal(folderCard('A', withWallpaper).cover, 'data:image/png;base64,AA');
  assert.equal(folderCard('B', { blocks: [{ type: 'text' }, { type: 'image', src: 'https://x/y.png' }] }).cover, 'https://x/y.png');
  assert.equal(folderCard('C', { blocks: [{ type: 'image', src: { type: 'storage' } }] }).cover, '');
  assert.equal(folderCard('D', {}).id, 'legacy:D');
});
