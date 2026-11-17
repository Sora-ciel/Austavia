import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stats } from '../src/utils/benchmark.js';

test('the benchmark\'s numbers: median, 95th percentile, worst', () => {
  const s = stats([10, 20, 30, 40, 1000]);
  assert.equal(s.median, 30);
  assert.equal(s.max, 1000);
  assert.equal(s.n, 5);
  assert.deepEqual(stats([]), { n: 0, median: 0, p95: 0, max: 0 });
});
