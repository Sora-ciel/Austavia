// Moving folders in and out as files, and naming new folders.
//
// Asked for on 2026-10-05: export and import should carry the folders'
// settings, their pictures and the themes, and let you choose what to import
// -- into a new folder by default, keeping its name: "if you export a folder
// named Damn and import it, call it Damn if there's no Damn yet. If there's
// already a Damn, call it Damn 1, and if there's already a Damn 1, call it
// Damn 2." What follows was wanted.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { uniqueName, nameFromFile, buildExport, readExport, planImport, EXPORT_FORMAT } from '../src/utils/folderTransfer.js';

describe('naming a new folder', () => {
  it('keeps the name when nothing has it', () => {
    assert.equal(uniqueName('Damn', ['Work']), 'Damn');
  });

  it('Damn becomes Damn 1 when there is a Damn, and Damn 2 when there is a Damn 1 as well', () => {
    assert.equal(uniqueName('Damn', ['Damn']), 'Damn 1');
    assert.equal(uniqueName('Damn', ['Damn', 'Damn 1']), 'Damn 2');
  });

  it('a name already ending in a number counts on from it', () => {
    assert.equal(uniqueName('Damn 1', ['Damn', 'Damn 1']), 'Damn 2');
  });

  it('takes the name the file was saved under, without .json or a browser\'s (2)', () => {
    assert.equal(nameFromFile('Damn.json'), 'Damn');
    assert.equal(nameFromFile('Damn (2).json'), 'Damn');
  });
});

describe('the export file', () => {
  const folder = { name: 'Damn', blocks: [{ id: 'a' }], modeOrders: { default: ['a'] }, modeSettings: { simple: { columnCount: 3 } } };

  it('carries the folders, and their settings and the themes only when asked', () => {
    const plain = buildExport({ folders: [folder], include: {}, now: 0 });
    assert.equal(plain.format, EXPORT_FORMAT);
    assert.equal(plain.folders[0].name, 'Damn');
    assert.equal('modeSettings' in plain.folders[0], false);
    assert.equal('themes' in plain, false);

    const full = buildExport({ folders: [folder], include: { settings: true, themes: true }, themes: { custom: [{ id: 't', name: 'Mine' }], selectedId: 't' }, now: 0 });
    assert.deepEqual(full.folders[0].modeSettings, { simple: { columnCount: 3 } });
    assert.deepEqual(full.themes, { custom: [{ id: 't', name: 'Mine' }], selectedId: 't' });
  });

  it('reads back what it wrote', () => {
    const text = JSON.stringify(buildExport({ folders: [folder], include: { settings: true }, now: 0 }));
    const read = readExport(text, 'whatever.json');
    assert.equal(read.legacy, false);
    assert.equal(read.folders[0].name, 'Damn');
  });

  it('still reads a file from before, as one folder named after the file', () => {
    const old = readExport(JSON.stringify({ blocks: [{ id: 'a' }], modeOrders: {}, modeSettings: {} }), 'Damn.json');
    assert.equal(old.legacy, true);
    assert.equal(old.folders[0].name, 'Damn');
    const older = readExport(JSON.stringify([{ id: 'a' }]), 'Damn.json');
    assert.equal(older.folders[0].blocks.length, 1);
  });

  it('says so when a file is not one of ours', () => {
    assert.ok(readExport('not json', 'x.json').error);
    assert.ok(readExport(JSON.stringify({ hello: 1 }), 'x.json').error);
  });
});

describe('importing', () => {
  const file = readExport(JSON.stringify(buildExport({
    folders: [
      { name: 'Damn', blocks: [{ id: 'a' }], modeOrders: {}, modeSettings: { simple: { columnCount: 3 } } },
      { name: 'Work', blocks: [{ id: 'w' }], modeOrders: {}, modeSettings: null }
    ],
    include: { settings: true, themes: true },
    themes: { custom: [{ id: 't', name: 'Mine' }], selectedId: 't' },
    now: 0
  })), 'x.json');

  it('goes into new folders by default, each keeping its name or taking the next number', () => {
    const plan = planImport({ file, existingFolders: ['Damn'] });
    assert.deepEqual(plan.writes.map(w => [w.name, w.replaces]), [['Damn 1', false], ['Work', false]]);
  });

  it('two folders of the same name in one file do not take the same name', () => {
    const twice = { folders: [{ name: 'Damn', blocks: [] }, { name: 'Damn', blocks: [] }], themes: null };
    assert.deepEqual(planImport({ file: twice, existingFolders: [] }).writes.map(w => w.name), ['Damn', 'Damn 1']);
  });

  it('takes only the folders chosen, with or without their settings', () => {
    const plan = planImport({ file, folders: ['Work'], settings: false, existingFolders: [] });
    assert.deepEqual(plan.writes.map(w => w.name), ['Work']);
    assert.equal(plan.writes[0].modeSettings, null);
  });

  it('can put one folder in place of the open one, keeping its settings unless they are brought', () => {
    const plan = planImport({ file, folders: ['Damn'], target: 'replace', currentFolder: 'Open', settings: false });
    assert.deepEqual(plan.writes.map(w => [w.name, w.replaces]), [['Open', true]]);
    assert.equal(plan.writes[0].modeSettings, undefined);
    assert.ok(planImport({ file, target: 'replace', currentFolder: 'Open' }).error, 'two folders cannot both replace one');
  });

  it("adds the file's themes under names no theme has, or none when they are not wanted", () => {
    assert.deepEqual(planImport({ file, existingThemeNames: ['Mine'] }).themes.map(t => t.name), ['Mine 1']);
    assert.deepEqual(planImport({ file, themes: false }).themes, []);
  });
});
