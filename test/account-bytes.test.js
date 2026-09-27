// What an account is holding, across both places it holds it.
//
// Asked for on 2026-09-27: "I wanted the storage to count everything that is
// synced in an account folder."
//
// It did not. The balance was Cloud Storage objects and nothing else, because
// that is what the triggers watch — so an account could hold a hundred
// megabytes of notes, every picture pasted into writing included, and read as
// empty. "5 GB" meant 5 GB of attachments and an unspecified amount of
// everything else, which is not a thing anybody can be sold.
//
// The two halves are kept apart rather than merged into a single running
// number because they are maintained by different triggers and fail in
// different ways. A single number could not say which half had drifted.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { componentsOf, withComponent, totalNoteBytes } = require('../functions/accountBytes.js');

describe('componentsOf', () => {
  it('adds the two halves up', () => {
    assert.deepEqual(componentsOf({ bytes: 100, noteBytes: 40 }), {
      bytes: 100,
      noteBytes: 40,
      total: 140
    });
  });

  // Every account that existed before this was written. A missing half is an
  // account whose notes have not been counted yet, not an unmeasurable one.
  it('reads a record from before notes were counted', () => {
    assert.deepEqual(componentsOf({ bytes: 283496 }), {
      bytes: 283496,
      noteBytes: 0,
      total: 283496
    });
  });

  it('reads nothing at all as nothing', () => {
    assert.deepEqual(componentsOf(null), { bytes: 0, noteBytes: 0, total: 0 });
    assert.deepEqual(componentsOf({}), { bytes: 0, noteBytes: 0, total: 0 });
  });

  // A negative balance would hand out free space, and junk in the record must
  // not become junk in the total.
  it('refuses to believe a negative or nonsense component', () => {
    assert.equal(componentsOf({ bytes: -500, noteBytes: 40 }).total, 40);
    assert.equal(componentsOf({ bytes: 'lots', noteBytes: 40 }).total, 40);
    assert.equal(componentsOf({ bytes: 10, noteBytes: NaN }).total, 10);
  });
});

describe('withComponent', () => {
  // The whole reason it exists: each trigger knows about one half and must
  // leave the other exactly as it found it.
  it('changes one half and leaves the other alone', () => {
    const record = { bytes: 100, noteBytes: 40 };

    assert.deepEqual(withComponent(record, 'bytes', 250), { bytes: 250, noteBytes: 40, total: 290 });
    assert.deepEqual(withComponent(record, 'noteBytes', 5), { bytes: 100, noteBytes: 5, total: 105 });
  });

  it('starts a record that does not exist yet', () => {
    assert.deepEqual(withComponent(null, 'noteBytes', 60), { bytes: 0, noteBytes: 60, total: 60 });
  });

  // The components and the sum can never disagree, because nothing adds them
  // up by hand.
  it('always returns a total that is the sum of what it returned', () => {
    const out = withComponent({ bytes: 7 }, 'noteBytes', 11);
    assert.equal(out.total, out.bytes + out.noteBytes);
  });
});

describe('totalNoteBytes', () => {
  it('re-adds every folder', () => {
    assert.equal(totalNoteBytes({ a: 100, b: 250, c: 3 }), 353);
  });

  // Absolute, not incremental: handed the whole map it works out what the
  // number should be, which is what makes it safe to run twice.
  it('gives the same answer however many times it is asked', () => {
    const sizes = { a: 100, b: 250 };
    assert.equal(totalNoteBytes(sizes), totalNoteBytes(sizes));
  });

  it('copes with an account that has no folders', () => {
    assert.equal(totalNoteBytes(null), 0);
    assert.equal(totalNoteBytes({}), 0);
    assert.equal(totalNoteBytes('nonsense'), 0);
  });

  it('ignores a folder whose size is junk rather than failing the sum', () => {
    assert.equal(totalNoteBytes({ a: 100, b: 'big', c: -5, d: 20 }), 120);
  });
});
