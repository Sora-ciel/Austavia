import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blocksOnPage, showsWriteLine, holdsNothing, dropsWhenLeft } from '../src/utils/pageLayout.js';
import { htmlToText } from '../src/utils/htmlToText.js';

// Asked 2026-11-21, Page mode: "Let's make it so that when they are empty
// they do not create a block of text yet. If a text block was created but is
// empty, make it have that same line because it works the same i think. And
// only have that line as not a block at the last block of the page."
//
// So the page ends with a line to write on that is not a block; a click on
// it makes one, and one that is let go of still empty goes again.

const blocks = [{ id: 'a', type: 'text' }, { id: 'p', type: 'image' }];
const rowsOf = (...rows) => rows.map(ids => ({ cells: ids.map(blockId => ({ blockId })) }));

test('the page ends with a line to write on, which is not a block', () => {
  assert.equal(showsWriteLine([]), true);
  assert.equal(showsWriteLine(blocksOnPage(rowsOf(['a'], ['p']), blocks)), true);
});

test('a page ending in writing shows no second line: the text block is where writing goes on', () => {
  assert.equal(showsWriteLine(blocksOnPage(rowsOf(['p'], ['a']), blocks)), false);
});

test('a text block made from the last line and left empty does not stay a block', () => {
  assert.equal(dropsWhenLeft({ madeFromLine: true, html: '<p></p>', htmlToText }), true);
  assert.equal(dropsWhenLeft({ madeFromLine: true, html: '', htmlToText }), true);
  assert.equal(dropsWhenLeft({ madeFromLine: true, html: '<p> </p><p><br></p>', htmlToText }), true);
});

test('a text block made from the last line and written in stays', () => {
  assert.equal(dropsWhenLeft({ madeFromLine: true, html: '<p>Hello</p>', htmlToText }), false);
});

test('an empty text block somebody put on the page on purpose stays', () => {
  assert.equal(dropsWhenLeft({ madeFromLine: false, html: '<p></p>', htmlToText }), false);
});

test('a picture, a divider or a box to tick is something, without any words', () => {
  assert.equal(holdsNothing('<p><img src="austavia-picture:abc"></p>', htmlToText), false);
  assert.equal(holdsNothing('<hr>', htmlToText), false);
  assert.equal(holdsNothing('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>', htmlToText), false);
  assert.equal(holdsNothing('<div data-austavia-node="inlineSeparator"></div>', htmlToText), false);
});
