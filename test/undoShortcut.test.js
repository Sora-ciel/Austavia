import { test } from 'node:test';
import assert from 'node:assert/strict';

import { undoTarget, isTextEntry } from '../src/utils/undoShortcut.js';

// Wanted, 2026-10-12: "colours don't get undone with the shortcut, but they do
// with the button." Measured on the Linux app: the keyboard focus was still in
// a block's note after that block stopped being the focused one, so Ctrl+Z
// went to the note's empty text history. Ctrl+Z must do what the Undo button
// does unless somebody is actually writing.

test('with nothing being written in, Ctrl+Z undoes the workspace, like the Undo button', () => {
  assert.equal(undoTarget({ activeIsText: false }), 'workspace');
});

test('focus left in a block that is no longer focused is let go, and the colour is undone', () => {
  assert.equal(undoTarget({ activeIsText: true, activeBlockId: 'a', focusedBlockId: null }), 'release');
  assert.equal(undoTarget({ activeIsText: true, activeBlockId: 'a', focusedBlockId: 'b' }), 'release');
});

test('typing in the focused note keeps that note\'s own undo', () => {
  assert.equal(undoTarget({ activeIsText: true, activeBlockId: 'a', focusedBlockId: 'a', textCanStep: true }), 'text');
});

test('a block just added and recoloured, never typed in: Ctrl+Z undoes the colour, caret stays', () => {
  assert.equal(undoTarget({ activeIsText: true, activeBlockId: 'a', focusedBlockId: 'a', textCanStep: false }), 'pass');
});

test('writing outside any block — a folder name, a search box — keeps its own undo', () => {
  assert.equal(undoTarget({ activeIsText: true, activeBlockId: null, focusedBlockId: null }), 'text');
});

function el(tagName, extra = {}) {
  return { nodeType: 1, tagName, isContentEditable: false, ...extra };
}

test('a slider or a colour well is not somewhere text is written', () => {
  assert.equal(isTextEntry(el('INPUT', { type: 'range' })), false);
  assert.equal(isTextEntry(el('INPUT', { type: 'color' })), false);
  assert.equal(isTextEntry(el('INPUT', { type: 'checkbox' })), false);
  assert.equal(isTextEntry(el('BUTTON')), false);
});

test('text fields, text areas and notes are', () => {
  assert.equal(isTextEntry(el('INPUT', { type: 'text' })), true);
  assert.equal(isTextEntry(el('INPUT', { type: '' })), true);
  assert.equal(isTextEntry(el('TEXTAREA')), true);
  assert.equal(isTextEntry(el('DIV', { isContentEditable: true })), true);
});
