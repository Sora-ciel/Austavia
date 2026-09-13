import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  chooseOpenNote,
  rememberedNote,
  withRememberedNote,
  REMEMBERED_FILES
} from '../src/utils/lastNote.js';

// Named after the request: "make it so that the browser remembers what was the
// last note open in Single Note mode. No need to sync, make it local."

const notes = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];

test('the note you had open is the one that opens', () => {
  assert.equal(chooseOpenNote({ notes, remembered: 'third' }), 'third');
});

test('with nothing remembered, the first note opens, as it always did', () => {
  assert.equal(chooseOpenNote({ notes }), 'first');
  assert.equal(chooseOpenNote({ notes, remembered: null }), 'first');
});

test('a note deleted since does not stop the mode opening', () => {
  assert.equal(
    chooseOpenNote({ notes, remembered: 'deleted-on-another-device' }),
    'first',
    'the memory is a suggestion, checked against the notes actually there'
  );
});

test('a folder with no notes opens nothing rather than guessing', () => {
  assert.equal(chooseOpenNote({ notes: [], remembered: 'first' }), null);
  assert.equal(chooseOpenNote(), null);
});

test('each file remembers its own note', () => {
  let store = {};
  store = withRememberedNote(store, 'Recipes', 'pasta');
  store = withRememberedNote(store, 'Work', 'standup');

  assert.equal(rememberedNote(store, 'Recipes'), 'pasta');
  assert.equal(rememberedNote(store, 'Work'), 'standup');
  assert.equal(rememberedNote(store, 'Never opened'), null);
});

test('opening a different note in the same file replaces the old one', () => {
  let store = withRememberedNote({}, 'Work', 'standup');
  store = withRememberedNote(store, 'Work', 'retro');

  assert.equal(rememberedNote(store, 'Work'), 'retro');
  assert.equal(Object.keys(store).length, 1);
});

test('it forgets the files nobody has opened in a long time', () => {
  let store = {};
  for (let i = 0; i < REMEMBERED_FILES + 10; i += 1) {
    store = withRememberedNote(store, `file ${i}`, `note ${i}`);
  }

  assert.equal(Object.keys(store).length, REMEMBERED_FILES);
  assert.equal(rememberedNote(store, 'file 0'), null, 'the oldest go first');
  assert.equal(rememberedNote(store, `file ${REMEMBERED_FILES + 9}`), `note ${REMEMBERED_FILES + 9}`);
});

test('remembering the same note again changes nothing worth writing', () => {
  const store = withRememberedNote({}, 'Work', 'standup');
  assert.equal(withRememberedNote(store, 'Work', 'standup'), store, 'the same object, so no write');
});

test('nonsense in local storage is ignored rather than believed', () => {
  assert.equal(rememberedNote(null, 'Work'), null);
  assert.equal(rememberedNote('not an object', 'Work'), null);
  assert.equal(rememberedNote({ Work: 42 }, 'Work'), null);
  assert.equal(rememberedNote({ Work: 'note' }, ''), null);
  assert.deepEqual(withRememberedNote({}, '', 'note'), {});
  assert.deepEqual(withRememberedNote({}, 'Work', ''), {});
});
