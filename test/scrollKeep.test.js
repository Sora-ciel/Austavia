// Asked 2026-11-17: "make it so that when page mode syncs it doesn't move the
// scroll away" (src/utils/scrollKeep.js). The DOM half is played for real in
// npm run test:sync; this is the key that has to survive being drawn again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyOf } from '../src/utils/scrollKeep.js';

test('a scroller drawn again after a sync is recognised as the same one', () => {
  // Svelte's scoped class (s-xxxx) can differ between builds; order of classes too.
  assert.equal(
    keyOf({ classes: 'page-mode narrow s-abc123', index: 0 }),
    keyOf({ classes: 'narrow page-mode s-zzz999', index: 0 })
  );
});

test('two calendars on one page keep their own scroll', () => {
  assert.notEqual(
    keyOf({ blockId: 'a', classes: 'cal-scroll' }),
    keyOf({ blockId: 'b', classes: 'cal-scroll' })
  );
});
