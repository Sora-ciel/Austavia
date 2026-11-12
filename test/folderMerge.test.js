// Merging a folder changed on two devices (src/utils/folderMerge.js).
//
// Asked 2026-11-12: "what we need instead is for the app to actually see if
// each block or type of content has been changed. and it merges the change if
// the change was made at different blocks or content. and it does the name
// thing only when the change was at the same content." The name thing is the
// conflict copy, "Arial (from computer, 12 Nov)". These say what was asked.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { baseOf, mergeFolder, readBases, writeBases } from '../src/utils/folderMerge.js';

const task = (id, tasks) => ({ id, type: 'task', tasks });
const note = (id, content) => ({ id, type: 'text', content });

const START = {
  blocks: [task('t', ['a']), note('n', '<p>hello</p>')],
  modeSettings: { page: { rows: 1 }, habits: { list: ['Draw'] } },
  modeOrders: { task: ['t'] },
  modifiedAt: 100
};

const merge = (local, remote, start = START) => mergeFolder({ base: baseOf(start), local, remote });
const ids = payload => payload.blocks.map(b => b.id);

describe('changes in different blocks are merged, with no copy', () => {
  it('a task added on the phone and a note written on the computer both stay', () => {
    const phone = { ...START, blocks: [task('t', ['a', 'b']), note('n', '<p>hello</p>')], modifiedAt: 300 };
    const computer = { ...START, blocks: [task('t', ['a']), note('n', '<p>hello world</p>')], modifiedAt: 200 };
    const out = merge(computer, phone);
    assert.deepEqual(out.conflicts, []);
    assert.deepEqual(out.payload.blocks, [task('t', ['a', 'b']), note('n', '<p>hello world</p>')]);
    assert.equal(out.fromLocal, true);
  });

  it('a block added on each side: both are in the folder', () => {
    const phone = { ...START, blocks: [...START.blocks, note('p', 'from phone')] };
    const computer = { ...START, blocks: [...START.blocks, note('c', 'from computer')] };
    const out = merge(computer, phone);
    assert.deepEqual(out.conflicts, []);
    assert.deepEqual(ids(out.payload), ['t', 'n', 'p', 'c']);
  });

  it('a block deleted on one side and untouched on the other is deleted', () => {
    const phone = { ...START, blocks: [task('t', ['a'])] };
    const out = merge(START, phone);
    assert.deepEqual(out.conflicts, []);
    assert.deepEqual(ids(out.payload), ['t']);
  });

  it('different parts of the mode settings merge too', () => {
    const phone = { ...START, modeSettings: { ...START.modeSettings, habits: { list: ['Draw', 'Sport'] } } };
    const computer = { ...START, modeSettings: { ...START.modeSettings, page: { rows: 2 } } };
    const out = merge(computer, phone);
    assert.deepEqual(out.conflicts, []);
    assert.deepEqual(out.payload.modeSettings, { page: { rows: 2 }, habits: { list: ['Draw', 'Sport'] } });
  });
});

describe('a change that is not one is no change at all', () => {
  it('a rename and back -- hidden id given, pictures stored inside -- leaves nothing to keep', () => {
    const withPicture = {
      ...START,
      blocks: [...START.blocks, { id: 'i', type: 'image', src: 'https://firebasestorage.googleapis.com/v0/b/x/o/a.png?alt=media&token=1' }]
    };
    const renamedBack = {
      ...withPicture,
      blocks: [...START.blocks, { id: 'i', type: 'image', src: 'data:image/png;base64,iVBORw0KGgo=' }],
      modeSettings: { ...START.modeSettings, folder: { id: 'f-123' } },
      modifiedAt: 999
    };
    const phone = { ...withPicture, blocks: [task('t', ['a', 'b']), ...withPicture.blocks.slice(1)] };
    const out = merge(renamedBack, phone, withPicture);
    assert.deepEqual(out.conflicts, []);
    assert.deepEqual(out.payload.blocks[0], task('t', ['a', 'b']));
  });
});

describe('the name thing, only when both changed the same content', () => {
  it('the same block changed differently on both is a conflict, and the folder takes the other device\'s', () => {
    const phone = { ...START, blocks: [task('t', ['a', 'phone']), START.blocks[1]] };
    const computer = { ...START, blocks: [task('t', ['a', 'computer']), START.blocks[1]] };
    const out = merge(computer, phone);
    assert.deepEqual(out.conflicts, ['block t']);
    assert.deepEqual(out.payload.blocks[0], task('t', ['a', 'phone']));
  });

  it('the same change made on both is not a conflict', () => {
    const both = { ...START, blocks: [task('t', ['a', 'b']), START.blocks[1]] };
    assert.deepEqual(merge(both, both).conflicts, []);
  });

  it('deleted on one side and changed on the other: kept, and a conflict', () => {
    const phone = { ...START, blocks: [task('t', ['a'])] };
    const computer = { ...START, blocks: [task('t', ['a']), note('n', '<p>changed</p>')] };
    const out = merge(computer, phone);
    assert.deepEqual(out.conflicts, ['block n']);
    assert.deepEqual(ids(out.payload), ['t', 'n']);
  });
});

describe('when there is nothing to merge from', () => {
  it('no fingerprint written down yet: not merged, so both are kept whole as before', () => {
    assert.equal(mergeFolder({ base: null, local: START, remote: START }), null);
  });

  it('blocks without ids cannot be told apart: not merged', () => {
    const odd = { blocks: [{ type: 'text' }] };
    assert.equal(baseOf(odd), null);
    assert.equal(mergeFolder({ base: baseOf(START), local: odd, remote: START }), null);
  });

  it('fields this version does not know are kept from the other device', () => {
    const phone = { ...START, futureField: { x: 1 } };
    assert.deepEqual(merge(START, phone).payload.futureField, { x: 1 });
  });

  it('the merge carries no stamp, so saving it stamps it as a change made here', () => {
    const out = merge(START, { ...START, modifiedAt: 500 });
    assert.equal(out.payload.modifiedAt, undefined);
  });
});

describe('fingerprints are kept per account', () => {
  it('read back as written, and nothing breaks on junk', () => {
    const store = new Map();
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    writeBases(storage, 'u1', { Arial: baseOf(START) });
    assert.deepEqual(readBases(storage, 'u1'), { Arial: baseOf(START) });
    store.set('austavia.cloudBase.u2', '{not json');
    assert.deepEqual(readBases(storage, 'u2'), {});
  });
});
