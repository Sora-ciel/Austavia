import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sortTracks, readTrackOrder, writeTrackOrder, withFileDates, DEFAULT_TRACK_ORDER } from '../src/utils/trackOrder.js';

// Asked 2026-10-28: "list the music by the creation date, the newer first, and
// it would be the default ... you would be able to change it to another way to
// order the list. The one chosen is saved by device." The date is the file's
// own ("no, we want the file's own date").

const day = d => new Date(2026, 9, d).getTime();
const library = [
  { id: 'a', title: 'Zebra', artist: 'Ann', fileDate: day(1), durationSeconds: 200 },
  { id: 'b', title: 'apple', artist: '', fileDate: day(20), durationSeconds: 90 },
  { id: 'c', title: 'Mango', artist: 'Bob' },             // no date yet, added after a and b
  { id: 'd', title: 'Kiwi', artist: 'Cal', fileDate: day(10), durationSeconds: 300 },
  { id: 'e', title: 'Fig' }                                // no date yet, added last
];
const ids = list => list.map(t => t.id).join('');

test('by default the newest file comes first', () => {
  assert.equal(DEFAULT_TRACK_ORDER, 'newest');
  assert.equal(ids(sortTracks(library)), 'bdaec');
});

test('a track whose file date is not known yet comes after the dated ones, newest added first', () => {
  assert.equal(ids(sortTracks(library, 'newest')).slice(-2), 'ec');
  assert.equal(ids(sortTracks(library, 'oldest')), 'adbce');
});

test('the other orders: title, artist (no artist last), length', () => {
  assert.deepEqual(sortTracks(library, 'title').map(t => t.title), ['apple', 'Fig', 'Kiwi', 'Mango', 'Zebra']);
  assert.equal(ids(sortTracks(library, 'artist')).slice(0, 3), 'acd');
  assert.equal(ids(sortTracks(library, 'length')).slice(0, 3), 'bad');
});

test('the order chosen is kept on this device, and an unknown one falls back to the default', () => {
  const map = new Map();
  const storage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  assert.equal(readTrackOrder(storage), 'newest');
  writeTrackOrder(storage, 'title');
  assert.equal(readTrackOrder(storage), 'title');
  writeTrackOrder(storage, 'nonsense');
  assert.equal(readTrackOrder(storage), 'title');
});

test('tracks already in the library get their file\'s date from the stored file, and only once', () => {
  const filled = withFileDates(library, new Map([['c', day(5)], ['a', day(30)]]));
  assert.equal(filled.find(t => t.id === 'c').fileDate, day(5));
  assert.equal(filled.find(t => t.id === 'a').fileDate, day(1), 'a date already known is not replaced');
  assert.equal(withFileDates(filled, new Map([['c', day(5)]])), filled, 'nothing new: the same list, so nothing is saved');
});
