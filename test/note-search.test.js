// Finding a note from Single Note mode.
//
// Asked for on 2026-10-05: "put the case that shows the note's title before
// the 'Words:', then when someone clicks on that title it will open a
// searching page that will show the notes in that folder first and the notes
// in other folders after a separator." What follows was wanted.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { noteTitle, searchNotes } from '../src/utils/noteSearch.js';

const note = (id, content) => ({ id, content });

describe('a note\'s name', () => {
  it('is its first line', () => {
    assert.equal(noteTitle('<p>Shopping</p><p>milk</p>'), 'Shopping');
  });

  it('is cut short when the first line is long', () => {
    assert.equal(noteTitle('<p>' + 'a'.repeat(40) + '</p>'), 'a'.repeat(28) + '…');
  });

  it('is "Note N" while it has no writing', () => {
    assert.equal(noteTitle('', 2), 'Note 3');
  });
});

describe('the search page', () => {
  const here = [note('a', '<p>Shopping</p><p>milk, eggs</p>'), note('b', '<p>Ideas</p>')];
  const elsewhere = [
    { folder: 'Work', notes: [note('w1', '<p>Meeting</p><p>buy milk for the office</p>')] },
    { folder: 'Home', notes: [note('h1', '<p>Garden</p>')] }
  ];

  it("shows this folder's notes first, in the folder's order, then the other folders'", () => {
    const result = searchNotes({ currentFolder: 'Notes', here, elsewhere });
    assert.deepEqual(result.here.map(n => n.id), ['a', 'b']);
    assert.deepEqual(result.elsewhere.map(n => [n.folder, n.id]), [['Home', 'h1'], ['Work', 'w1']]);
  });

  it('finds a note by any word in its writing, not only its name', () => {
    const result = searchNotes({ currentFolder: 'Notes', here, elsewhere, query: 'MILK' });
    assert.deepEqual(result.here.map(n => n.id), ['a']);
    assert.deepEqual(result.elsewhere.map(n => n.id), ['w1']);
  });

  it('needs every word of the search, in any order', () => {
    const result = searchNotes({ currentFolder: 'Notes', here, elsewhere, query: 'office milk' });
    assert.deepEqual(result.here, []);
    assert.deepEqual(result.elsewhere.map(n => n.id), ['w1']);
  });

  it('never lists the open folder twice', () => {
    const result = searchNotes({ currentFolder: 'Work', here: [], elsewhere });
    assert.deepEqual(result.elsewhere.map(n => n.folder), ['Home']);
  });

  it('gives each note the line after its name, to tell similar notes apart', () => {
    const result = searchNotes({ currentFolder: 'Notes', here, elsewhere });
    assert.equal(result.here[0].snippet, 'milk, eggs');
  });
});
