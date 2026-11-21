// Asked 2026-11-21: "when exporting. it should take count of what is nested.
// and ask if you want to export what is nested on the first level too. or to
// the level you want. or all nested ... so 4 options. no nest, nest to 1
// level. nest to ... level (you can choose up to max), nest max (shows the
// number that is the max)".
import test from 'node:test';
import assert from 'node:assert/strict';
import { nestedFolderIds, foldersWithNests } from '../src/utils/nestedExport.js';

const nest = (...ids) => ({ type: 'nest', links: ids.map(id => ({ folderId: id })) });
// Home nests Work and Trips; Work nests Clients; Clients nests Acme; Acme nests Home again.
const folders = {
  Home: { blocks: [{ type: 'text' }, nest('work', 'trips')] },
  Work: { blocks: [nest('clients'), { type: 'nest', links: [{ pageId: 'p1' }] }] },
  Trips: { blocks: [] },
  Clients: { blocks: [nest('acme', 'gone')] },
  Acme: { blocks: [nest('home')] }
};
const directory = [
  { id: 'home', name: 'Home' }, { id: 'work', name: 'Work' }, { id: 'trips', name: 'Trips' },
  { id: 'clients', name: 'Clients' }, { id: 'acme', name: 'Acme' }
];
const load = async name => folders[name];
const upTo = depth => foldersWithNests({ start: ['Home'], depth, load, directory });

test('what a folder nests is the folders its nests link to, not its own pages', () => {
  assert.deepEqual(nestedFolderIds(folders.Work), ['clients']);
  assert.deepEqual(nestedFolderIds(folders.Home), ['work', 'trips']);
});

test('no nest: only the folder itself', async () => {
  assert.deepEqual((await upTo(0)).names, ['Home']);
});

test('nest to 1 level: the folders its nests link to as well', async () => {
  assert.deepEqual((await upTo(1)).names, ['Home', 'Work', 'Trips']);
});

test('nest to a chosen level: a folder in a nest inside a nested folder, at level 2', async () => {
  assert.deepEqual((await upTo(2)).names, ['Home', 'Work', 'Trips', 'Clients']);
});

test('nest max: everything, and how many levels that is', async () => {
  const all = await upTo(Infinity);
  assert.deepEqual(all.names, ['Home', 'Work', 'Trips', 'Clients', 'Acme']);
  assert.equal(all.deepest, 3);
});

test('a nest that leads back round is followed once', async () => {
  const all = await upTo(Infinity);
  assert.equal(all.names.filter(name => name === 'Home').length, 1);
});

test('a folder with no nests has no levels to offer', async () => {
  const none = await foldersWithNests({ start: ['Trips'], depth: Infinity, load, directory });
  assert.deepEqual(none, { names: ['Trips'], deepest: 0 });
});
