import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isInlineAtom, stepOver, sideOfClick, needsDrawnCaret } from '../src/utils/atomCaret.js';

// Asked 2026-10-26: everything in a note that is not text "should behave like
// one character ... you should be able to put yourself on its right and left
// -- even for an image, to make it easier to move".

const picture = { isInline: true, isAtom: true, isText: false, nodeSize: 1 };
const letter = { isInline: true, isAtom: false, isText: true, nodeSize: 1 };
const block = { isInline: false, isAtom: true, isText: false, nodeSize: 1 };

test('a picture is one character; text and blocks are not', () => {
  assert.equal(isInlineAtom(picture), true);
  assert.equal(isInlineAtom(letter), false);
  assert.equal(isInlineAtom(block), false);
});

test('one arrow press steps over a picture, as over a character', () => {
  assert.equal(stepOver({ dir: 1, pos: 13, nodeAfter: picture }), 14);
  assert.equal(stepOver({ dir: -1, pos: 14, nodeBefore: picture }), 13);
  assert.equal(stepOver({ dir: 1, pos: 5, nodeAfter: letter }), null, 'text is left to the editor');
});

test('with a picture selected whole, an arrow goes to that side of it', () => {
  assert.equal(stepOver({ dir: 1, empty: false, selected: picture, from: 13, to: 14 }), 14);
  assert.equal(stepOver({ dir: -1, empty: false, selected: picture, from: 13, to: 14 }), 13);
});

test('a click puts the cursor on the side of the picture clicked', () => {
  assert.equal(sideOfClick({ left: 0, right: 60, x: 10 }), 'before');
  assert.equal(sideOfClick({ left: 0, right: 60, x: 50 }), 'after');
});

test('beside a picture the editor draws the cursor itself, since the browser does not', () => {
  assert.equal(needsDrawnCaret({ empty: true, nodeBefore: picture }), true);
  assert.equal(needsDrawnCaret({ empty: true, nodeAfter: picture }), true);
  assert.equal(needsDrawnCaret({ empty: true, nodeBefore: letter, nodeAfter: letter }), false);
  assert.equal(needsDrawnCaret({ empty: false, nodeBefore: picture }), false);
});
