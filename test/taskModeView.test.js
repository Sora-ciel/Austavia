import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readDoneExpanded, writeDoneExpanded, DONE_EXPANDED_KEY } from '../src/utils/taskModeView.js';

// Asked 2026-10-25: "In task mode whether the 'Done' list of the task is open
// or closed is saved per device. So that it stays between restarts etc."

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value))
  };
}

test('a Done list closed on this device is still closed after a restart', () => {
  const storage = memoryStorage();
  writeDoneExpanded(storage, false);
  assert.equal(readDoneExpanded(storage), false);
});

test('and one opened again stays open', () => {
  const storage = memoryStorage();
  writeDoneExpanded(storage, false);
  writeDoneExpanded(storage, true);
  assert.equal(readDoneExpanded(storage), true);
});

test('the first time, the Done list is open, as it always was', () => {
  assert.equal(readDoneExpanded(memoryStorage()), true);
});

test('storage that cannot be used does not stop the mode opening', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(readDoneExpanded(broken), true);
  assert.doesNotThrow(() => writeDoneExpanded(broken, false));
  assert.equal(readDoneExpanded(undefined), true);
});

test('it is kept under its own name on the device, not in the folder', () => {
  const storage = memoryStorage();
  writeDoneExpanded(storage, false);
  assert.equal(storage.getItem(DONE_EXPANDED_KEY), 'false');
});

// Asked 2026-10-26: the goal should remember "the one you put at last if it's
// a new task", and time and count should be two different fields.
import { readLastGoal, writeLastGoal } from '../src/utils/taskModeView.js';

test('a new task starts from the last goal that was set', () => {
  const storage = memoryStorage();
  writeLastGoal(storage, { kind: 'time', target: 30, daily: true });
  assert.deepEqual(readLastGoal(storage), { kind: 'time', time: 30, count: null, daily: true });
});

test('time and count are remembered apart: setting a count keeps the last time', () => {
  const storage = memoryStorage();
  writeLastGoal(storage, { kind: 'time', target: 30 });
  writeLastGoal(storage, { kind: 'count', target: 20 });
  const last = readLastGoal(storage);
  assert.equal(last.time, 30);
  assert.equal(last.count, 20);
  assert.equal(last.kind, 'count');
});

test('nothing set yet, or storage that cannot be read, starts empty on Time', () => {
  assert.deepEqual(readLastGoal(memoryStorage()), { kind: 'time', time: null, count: null, daily: false });
  assert.deepEqual(readLastGoal({ getItem: () => '{broken' }), { kind: 'time', time: null, count: null, daily: false });
});
