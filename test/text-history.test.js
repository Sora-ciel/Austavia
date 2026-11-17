// Undo and redo in written text.
//
// This is the feature that broke most often and most expensively — once losing
// a page of writing outright — and its behaviour is a matter of degree rather
// than of right and wrong, so it is easy to change without noticing. The
// numbers below are the ones that were tuned against how other editors behave;
// if a change moves them, it should be because the change meant to.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initTextHistory,
  recordText,
  undoText,
  redoText,
  canUndoText,
  syncTextHistory,
  forgetTextHistory
} from '../src/utils/textHistory.js';

let counter = 0;
const freshKey = () => `test-block-${++counter}`;

/** Types a string one character at a time, as a person would. */
function type(key, text, { from = '', delayMs = 0 } = {}) {
  let current = from;
  for (const character of text) {
    current += character;
    recordText(key, current, current.length);
  }
  return current;
}

/** How many presses it takes to walk all the way back. */
function undoCount(key) {
  let presses = 0;
  while (undoText(key) !== null) presses += 1;
  return presses;
}

const PARAGRAPH =
  'The quick brown fox jumps over the lazy dog. ' +
  'It was a bright cold day in April, and the clocks were striking thirteen. ' +
  'Nothing else stirred.';

// Undo once stepped back a whole paragraph, then over-corrected to a word at a
// time: twenty-nine presses to walk back three sentences, where Notepad, VS
// Code and ProseMirror's own history all take a handful.
test('undo steps back about a sentence at a time', async t => {
  await t.test('three sentences take three presses, not twenty-nine', () => {
    const key = freshKey();
    initTextHistory(key, '');
    type(key, PARAGRAPH);
    assert.equal(undoCount(key), 3);
  });

  await t.test('each step is a whole sentence', () => {
    const key = freshKey();
    initTextHistory(key, '');
    type(key, PARAGRAPH);

    const remaining = [];
    for (let step = undoText(key); step !== null; step = undoText(key)) {
      remaining.push(step.content);
    }
    assert.equal(remaining[0], 'The quick brown fox jumps over the lazy dog. It was a bright cold day in April, and the clocks were striking thirteen.');
    assert.equal(remaining[1], 'The quick brown fox jumps over the lazy dog.');
    assert.equal(remaining[2], '');
  });

  await t.test('a run with no punctuation still breaks up', () => {
    const key = freshKey();
    initTextHistory(key, '');
    type(key, 'chatting away with no punctuation whatsoever just words and more words going on and on for quite a while now');
    const presses = undoCount(key);
    assert.ok(presses >= 2, `expected more than one step, got ${presses}`);
  });

  await t.test('a single short word is one press', () => {
    const key = freshKey();
    initTextHistory(key, '');
    type(key, 'word');
    assert.equal(undoCount(key), 1);
  });

  await t.test('a paste is one press however large', () => {
    const key = freshKey();
    initTextHistory(key, '<p>Hello</p>');
    recordText(key, `<p>Hello${PARAGRAPH}</p>`, 0);
    assert.equal(undoCount(key), 1);
  });

  // Typing in the middle of a note used to behave quite differently from typing
  // at the end, because the rule looked at the end of the document rather than
  // at what had just been typed.
  await t.test('typing mid-note groups like typing at the end', () => {
    const atEnd = freshKey();
    initTextHistory(atEnd, '<p>Start.</p>');
    type(atEnd, ' Sentence one here. Sentence two here.', { from: '<p>Start.' });

    const midway = freshKey();
    initTextHistory(midway, '<p>Start.</p><p>a tail that never changes</p>');
    let content = '<p>Start.';
    for (const character of ' Sentence one here. Sentence two here.') {
      content += character;
      recordText(midway, `${content}</p><p>a tail that never changes</p>`, 0);
    }

    assert.equal(undoCount(midway), undoCount(atEnd));
  });
});

test('a step closes where a person would expect it to', async t => {
  await t.test('a pause starts a new step', async () => {
    const key = freshKey();
    initTextHistory(key, '');
    recordText(key, 'aaa', 3);
    await new Promise(resolve => setTimeout(resolve, 600));
    recordText(key, 'aaa bbb', 7);
    assert.equal(undoText(key).content, 'aaa');
  });

  await t.test('deleting after typing is its own step', () => {
    const key = freshKey();
    initTextHistory(key, '');
    recordText(key, 'hello', 5);
    recordText(key, 'hell', 4);
    assert.equal(undoText(key).content, 'hello');
  });

  await t.test('a new paragraph is a boundary', () => {
    const key = freshKey();
    initTextHistory(key, '<p>first</p>');
    recordText(key, '<p>first</p><p></p>', 0);
    recordText(key, '<p>first</p><p>second</p>', 0);
    assert.ok(undoCount(key) >= 2);
  });
});

test('history belongs to the block, not to the editor', async t => {
  // Moving a block or switching modes destroys and rebuilds the editor. Its own
  // history went with it, so Ctrl+Z did nothing at all afterwards — the text
  // looked the same but its past was gone.
  await t.test('a rebuilt editor keeps the past', () => {
    const key = freshKey();
    initTextHistory(key, '');
    type(key, 'Before the move. ');
    initTextHistory(key, 'Before the move. '); // as a remount would call it
    assert.equal(canUndoText(key), true);
    assert.ok(undoText(key) !== null);
  });

  await t.test('a fresh block has no past to step into', () => {
    const key = freshKey();
    initTextHistory(key, '<p>loaded from disk</p>');
    assert.equal(canUndoText(key), false);
    assert.equal(undoText(key), null);
  });

  await t.test('a change from outside stays recoverable', () => {
    const key = freshKey();
    initTextHistory(key, 'local');
    syncTextHistory(key, 'arrived from the cloud');
    assert.equal(undoText(key).content, 'local');
  });

  await t.test('a forgotten block is really forgotten', () => {
    const key = freshKey();
    initTextHistory(key, '');
    type(key, 'some writing.');
    forgetTextHistory(key);
    assert.equal(canUndoText(key), false);
  });
});

test('redo returns exactly what undo took away', async t => {
  await t.test('a single step round-trips', async () => {
    const key = freshKey();
    initTextHistory(key, 'one');
    await new Promise(resolve => setTimeout(resolve, 600));
    recordText(key, 'one two', 7);
    assert.equal(undoText(key).content, 'one');
    assert.equal(redoText(key).content, 'one two');
  });

  await t.test('every step round-trips, in order', () => {
    const key = freshKey();
    initTextHistory(key, '');
    const finished = type(key, PARAGRAPH);

    const backwards = [];
    for (let step = undoText(key); step !== null; step = undoText(key)) {
      backwards.push(step.content);
    }
    const forwards = [];
    for (let step = redoText(key); step !== null; step = redoText(key)) {
      forwards.push(step.content);
    }

    assert.equal(forwards.at(-1), finished, 'redo should end where typing ended');
    assert.deepEqual(forwards, [...backwards].reverse().slice(1).concat(finished));
  });

  await t.test('typing after undoing drops what was undone', () => {
    const key = freshKey();
    initTextHistory(key, '');
    type(key, 'First sentence. Second sentence.');
    undoText(key);
    recordText(key, 'First sentence. A different ending.', 0);
    assert.equal(redoText(key), null);
  });
});

// Reported 2026-11-17: the app's memory climbing from 400MB to 1.1GB between
// heavy folders, as if it kept what it no longer used. It did: every note
// ever opened kept its text and up to 200 earlier versions of it.
import { keepTextHistoriesFor, textHistorySize, MAX_HISTORY_CHARS } from '../src/utils/textHistory.js';

test('opening a folder lets go of the other folders\' notes', () => {
  initTextHistory('heavy-a', 'x'.repeat(1000));
  initTextHistory('heavy-b', 'y'.repeat(1000));
  keepTextHistoriesFor(['heavy-b']);
  assert.equal(canUndoText('heavy-a'), false);
  const { chars } = textHistorySize();
  assert.ok(chars < 1000 * 2, 'only the open folder\'s note is held');
});

test('a note with a picture in it keeps fewer undo steps, not a gigabyte of them', () => {
  const photo = 'p'.repeat(3_600_000);
  initTextHistory('photo-note', photo);
  for (let i = 0; i < 30; i += 1) syncTextHistory('photo-note', `${photo}${i}`);
  assert.ok(textHistorySize().chars <= MAX_HISTORY_CHARS + 4_000_000);
  assert.equal(canUndoText('photo-note'), true, 'still undoable');
});
