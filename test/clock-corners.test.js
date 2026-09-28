// The clock block's corners grow with the block.
//
// Asked for on 2026-09-28: "the things on the corner to change the mode of the
// block should also get bigger as the block gets bigger, like what's written
// in the middle." Read from the stylesheet, because the size is CSS applied by
// the browser -- there is no module to ask.

import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ClockAlarm.svelte', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const at = source.search(new RegExp(`^\\s*${escaped} \\{`, 'm'));
  return at < 0 ? '' : source.slice(at, source.indexOf('}', at));
}

it('sizes the corners from the block, not at a fixed size', () => {
  const size = /font-size:\s*([^;]+);/.exec(rule('.corner'))?.[1] || '';
  assert.match(size, /cqmin|cqi|cqh/, `corner font-size is ${size}`);
});

it('measures them against the whole block', () => {
  assert.match(rule('.clock-alarm'), /container-type:\s*size/);
});
