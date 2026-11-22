import { test } from 'node:test';
import assert from 'node:assert/strict';

import { markedStarter, isUntouchedStarter, startersAtSignIn } from '../src/utils/starterFolders.js';
import { newcomerFolder } from '../src/utils/newcomerFolder.js';
import { normalizeModeSettings } from '../src/utils/modeSettings.js';

// Found 2026-11-22 by npm run test:sync: signing in asked about the newcomer
// folder nobody had touched, and every new device would add another guide.

let n = 0;
const made = markedStarter(newcomerFolder({ today: '2026-11-22', newId: () => `id${n++}` }), 'newcomer');

test('a starter folder as made is untouched -- also once the app has read and saved it again', () => {
  assert.equal(isUntouchedStarter(made), true);
  const resaved = {
    ...made,
    modeSettings: normalizeModeSettings(made.modeSettings),
    blocks: made.blocks.map(block => ({ ...block, historyTriggers: ['position'], _version: 3 }))
  };
  assert.equal(isUntouchedStarter(resaved), true);
});

test('written in, it is somebody\'s folder', () => {
  const edited = { ...made, blocks: made.blocks.map((block, i) => (i === 0 ? { ...block, content: `${block.content}<p>mine</p>` } : block)) };
  assert.equal(isUntouchedStarter(edited), false);
});

test('signing into an account with folders: an untouched guide goes, and nobody is asked about it', () => {
  const edited = { ...made, blocks: [] };
  const plan = startersAtSignIn({ payloads: { Welcome: made, Mine: { blocks: [] }, Changed: edited }, accountHasFolders: true });
  assert.deepEqual(plan.ask, ['Mine', 'Changed']);
  assert.deepEqual(plan.drop, ['Welcome']);
});

test('signing into a new account: the untouched guide stays, without a question', () => {
  const plan = startersAtSignIn({ payloads: { Welcome: made }, accountHasFolders: false });
  assert.deepEqual(plan, { ask: [], drop: [] });
});
