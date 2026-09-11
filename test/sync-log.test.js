// The record of what sync decided.
//
// Its whole job is to answer one question — what did it think had changed? —
// on an account and a device I cannot reach. If the answer is wrong or missing,
// the next round of this is guesswork again, so the diff is tested rather than
// trusted.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  logSync,
  getSyncLog,
  clearSyncLog,
  subscribeSyncLog,
  describeDifference,
  formatSyncLog,
  carryOver,
  CARRY_OVER_MS
} from '../src/utils/syncLog.js';

test('the difference between two folders is named exactly', async t => {
  await t.test('a changed field, with both values', () => {
    const found = describeDifference({ content: 'one' }, { content: 'one two' });
    assert.equal(found.length, 1);
    assert.equal(found[0].path, 'content');
    assert.equal(found[0].before, 'one');
    assert.equal(found[0].after, 'one two');
  });

  await t.test('a field present on one side only', () => {
    const found = describeDifference({ id: 'b1' }, { id: 'b1', tasks: [] });
    assert.equal(found[0].path, 'tasks');
    assert.equal(found[0].before, '(absent)');
  });

  // The loop this exists for lives inside a block, so the path has to reach it.
  await t.test('deep inside a block, with the full path', () => {
    const before = { blocks: [{ id: 'b1', meta: { mode: 'single' } }] };
    const after = { blocks: [{ id: 'b1', meta: { mode: 'canvas' } }] };
    const found = describeDifference(before, after);
    assert.equal(found[0].path, 'blocks.0.meta.mode');
    assert.equal(found[0].after, 'canvas');
  });

  await t.test('a differing count is reported as a count', () => {
    const found = describeDifference({ blocks: [1, 2] }, { blocks: [1, 2, 3] });
    assert.equal(found[0].path, 'blocks.length');
    assert.equal(found[0].before, 2);
    assert.equal(found[0].after, 3);
  });

  await t.test('identical folders produce nothing', () => {
    const folder = { blocks: [{ id: 'b1', content: 'same' }], modeOrders: { single: ['b1'] } };
    assert.deepEqual(describeDifference(folder, structuredClone(folder)), []);
  });

  // A note can hold megabytes of base64, and the log is read on a phone.
  await t.test('a long value is cut down, and says how long it was', () => {
    const long = 'x'.repeat(5000);
    const [found] = describeDifference({ content: '' }, { content: long });
    assert.ok(found.after.length < 140, `kept ${found.after.length} characters`);
    assert.match(found.after, /5000 chars/);
  });

  await t.test('it stops after a few findings rather than dumping the note', () => {
    const before = {};
    const after = {};
    for (let i = 0; i < 40; i += 1) { before[`k${i}`] = i; after[`k${i}`] = i + 1; }
    assert.equal(describeDifference(before, after).length, 5);
    assert.equal(describeDifference(before, after, 2).length, 2);
  });

  await t.test('the same pair always reads the same way', () => {
    const a = { b: 1, a: 1, c: 1 };
    const b = { c: 2, a: 2, b: 2 };
    assert.deepEqual(
      describeDifference(a, b).map(d => d.path),
      describeDifference(a, b).map(d => d.path)
    );
  });

  await t.test('null and an object are not confused', () => {
    const [found] = describeDifference({ meta: null }, { meta: { a: 1 } });
    assert.equal(found.path, 'meta');
    assert.equal(found.before, 'null');
  });
});

test('the log keeps what matters and lets go of the rest', async t => {
  await t.test('entries come back in the order they happened', () => {
    clearSyncLog();
    logSync('save', 'notes', 'first');
    logSync('upload', 'notes', 'second');
    assert.deepEqual(getSyncLog().map(e => e.message), ['first', 'second']);
  });

  await t.test('it does not grow without limit', () => {
    clearSyncLog();
    for (let i = 0; i < 400; i += 1) logSync('save', 'notes', `entry ${i}`);
    const log = getSyncLog();
    assert.ok(log.length <= 300, `kept ${log.length}`);
    // the newest must survive: a loop is happening now, not an hour ago
    assert.equal(log.at(-1).message, 'entry 399');
  });

  await t.test('a listener hears about new lines', () => {
    clearSyncLog();
    let seen = 0;
    const stop = subscribeSyncLog(list => { seen = list.length; });
    logSync('save', 'notes', 'after subscribing');
    assert.equal(seen, 1);
    stop();
    logSync('save', 'notes', 'after unsubscribing');
    assert.equal(seen, 1);
  });

  await t.test('a listener that throws does not stop the logging', () => {
    clearSyncLog();
    const stop = subscribeSyncLog(() => { throw new Error('bad listener'); });
    assert.doesNotThrow(() => logSync('save', 'notes', 'still recorded'));
    assert.equal(getSyncLog().length, 1);
    stop();
  });

  await t.test('it reads as text, with the difference spelled out', () => {
    clearSyncLog();
    logSync('save', 'notes', 'content differs', [
      { path: 'blocks.0.tasks', before: '(absent)', after: '[0 items]' }
    ]);
    const text = formatSyncLog();
    assert.match(text, /save/);
    assert.match(text, /\[notes\]/);
    assert.match(text, /blocks\.0\.tasks: \(absent\) -> \[0 items\]/);
  });

  await t.test('an empty log says so rather than being blank', () => {
    clearSyncLog();
    assert.match(formatSyncLog(), /Nothing logged yet/);
  });
});

// A sync that hangs on a phone is fixed by force-stopping the app — which is
// also what used to throw away the record of what it had been doing. Every time
// the problem was made to go away, the evidence went with it.
test('the log carries over a restart', async t => {
  const NOW = 1_000_000_000_000;
  const at = msAgo => NOW - msAgo;

  await t.test('keeps the minutes leading up to the restart', () => {
    const kept = carryOver([{ at: at(1000), kind: 'save', message: 'a' }], NOW);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].message, 'a');
  });

  await t.test('marks them so this run can be told from the last', () => {
    const kept = carryOver([{ at: at(1000), kind: 'save', message: 'a' }], NOW);
    assert.equal(kept[0].previous, true);
  });

  await t.test('drops anything older than the window', () => {
    const stored = [
      { at: at(CARRY_OVER_MS + 1), kind: 'save', message: 'old' },
      { at: at(1000), kind: 'save', message: 'recent' }
    ];
    assert.deepEqual(carryOver(stored, NOW).map(e => e.message), ['recent']);
  });

  await t.test('caps how much is carried, so a loop cannot fill storage', () => {
    const flood = Array.from({ length: 500 }, (_, i) => ({ at: at(1000), kind: 'save', message: `l${i}` }));
    const kept = carryOver(flood, NOW);
    assert.ok(kept.length <= 120, `kept ${kept.length}`);
    assert.equal(kept[kept.length - 1].message, 'l499', 'the newest lines are the ones kept');
  });

  await t.test('treats unreadable history as no history', () => {
    assert.deepEqual(carryOver(null, NOW), []);
    assert.deepEqual(carryOver(undefined, NOW), []);
    assert.deepEqual(carryOver('not an array', NOW), []);
    assert.deepEqual(carryOver([null, { message: 'no timestamp' }, { at: 'soon' }], NOW), []);
  });
});
