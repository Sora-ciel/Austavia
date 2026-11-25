import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';

import { writableParagraph, joinedText } from '../src/utils/nativeWriting.js';

// Decided 2026-11-25 (PENDING, "Native writing layer on Android"): Sora
// wants typing on the phone to feel like a native field, and measured, only
// a native field gets there. Stage 1 writes plain paragraphs natively.

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    heading: { group: 'block', content: 'inline*' },
    bulletList: { group: 'block', content: 'listItem+' },
    listItem: { content: 'paragraph+' },
    text: { group: 'inline' }
  },
  marks: { bold: {} }
});
const p = (...c) => schema.node('paragraph', null, c);
const t = (s, marks = []) => schema.text(s, marks);
const at = (doc, pos) => EditorState.create({ doc, selection: TextSelection.create(doc, pos) });

test('a plain paragraph with the caret in it is written natively', () => {
  const doc = schema.node('doc', null, [p(t('Hello there'))]);
  assert.deepEqual(writableParagraph(at(doc, 6)), { pos: 0, text: 'Hello there', caret: 5 });
});

test('an empty paragraph too', () => {
  const doc = schema.node('doc', null, [p(t('a')), p()]);
  assert.deepEqual(writableParagraph(at(doc, 4)), { pos: 3, text: '', caret: 0 });
});

test('stage 1 leaves anything else to the web editor: styling, a heading, a list', () => {
  const bold = schema.node('doc', null, [p(t('one '), t('two', [schema.marks.bold.create()]))]);
  assert.equal(writableParagraph(at(bold, 2)), null);
  const heading = schema.node('doc', null, [schema.node('heading', null, [t('Title')])]);
  assert.equal(writableParagraph(at(heading, 2)), null);
  const list = schema.node('doc', null, [schema.node('bulletList', null, [schema.node('listItem', null, [p(t('item'))])])]);
  assert.equal(writableParagraph(at(list, 4)), null);
});

test('a selection, not a caret, is left to the web editor', () => {
  const doc = schema.node('doc', null, [p(t('Hello'))]);
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1, 4) });
  assert.equal(writableParagraph(state), null);
});

test('Backspace at the start joins onto the paragraph before, the caret at the seam', () => {
  assert.deepEqual(joinedText('first ', 'second'), { text: 'first second', caret: 6 });
});
