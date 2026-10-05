// Finding a note from Single Note mode.
//
// Asked for on 2026-10-05: "put the case that shows the note's title before
// the 'Words:', then when someone clicks on that title it will open a
// searching page that will show the notes in that folder first and the notes
// in other folders after a separator." What follows was wanted.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { noteTitle, searchNotes, lastPicture, shelfView } from '../src/utils/noteSearch.js';

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
    assert.deepEqual(result.elsewhere.map(g => [g.folder, g.notes.map(n => n.id)]), [['Home', ['h1']], ['Work', ['w1']]]);
  });

  // "Show each folder as a category with its notes inside. Of course if a
  // folder doesn't have a note then don't show it." -- 2026-10-05.
  it('shows each other folder as a heading with its notes under it, and leaves out a folder with none', () => {
    const result = searchNotes({ currentFolder: 'Notes', here, elsewhere: [...elsewhere, { folder: 'Empty', notes: [] }] });
    assert.deepEqual(result.elsewhere.map(g => g.folder), ['Home', 'Work']);
  });

  it('leaves out a folder whose notes the search does not find', () => {
    const result = searchNotes({ currentFolder: 'Notes', here, elsewhere, query: 'office' });
    assert.deepEqual(result.elsewhere.map(g => g.folder), ['Work']);
  });

  it('finds a note by any word in its writing, not only its name', () => {
    const result = searchNotes({ currentFolder: 'Notes', here, elsewhere, query: 'MILK' });
    assert.deepEqual(result.here.map(n => n.id), ['a']);
    assert.deepEqual(result.elsewhere.flatMap(g => g.notes).map(n => n.id), ['w1']);
  });

  it('needs every word of the search, in any order', () => {
    const result = searchNotes({ currentFolder: 'Notes', here, elsewhere, query: 'office milk' });
    assert.deepEqual(result.here, []);
    assert.deepEqual(result.elsewhere.flatMap(g => g.notes).map(n => n.id), ['w1']);
  });

  it('never lists the open folder twice', () => {
    const result = searchNotes({ currentFolder: 'Work', here: [], elsewhere });
    assert.deepEqual(result.elsewhere.map(g => g.folder), ['Home']);
  });

  it('gives each note the line after its name, to tell similar notes apart', () => {
    const result = searchNotes({ currentFolder: 'Notes', here, elsewhere });
    assert.equal(result.here[0].snippet, 'milk, eggs');
  });
});

// Asked for on 2026-10-05: each note's card "in the colour and background it
// is in the folder", with "the last image put in the note, if there's one, on
// the right".
describe('what a note card is drawn with', () => {
  it('the last picture in the note', () => {
    assert.equal(lastPicture('<p>a</p><img src="one.png"><p>b</p><img alt="x" src="two.png">'), 'two.png');
    assert.equal(lastPicture('<p>no pictures</p>'), null);
  });

  it("the note's own colours", () => {
    const [entry] = searchNotes({ here: [{ id: 'a', content: '<p>A</p>', bgColor: '#123456', textColor: '#ffffff' }] }).here;
    assert.equal(entry.bgColor, '#123456');
    assert.equal(entry.textColor, '#ffffff');
  });
});

// Asked for on 2026-10-05: "behind each note there's the background of their
// folders, so that you can visually see easier which folder it is".
describe("each card's folder", () => {
  it("carries its folder's wallpaper settings, this folder's and the others'", () => {
    const wall = { backgroundImage: 'work.jpg', backgroundImageMobile: 'work-phone.jpg' };
    const result = searchNotes({
      currentFolder: 'Notes',
      here: [{ id: 'a', content: '<p>A</p>' }],
      hereWallpaper: { backgroundImage: 'notes.jpg' },
      elsewhere: [{ folder: 'Work', notes: [{ id: 'w', content: '<p>W</p>' }], wallpaper: wall }]
    });
    assert.equal(result.here[0].wallpaper.backgroundImage, 'notes.jpg');
    assert.equal(result.elsewhere[0].notes[0].wallpaper, wall);
  });

  // Then, the same day: "have the whole category have the background of the
  // folder behind the notes, and the notes shown above without the background".
  it("gives each other folder's category its wallpaper, to draw behind all its notes", () => {
    const wall = { backgroundImage: 'work.jpg' };
    const result = searchNotes({ elsewhere: [{ folder: 'Work', notes: [{ id: 'w', content: '<p>W</p>' }], wallpaper: wall }] });
    assert.equal(result.elsewhere[0].wallpaper, wall);
  });
});

// Asked for on 2026-10-05: "the search should be able to search for the
// names of the folders themselves and also the name given by default to the
// text block. If I search for a folder named bruh, it gives me all the text
// notes in it, and if I search note 1 it shows all the text blocks with that
// title, even if it's a default title."
describe('what a search looks through', () => {
  const elsewhere = [
    { folder: 'bruh', notes: [note('b1', '<p>Groceries</p>'), note('b2', '<p>Plans</p>')] },
    { folder: 'Work', notes: [note('w1', ''), note('w2', '<p>Budget</p>')] }
  ];

  it("a folder's name finds every note in it", () => {
    const result = searchNotes({ currentFolder: 'Notes', here: [], elsewhere, query: 'bruh' });
    assert.deepEqual(result.elsewhere.map(g => [g.folder, g.notes.map(n => n.id)]), [['bruh', ['b1', 'b2']]]);
  });

  it('"note 1" finds a note named Note 1 by default, with nothing written in it', () => {
    const result = searchNotes({ currentFolder: 'Notes', here: [], elsewhere, query: 'note 1' });
    assert.deepEqual(result.elsewhere.flatMap(g => g.notes).map(n => n.id), ['w1']);
  });

  it('puts a note named exactly that first, ahead of ones that only mention it', () => {
    const here = [note('x', '<p>Diary</p><p>a note about 2 things</p>'), note('y', '')];
    const result = searchNotes({ currentFolder: 'Notes', here, query: 'note 2' });
    assert.deepEqual(result.here.map(n => n.id), ['y', 'x']);
  });
});

// The second style of the page, built on 2026-10-05 beside the categories:
// a shelf of folders and a grid of tiles.
describe('the shelf and grid', () => {
  const here = [note('a', '<p>Shopping</p>'), note('b', '<p>Ideas</p>')];
  const elsewhere = [
    { folder: 'Work', notes: [note('w1', '<p>Meeting</p>')], wallpaper: { backgroundImage: 'w.jpg' } },
    { folder: 'Empty', notes: [] },
    { folder: 'Home', notes: [note('h1', '<p>Garden</p>')] }
  ];

  it('lists this folder first, then the others by name, each with its count -- none without notes', () => {
    const view = shelfView({ currentFolder: 'Notes', here, elsewhere });
    assert.deepEqual(view.folders.map(f => [f.folder, f.count, f.here]), [['Notes', 2, true], ['Home', 1, false], ['Work', 1, false]]);
  });

  it("shows every folder's notes, this one's first, or one folder's when it is chosen", () => {
    assert.deepEqual(shelfView({ currentFolder: 'Notes', here, elsewhere }).notes.map(n => n.id), ['a', 'b', 'h1', 'w1']);
    assert.deepEqual(shelfView({ currentFolder: 'Notes', here, elsewhere, folder: 'Work' }).notes.map(n => n.id), ['w1']);
  });

  it('searches every folder, or only the chosen one', () => {
    assert.deepEqual(shelfView({ currentFolder: 'Notes', here, elsewhere, query: 'garden' }).notes.map(n => n.id), ['h1']);
    assert.deepEqual(shelfView({ currentFolder: 'Notes', here, elsewhere, query: 'garden', folder: 'Work' }).notes, []);
  });

  it('shows the notes last opened while not searching, leaving out any that are gone', () => {
    const recentlyOpened = [{ folder: 'Work', id: 'w1' }, { folder: 'Gone', id: 'x' }, { folder: 'Notes', id: 'a' }];
    assert.deepEqual(shelfView({ currentFolder: 'Notes', here, elsewhere, recentlyOpened }).recent.map(n => n.id), ['w1', 'a']);
    assert.deepEqual(shelfView({ currentFolder: 'Notes', here, elsewhere, recentlyOpened, query: 'x' }).recent, []);
  });
});
