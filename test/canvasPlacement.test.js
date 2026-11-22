import { test } from 'node:test';
import assert from 'node:assert/strict';

import { placeWaitingBlocks, UNPLACED } from '../src/utils/canvasPlacement.js';

// Asked 2026-11-22, and wanted: "when you add a block but canvas isn't open,
// when you finally open canva the block is superposed to other blocks ... i
// would want it to [not] superpose them when you actually open canvas mode".

// A stand-in for the Canvas's own placing: the first spot to the right of
// everything placed.
const nextFree = (placed, width) => ({ x: placed.reduce((x, b) => Math.max(x, b.position.x + b.size.width), 0) + 10, y: 0 });
const overlap = (a, b) => !(a.position.x + a.size.width <= b.position.x || b.position.x + b.size.width <= a.position.x ||
  a.position.y + a.size.height <= b.position.y || b.position.y + b.size.height <= a.position.y);

test('a block made in another mode is placed clear of the others when the Canvas opens', () => {
  const blocks = [
    { id: 'a', position: { x: 100, y: 100 }, size: { width: 300, height: 200 } },
    { id: 'new', position: { x: 100, y: 100 }, size: { width: 300, height: 200 }, [UNPLACED]: true }
  ];
  const out = placeWaitingBlocks(blocks, nextFree);
  assert.equal(overlap(out[0], out[1]), false);
  assert.equal(out[1][UNPLACED], undefined, 'placed once, then it is a block like any other');
});

test('two blocks made elsewhere do not land on each other either', () => {
  const blocks = [
    { id: 'one', position: { x: 0, y: 0 }, size: { width: 300, height: 200 }, [UNPLACED]: true },
    { id: 'two', position: { x: 0, y: 0 }, size: { width: 300, height: 200 }, [UNPLACED]: true }
  ];
  const [one, two] = placeWaitingBlocks(blocks, nextFree);
  assert.equal(overlap(one, two), false);
});

test('blocks already on the Canvas are left exactly where they are', () => {
  const blocks = [{ id: 'a', position: { x: 5, y: 6 }, size: { width: 300, height: 200 } }];
  assert.equal(placeWaitingBlocks(blocks, nextFree), blocks);
});

test('a block the Canvas does not show is neither placed nor in the way', () => {
  const blocks = [
    { id: 'hidden', position: { x: 0, y: 0 }, size: { width: 900, height: 900 } },
    { id: 'waits', position: { x: 0, y: 0 }, size: { width: 300, height: 200 }, [UNPLACED]: true },
    { id: 'new', position: { x: 0, y: 0 }, size: { width: 300, height: 200 }, [UNPLACED]: true }
  ];
  const shown = block => block.id === 'new';
  const out = placeWaitingBlocks(blocks, nextFree, { shown });
  assert.equal(out[1][UNPLACED], true, 'not shown: it waits on');
  assert.equal(out[2].position.x, 10, 'the hidden block takes no room');
});
