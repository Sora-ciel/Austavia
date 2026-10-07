// What database.rules.json actually enforces, checked against the real rules
// file in the emulator.
//
// These live outside test/ on purpose. `npm test` is the zero-dependency suite
// that gates every build and finishes in about a second and a half; it must
// keep running with nothing installed and nothing listening. These need the
// emulator (and therefore Java), so they run from `npm run test:rules`, which
// starts the emulator, runs them, and shuts it down.
//
// The rule worth protecting most is the last group: a signed-in client must
// never be able to write its own entitlement. `blocked` is that today. When a
// paid `plan` field lands beside it, add it to the same block — the assertions
// are already written in the shape it will need.

import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} from '@firebase/rules-unit-testing';
import { ref, set, get, remove, update } from 'firebase/database';

// Must match the --project passed to emulators:exec in package.json. A
// `demo-` prefix tells the CLI this project is emulator-only, so nothing here
// needs credentials or reaches a real Firebase project.
const PROJECT_ID = 'demo-arial';

// Must match SYNC_NAMESPACE in functions/index.js and firebaseSyncNamespace
// in firebase.ts.
const NS = 'default';

const ALICE = 'alice';
const BOB = 'bob';

const userPath = (uid) => `sync/${NS}/users/${uid}`;

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: {
      rules: readFileSync('database.rules.json', 'utf8'),
      host: '127.0.0.1',
      port: 9000
    }
  });
});

after(async () => {
  await testEnv?.cleanup();
});

// Wipes the database between cases so one test's seed cannot decide another's
// result.
async function reset() {
  await testEnv.clearDatabase();
}

function db(uid) {
  return uid === null
    ? testEnv.unauthenticatedContext().database()
    : testEnv.authenticatedContext(uid).database();
}

// Writes as the database owner, bypassing rules — for setting up state a
// client is not allowed to create itself.
function seed(fn) {
  return testEnv.withSecurityRulesDisabled((ctx) => fn(ctx.database()));
}

describe('account isolation', () => {
  it('lets a signed-in user read their own node', async () => {
    await reset();
    await assertSucceeds(get(ref(db(ALICE), userPath(ALICE))));
  });

  it('refuses one user reading another user', async () => {
    await reset();
    await assertFails(get(ref(db(ALICE), `${userPath(BOB)}/files`)));
  });

  it('refuses one user writing into another user', async () => {
    await reset();
    await assertFails(
      set(ref(db(ALICE), `${userPath(BOB)}/files/f1`), { updatedAt: 1 })
    );
  });

  it('refuses a signed-out client entirely', async () => {
    await reset();
    await assertFails(get(ref(db(null), `${userPath(ALICE)}/files`)));
    await assertFails(
      set(ref(db(null), `${userPath(ALICE)}/files/f1`), { updatedAt: 1 })
    );
  });

  it('leaves the namespace meta node publicly readable', async () => {
    await reset();
    await assertSucceeds(get(ref(db(null), `sync/${NS}/meta`)));
  });
});

describe('write is scoped to files and index', () => {
  it('accepts a file carrying a numeric updatedAt', async () => {
    await reset();
    await assertSucceeds(
      set(ref(db(ALICE), `${userPath(ALICE)}/files/f1`), {
        updatedAt: 1700000000000,
        blocks: []
      })
    );
  });

  it('accepts an index entry whose fileId matches its key', async () => {
    await reset();
    await assertSucceeds(
      set(ref(db(ALICE), `${userPath(ALICE)}/index/f1`), {
        fileId: 'f1',
        updatedAt: 1700000000000
      })
    );
  });

  // The README calls this out as deliberate: granting write at the user node
  // would let any signed-in account park arbitrary data under it and use the
  // database as free storage.
  it('refuses a write anywhere else under the user node', async () => {
    await reset();
    await assertFails(
      set(ref(db(ALICE), `${userPath(ALICE)}/junk`), { anything: true })
    );
  });
});

// Themes are the second thing a client may write, and the first new write
// path since the account was locked down to files and index. Everything here
// is about keeping it that narrow.
describe('themes', () => {
  const theme = (id, extra = {}) => ({
    id,
    name: 'Midnight',
    description: 'Custom theme',
    previewBg: '#000000',
    createdAt: 1,
    updatedAt: 2,
    controlColors: { left: { panelBg: '#111111' } },
    blockTheme: { accentColor: '#ff5f5f' },
    ...extra
  });

  it('accepts a well-formed theme', async () => {
    await reset();
    await assertSucceeds(
      set(ref(db(ALICE), `${userPath(ALICE)}/themes/midnight`), theme('midnight'))
    );
  });

  it('refuses one account writing into another', async () => {
    await reset();
    await assertFails(
      set(ref(db(ALICE), `${userPath(BOB)}/themes/midnight`), theme('midnight'))
    );
  });

  // Same guard the index carries: an id that disagrees with its key is how a
  // theme ends up unreachable by the code that wrote it.
  it('refuses an id that contradicts its key', async () => {
    await reset();
    await assertFails(
      set(ref(db(ALICE), `${userPath(ALICE)}/themes/midnight`), theme('something-else'))
    );
  });

  it('refuses a theme with no name or no updatedAt', async () => {
    await reset();
    await assertFails(
      set(ref(db(ALICE), `${userPath(ALICE)}/themes/a`), { id: 'a', updatedAt: 1 })
    );
    await assertFails(
      set(ref(db(ALICE), `${userPath(ALICE)}/themes/a`), { id: 'a', name: 'A' })
    );
  });

  it('refuses an empty name', async () => {
    await reset();
    await assertFails(
      set(ref(db(ALICE), `${userPath(ALICE)}/themes/a`), theme('a', { name: '' }))
    );
  });

  // The caps are what stop a theme being used as free storage. Nothing else
  // bounds the size of this node.
  it('refuses absurdly long strings', async () => {
    await reset();
    await assertFails(
      set(ref(db(ALICE), `${userPath(ALICE)}/themes/a`), theme('a', { name: 'x'.repeat(101) }))
    );
    await assertFails(
      set(
        ref(db(ALICE), `${userPath(ALICE)}/themes/a`),
        theme('a', { blockTheme: { accentColor: 'x'.repeat(201) } })
      )
    );
    await assertFails(
      set(
        ref(db(ALICE), `${userPath(ALICE)}/themes/a`),
        theme('a', { controlColors: { left: { panelBg: 'x'.repeat(201) } } })
      )
    );
  });

  it('refuses a field nobody asked for', async () => {
    await reset();
    await assertFails(
      set(
        ref(db(ALICE), `${userPath(ALICE)}/themes/a`),
        theme('a', { payload: 'x'.repeat(150) })
      )
    );
  });

  it('refuses a theme write while the account is blocked', async () => {
    await reset();
    await seed((adminDb) => set(ref(adminDb, `${userPath(ALICE)}/blocked`), true));
    await assertFails(
      set(ref(db(ALICE), `${userPath(ALICE)}/themes/a`), theme('a'))
    );
  });

  it('still allows deleting a theme', async () => {
    await reset();
    await seed((adminDb) =>
      set(ref(adminDb, `${userPath(ALICE)}/themes/a`), theme('a'))
    );
    await assertSucceeds(remove(ref(db(ALICE), `${userPath(ALICE)}/themes/a`)));
  });

  it('lets an account read its own themes and nobody else read them', async () => {
    await reset();
    await seed((adminDb) =>
      set(ref(adminDb, `${userPath(ALICE)}/themes/a`), theme('a'))
    );
    await assertSucceeds(get(ref(db(ALICE), `${userPath(ALICE)}/themes`)));
    await assertFails(get(ref(db(BOB), `${userPath(ALICE)}/themes`)));
  });
});

describe('payload validation', () => {
  it('refuses a file with no updatedAt', async () => {
    await reset();
    await assertFails(
      set(ref(db(ALICE), `${userPath(ALICE)}/files/f1`), { name: 'My folder' })
    );
  });

  // A trap worth keeping written down. The database stores no empty list and
  // no empty object, so a payload whose every field is empty reduces to null
  // — and a write of null is a delete, which validation is skipped for. So
  // `{ blocks: [] }` is not an invalid file that gets rejected, it is a
  // removal that succeeds. Same reason a folder synced with `tasks: []` comes
  // back without the field, which sync-rules.test.js covers from the other
  // side.
  it('treats an all-empty payload as a delete, not an invalid write', async () => {
    await reset();
    await seed((adminDb) =>
      set(ref(adminDb, `${userPath(ALICE)}/files/f1`), { updatedAt: 1 })
    );

    await assertSucceeds(
      set(ref(db(ALICE), `${userPath(ALICE)}/files/f1`), { blocks: [] })
    );

    await seed(async (adminDb) => {
      const snap = await get(ref(adminDb, `${userPath(ALICE)}/files/f1`));
      if (snap.exists()) throw new Error('expected the file to be gone');
    });
  });

  it('refuses a file whose updatedAt is not a number', async () => {
    await reset();
    await assertFails(
      set(ref(db(ALICE), `${userPath(ALICE)}/files/f1`), { updatedAt: 'now' })
    );
  });

  it('refuses an index entry whose fileId contradicts its key', async () => {
    await reset();
    await assertFails(
      set(ref(db(ALICE), `${userPath(ALICE)}/index/f1`), {
        fileId: 'f2',
        updatedAt: 1700000000000
      })
    );
  });

  // Validation is skipped on delete, which is what keeps removal working.
  it('still allows a delete', async () => {
    await reset();
    await seed((adminDb) =>
      set(ref(adminDb, `${userPath(ALICE)}/files/f1`), { updatedAt: 1 })
    );
    await assertSucceeds(remove(ref(db(ALICE), `${userPath(ALICE)}/files/f1`)));
  });
});

describe('the quota block', () => {
  it('refuses writes while the user is blocked', async () => {
    await reset();
    await seed((adminDb) =>
      set(ref(adminDb, `${userPath(ALICE)}/blocked`), true)
    );

    await assertFails(
      set(ref(db(ALICE), `${userPath(ALICE)}/files/f1`), { updatedAt: 1 })
    );
    await assertFails(
      set(ref(db(ALICE), `${userPath(ALICE)}/index/f1`), {
        fileId: 'f1',
        updatedAt: 1
      })
    );
  });

  it('allows writes again once the block is lifted', async () => {
    await reset();
    await seed((adminDb) =>
      set(ref(adminDb, `${userPath(ALICE)}/blocked`), false)
    );
    await assertSucceeds(
      set(ref(db(ALICE), `${userPath(ALICE)}/files/f1`), { updatedAt: 1 })
    );
  });
});

// The business model lives here. Everything above protects notes; this
// protects revenue. If a client can write its own entitlement, the paywall is
// decoration — and the failure is silent, because the app keeps working.
describe('entitlements are server-written only', () => {
  it('refuses a client setting its own blocked flag to false', async () => {
    await reset();
    await seed((adminDb) =>
      set(ref(adminDb, `${userPath(ALICE)}/blocked`), true)
    );
    await assertFails(set(ref(db(ALICE), `${userPath(ALICE)}/blocked`), false));
  });

  it('refuses a client creating a blocked flag from nothing', async () => {
    await reset();
    await assertFails(set(ref(db(ALICE), `${userPath(ALICE)}/blocked`), false));
  });

  it('lets a client read its own entitlement state', async () => {
    await reset();
    await seed((adminDb) =>
      set(ref(adminDb, `${userPath(ALICE)}/blocked`), true)
    );
    await assertSucceeds(get(ref(db(ALICE), `${userPath(ALICE)}/blocked`)));
  });

  // `plan` is what the paid tier will be read from — storageLimitFor(plan) in
  // functions/limits.js already keys off it. A client that can write it grants
  // itself the paid limits.
  it('refuses a client setting its own plan', async () => {
    await reset();
    await assertFails(set(ref(db(ALICE), `${userPath(ALICE)}/plan`), 'pro'));
  });

  it('refuses a client upgrading a plan the server wrote', async () => {
    await reset();
    await seed((adminDb) => set(ref(adminDb, `${userPath(ALICE)}/plan`), 'free'));
    await assertFails(set(ref(db(ALICE), `${userPath(ALICE)}/plan`), 'pro'));
  });

  it('lets a client read its own plan', async () => {
    await reset();
    await seed((adminDb) => set(ref(adminDb, `${userPath(ALICE)}/plan`), 'pro'));
    await assertSucceeds(get(ref(db(ALICE), `${userPath(ALICE)}/plan`)));
  });
});

// The running total that trackStorageUpload keeps. The app shows it as "you
// have used X of Y", so the owner must be able to read it — and must not be
// able to edit it, since it is the number their ceiling is judged against.
describe('the stored-bytes counter', () => {
  it('lets a user read their own total', async () => {
    await reset();
    await seed((adminDb) =>
      set(ref(adminDb, `storage/${ALICE}`), { bytes: 1024, limit: 2048, full: false })
    );
    await assertSucceeds(get(ref(db(ALICE), `storage/${ALICE}`)));
  });

  it('refuses reading another user total', async () => {
    await reset();
    await seed((adminDb) => set(ref(adminDb, `storage/${BOB}`), { bytes: 1024 }));
    await assertFails(get(ref(db(ALICE), `storage/${BOB}`)));
  });

  it('refuses a user rewriting their own total', async () => {
    await reset();
    await seed((adminDb) => set(ref(adminDb, `storage/${ALICE}`), { bytes: 999999 }));
    await assertFails(set(ref(db(ALICE), `storage/${ALICE}/bytes`), 0));
    await assertFails(set(ref(db(ALICE), `storage/${ALICE}/full`), false));
  });

  it('refuses a user inventing a total from nothing', async () => {
    await reset();
    await assertFails(set(ref(db(ALICE), `storage/${ALICE}`), { bytes: 0 }));
  });

  it('opens every total to an admin, for the dashboard', async () => {
    await reset();
    await seed(async (adminDb) => {
      await set(ref(adminDb, `admins/${ALICE}`), true);
      await set(ref(adminDb, `storage/${BOB}`), { bytes: 1024 });
    });
    await assertSucceeds(get(ref(db(ALICE), 'storage')));
  });
});

describe('admin-only surfaces', () => {
  it('hides usage, alerts and monitoring from a normal user', async () => {
    await reset();
    await assertFails(get(ref(db(ALICE), 'usage')));
    await assertFails(get(ref(db(ALICE), 'alerts')));
    await assertFails(get(ref(db(ALICE), 'monitoring/config')));
    await assertFails(get(ref(db(ALICE), 'monitoring/status')));
    await assertFails(get(ref(db(ALICE), 'monitoring/stats')));
  });

  // activity/ holds a record per account, so unlike storage/{uid} there is no
  // own-row read here: a user reading it would be reading everybody.
  it('hides the activity records from a normal user, including their own', async () => {
    await reset();
    await seed((adminDb) =>
      set(ref(adminDb, `activity/${ALICE}`), { firstSeenAt: 1, lastSeenAt: 2 })
    );
    await assertFails(get(ref(db(ALICE), 'activity')));
    await assertFails(get(ref(db(ALICE), `activity/${ALICE}`)));
  });

  it('refuses a user faking activity or statistics', async () => {
    await reset();
    await assertFails(set(ref(db(ALICE), `activity/${ALICE}`), { lastSeenAt: 1 }));
    await assertFails(set(ref(db(ALICE), 'monitoring/stats/latest'), { accounts: 9999 }));
  });

  it('opens activity and statistics to an admin', async () => {
    await reset();
    await seed(async (adminDb) => {
      await set(ref(adminDb, `admins/${ALICE}`), true);
      await set(ref(adminDb, `activity/${BOB}`), { firstSeenAt: 1, lastSeenAt: 2 });
      await set(ref(adminDb, 'monitoring/stats/latest'), { accounts: 2 });
    });

    await assertSucceeds(get(ref(db(ALICE), 'activity')));
    await assertSucceeds(get(ref(db(ALICE), 'monitoring/stats')));
  });

  it('opens them to a user on the admin list', async () => {
    await reset();
    await seed((adminDb) => set(ref(adminDb, `admins/${ALICE}`), true));

    await assertSucceeds(get(ref(db(ALICE), 'usage')));
    await assertSucceeds(get(ref(db(ALICE), 'alerts')));
    await assertSucceeds(get(ref(db(ALICE), 'monitoring/config')));
  });

  it('refuses a client promoting itself to admin', async () => {
    await reset();
    await assertFails(set(ref(db(ALICE), `admins/${ALICE}`), true));
  });

  it('refuses an admin saving a malformed recipient', async () => {
    await reset();
    await seed((adminDb) => set(ref(adminDb, `admins/${ALICE}`), true));

    await assertFails(
      set(ref(db(ALICE), 'monitoring/config/recipient'), 'not-an-email')
    );
    await assertSucceeds(
      set(ref(db(ALICE), 'monitoring/config/recipient'), 'someone@example.com')
    );
  });

  it('refuses an unknown key under monitoring config', async () => {
    await reset();
    await seed((adminDb) => set(ref(adminDb, `admins/${ALICE}`), true));

    await assertFails(set(ref(db(ALICE), 'monitoring/config/somethingElse'), 1));
  });
});

// The bin across devices (PENDING 0b, utils/cloudBin.js). Asked for on
// 2026-10-06: a folder deleted for ever must not come back from a device
// that still had it -- including one running a build that has never heard of
// tombstones, which is why this is a rule and not only client code.
describe('a folder deleted for ever', () => {
  const DELETED_AT = 1800000000000;

  async function tombstone() {
    await reset();
    await seed(dbx => set(ref(dbx, `${userPath(ALICE)}/index/f1`), { fileId: 'f1', updatedAt: DELETED_AT, deletedAt: DELETED_AT }));
  }

  it('cannot be uploaded back from an older copy', async () => {
    await tombstone();
    await assertFails(set(ref(db(ALICE), `${userPath(ALICE)}/files/f1`), { updatedAt: DELETED_AT - 5000, modifiedAt: DELETED_AT - 5000, blocks: [] }));
    await assertFails(set(ref(db(ALICE), `${userPath(ALICE)}/index/f1`), { fileId: 'f1', updatedAt: DELETED_AT - 5000, modifiedAt: DELETED_AT - 5000 }));
  });

  it('cannot be uploaded back by a build that sends no modifiedAt at all', async () => {
    await tombstone();
    await assertFails(set(ref(db(ALICE), `${userPath(ALICE)}/files/f1`), { updatedAt: DELETED_AT + 5000, blocks: [] }));
  });

  it('can be made again later under the same name', async () => {
    await tombstone();
    await assertSucceeds(set(ref(db(ALICE), `${userPath(ALICE)}/files/f1`), { updatedAt: DELETED_AT + 5000, modifiedAt: DELETED_AT + 5000, blocks: [] }));
    await assertSucceeds(set(ref(db(ALICE), `${userPath(ALICE)}/index/f1`), { fileId: 'f1', updatedAt: DELETED_AT + 5000, modifiedAt: DELETED_AT + 5000 }));
  });

  it('a client can write the tombstone itself', async () => {
    await reset();
    await seed(dbx => set(ref(dbx, `${userPath(ALICE)}/index/f1`), { fileId: 'f1', updatedAt: 1, modifiedAt: 1 }));
    await assertSucceeds(set(ref(db(ALICE), `${userPath(ALICE)}/index/f1`), { fileId: 'f1', updatedAt: DELETED_AT, deletedAt: DELETED_AT }));
    await assertSucceeds(remove(ref(db(ALICE), `${userPath(ALICE)}/files/f1`)));
  });
});

describe('a folder in the bin', () => {
  it('can be marked binned, and unmarked by an ordinary upload', async () => {
    await reset();
    await seed(dbx => set(ref(dbx, `${userPath(ALICE)}/index/f1`), { fileId: 'f1', updatedAt: 1, modifiedAt: 1 }));
    await assertSucceeds(update(ref(db(ALICE), `${userPath(ALICE)}/index/f1`), { binnedAt: 2 }));
    await assertSucceeds(set(ref(db(ALICE), `${userPath(ALICE)}/index/f1`), { fileId: 'f1', updatedAt: 3, modifiedAt: 3 }));
  });

  it('refuses a mark that is not a time', async () => {
    await reset();
    await seed(dbx => set(ref(dbx, `${userPath(ALICE)}/index/f1`), { fileId: 'f1', updatedAt: 1, modifiedAt: 1 }));
    await assertFails(update(ref(db(ALICE), `${userPath(ALICE)}/index/f1`), { binnedAt: 'soon' }));
  });
});
