// The storage ceiling for a plan, as the app works it out.
//
// Asked for on 2026-09-28: "normally, even client side, it should calculate
// the right thing for the plan and not block like the earlier tiny limit." The
// app had kept refusing pictures against the 1 MB "tiny" ceiling after the
// account was moved to free, because it believed the storage record's limit
// rather than the plan.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { STORAGE_BYTE_LIMITS, DEFAULT_PLAN, limitForPlan, usageForPlan } from '../src/utils/planLimits.js';

const require = createRequire(import.meta.url);
const server = require('../functions/limits.js');

const MB = 1024 * 1024;

describe('the same limits as the server', () => {
  it('has every plan the server has, at the same size', () => {
    assert.deepEqual(STORAGE_BYTE_LIMITS, server.STORAGE_BYTE_LIMITS);
    assert.equal(DEFAULT_PLAN, server.DEFAULT_PLAN);
  });

  it('treats a plan it does not know as free, as the server does', () => {
    for (const plan of ['free', 'pro', 'tiny', 'owner', 'nonsense', undefined, null]) {
      assert.equal(limitForPlan(plan), server.storageLimitFor(plan), String(plan));
    }
  });
});

describe('usageForPlan', () => {
  // The record still says tiny: written before the plan changed.
  const staleTiny = { bytes: 3 * MB, total: 4 * MB, plan: 'tiny', limit: 1 * MB, full: true };

  it('judges by the plan the account is on, not the one the record was written under', () => {
    const usage = usageForPlan(staleTiny, 'free');
    assert.equal(usage.limit, 100 * MB);
    assert.equal(usage.full, false);
    assert.equal(usage.plan, 'free');
  });

  it('still says full when the plan really is exceeded', () => {
    assert.equal(usageForPlan({ total: 101 * MB }, 'free').full, true);
    assert.equal(usageForPlan({ total: 100 * MB }, 'free').full, false);
  });

  it('writes no ceiling as null, the way the server stores it', () => {
    assert.equal(usageForPlan(staleTiny, 'owner').limit, null);
    assert.equal(usageForPlan(staleTiny, 'owner').full, false);
  });

  it('reads an older record that only has bytes', () => {
    assert.equal(usageForPlan({ bytes: 2 * MB }, 'tiny').full, true);
  });

  it('leaves the record alone until the plan has arrived, rather than guessing', () => {
    assert.equal(usageForPlan(staleTiny, undefined), staleTiny);
    assert.equal(usageForPlan(null, 'free'), null);
  });

  it('reads no plan recorded as free', () => {
    assert.equal(usageForPlan(staleTiny, null).limit, 100 * MB);
  });
});
