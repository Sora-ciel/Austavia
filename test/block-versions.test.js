// Which blocks are rebuilt after a change.
//
// Asked for on 2026-10-05: "changing themes or other forms of change like
// clicking a task as done makes some blocks jump every time you do it ...
// maybe for performance we might want our app to mount only one block at a
// time, so that the task is the only one that remounts and not everything".
// Every history step used to rebuild every block on the canvas; a rebuilt
// text block with pictures in it jumped. What follows was wanted.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { blockState, remountOnlyChanged, restoredVersions } from '../src/utils/blockVersions.js';

const note = { id: 'note', type: 'text', content: '<p>hi</p><img src="a.png">', bgColor: '#111', _version: 3 };
const task = { id: 'task', type: 'task', tasks: [{ text: 'milk', done: false }], _version: 5 };
const shownAs = (...blocks) => new Map(blocks.map(block => [block.id, blockState(block)]));

describe('a history step rebuilds only what changed behind its block\'s back', () => {
  it('ticking a task rebuilds nothing else -- the note keeps its version, so it does not jump', () => {
    const ticked = { ...task, tasks: [{ text: 'milk', done: true }] };
    // The task block reported the tick itself, so it is already showing it.
    const shown = shownAs(note, ticked);
    const [n, t] = remountOnlyChanged([note, ticked], shown);
    assert.equal(n._version, 3);
    assert.equal(t._version, 5);
  });

  it('a change the block did not make itself rebuilds that block, and only it', () => {
    const undone = { ...note, content: '<p>before</p>' };
    const [n, t] = remountOnlyChanged([undone, task], shownAs(note, task));
    assert.equal(n._version, 4);
    assert.equal(t._version, 5);
  });

  it('changing theme rebuilds no block -- their colours are followed live', () => {
    const paint = { bgColor: '#222', textColor: '#eee', _themedBgColor: '#222', _themedTextColor: '#eee', _baseBgColor: '#111' };
    const blocks = [{ ...note, ...paint }, { ...task, ...paint }];
    assert.deepEqual(remountOnlyChanged(blocks, shownAs(note, task)).map(b => b._version), [3, 5]);
  });

  it('a block it cannot vouch for is rebuilt, as everything used to be', () => {
    assert.equal(remountOnlyChanged([note], new Map())[0]._version, 4);
  });

  it('the version itself is not a change', () => {
    assert.equal(blockState({ ...note, _version: 99 }), blockState(note));
  });
});

describe('undo and redo', () => {
  it('a block undo leaves as it is shown is not rebuilt', () => {
    const live = new Map([['note', 3], ['task', 5]]);
    const before = { ...task, tasks: [], _version: 4 };
    const restored = restoredVersions([{ ...note, _version: 2 }, before], live, shownAs(note, task));
    assert.equal(restored[0]._version, 3);
    assert.ok(restored[1]._version > 5, 'the task is rebuilt with a key the canvas has not seen');
  });

  it('a block that was not on screen is rebuilt past its stored version', () => {
    const restored = restoredVersions([{ ...note, _version: 7 }], new Map(), new Map());
    assert.equal(restored[0]._version, 8);
  });
});

// A decision nothing enforces is a comment with a test suite (CLAUDE.md): the
// colours are only safe to leave out of a rebuild if every block really does
// follow them after it is built. Read from the components themselves.
describe('every block follows its colours after it is built', () => {
  const read = file => readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  it('BlockShell keeps following its colour props', () => {
    const source = read('BlockShell.svelte');
    assert.match(source, /\$: bgColor = initialBgColor;/, 'BlockShell must follow initialBgColor, or a theme change will not reach it without a rebuild');
    assert.match(source, /\$: textColor = initialTextColor/, 'BlockShell must follow initialTextColor');
  });
  // Every block is drawn in BlockShell (2026-11-04), and hands it its colours
  // as they change rather than keeping a copy of its own.
  for (const file of ['TextBlock.svelte', 'ClockBlock.svelte', 'MusicBlock.svelte', 'ImgBlock.svelte', 'TaskBlock.svelte', 'EmbedBlock.svelte']) {
    it(`${file} is drawn in BlockShell, which follows its colours`, () => {
      const source = read(file);
      assert.match(source, /<BlockShell/, `${file} must use BlockShell`);
      assert.match(source, /initialBgColor/, `${file} must pass its colours on`);
      assert.doesNotMatch(source, /let bgColor = initialBgColor/, `${file} must not keep its own copy of the colours`);
    });
  }
});
