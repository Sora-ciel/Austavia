// Showing what the account holds now, rather than what it held thirty seconds
// ago.
//
// Asked for on 2026-09-27: "show the storage on our app instant from the
// client side instead of the server one. Just make sure that when the cloud
// sends its update it's the same storage counted — if not, write it in the
// diagnostic and logs. And put the cloud's storage count as the true storage."
//
// So: an estimate in front, the server's figure as the truth, and every guess
// checked when the truth arrives. The third is the part these tests hold in
// place — a guess nobody checks is a lie with a refresh rate.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  estimatedUsage,
  driftReport,
  describeDrift,
  DRIFT_TOLERANCE
} from '../src/utils/storageEstimate.js';

const MB = 1024 * 1024;
const record = { bytes: 400 * 1024, noteBytes: 100 * 1024, total: 500 * 1024, limit: MB, full: false };

describe('estimatedUsage', () => {
  it('adds what this device has done since the server last spoke', () => {
    const shown = estimatedUsage(record, 200 * 1024);

    assert.equal(shown.total, 700 * 1024);
    assert.equal(shown.estimated, true);
  });

  it('gives room back when something is deleted', () => {
    assert.equal(estimatedUsage(record, -300 * 1024).total, 200 * 1024);
  });

  // The two are read together, so a prediction that shows a total past the
  // ceiling while still claiming there is room is worse than no prediction.
  it('recomputes whether it is full rather than carrying the old answer', () => {
    const shown = estimatedUsage(record, 600 * 1024);

    assert.ok(shown.total > MB);
    assert.equal(shown.full, true);
  });

  it('never shows a negative total, however much is deleted', () => {
    assert.equal(estimatedUsage(record, -10 * MB).total, 0);
  });

  // The common case costs nothing and the record is handed back untouched.
  it('changes nothing when there is nothing pending', () => {
    assert.equal(estimatedUsage(record, 0), record);
    assert.equal(estimatedUsage(null, 500), null);
  });

  it('leaves an account with no ceiling alone about being full', () => {
    const shown = estimatedUsage({ bytes: 5 * MB, total: 5 * MB, limit: null }, 9 * MB);
    assert.equal(shown.full, false);
  });

  // Every account that existed before the folders were counted.
  it('reads an older record with no total as what it says', () => {
    assert.equal(estimatedUsage({ bytes: 1000, limit: MB }, 500).total, 1500);
  });
});

describe('driftReport', () => {
  it('agrees when the cloud counted what was predicted', () => {
    const report = driftReport({
      previous: record,
      pendingBytes: 200 * 1024,
      arrived: { ...record, total: 700 * 1024 }
    });

    assert.equal(report.agrees, true);
    assert.equal(report.difference, 0);
  });

  // A folder is stored as JSON, so a picture costs its data URL plus whatever
  // punctuation the structure needs. A few kilobytes out is arithmetic.
  it('forgives a few kilobytes of structure', () => {
    const report = driftReport({
      previous: record,
      pendingBytes: 200 * 1024,
      arrived: { ...record, total: 700 * 1024 + DRIFT_TOLERANCE - 1 }
    });

    assert.equal(report.agrees, true);
  });

  it('does not forgive a megabyte', () => {
    const report = driftReport({
      previous: record,
      pendingBytes: 200 * 1024,
      arrived: { ...record, total: 700 * 1024 + MB }
    });

    assert.equal(report.agrees, false);
    assert.equal(report.difference, MB);
  });

  it('notices the cloud counting less than expected too', () => {
    const report = driftReport({
      previous: record,
      pendingBytes: 200 * 1024,
      arrived: { ...record, total: 100 * 1024 }
    });

    assert.equal(report.agrees, false);
    assert.ok(report.difference < 0);
  });

  it('copes with a first record, where there was nothing to predict from', () => {
    const report = driftReport({ previous: null, pendingBytes: 0, arrived: record });

    assert.equal(report.expected, 0);
    assert.equal(report.actual, 500 * 1024);
  });
});

describe('describeDrift', () => {
  it('says nothing when the two agree', () => {
    assert.equal(describeDrift({ agrees: true, difference: 0 }), '');
    assert.equal(describeDrift(null), '');
  });

  it('says which way it went, in bytes', () => {
    assert.match(describeDrift({ agrees: false, difference: 4096 }), /4096 bytes more/);
    assert.match(describeDrift({ agrees: false, difference: -4096 }), /4096 bytes less/);
  });
});
