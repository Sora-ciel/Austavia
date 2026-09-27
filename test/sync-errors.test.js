import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { explainSyncFailure } from '../src/utils/syncErrors.js';

const err = (code, message = 'raw sdk text') => Object.assign(new Error(message), { code });

describe('explainSyncFailure', () => {
  // The situation the storage tier exists to create. It used to read as
  // "User does not have permission to access users/…/attachments/…", which
  // looks like a bug rather than a limit.
  it('explains a full account, and says what still works', () => {
    const message = explainSyncFailure(err('storage/unauthorized'), {
      storageUsage: { bytes: 200, limit: 100, full: true }
    });

    assert.match(message, /full/i);
    assert.match(message, /delete/i);
    assert.match(message, /notes themselves keep syncing/i);
    assert.doesNotMatch(message, /permission/i);
  });

  // Identical error, different cause. Without the account's own record these
  // are indistinguishable, so telling somebody under their limit to delete
  // things would send them hunting for a problem they do not have.
  it('does not blame storage when the account is not full', () => {
    const message = explainSyncFailure(err('storage/unauthorized'), {
      storageUsage: { bytes: 10, limit: 100, full: false }
    });

    assert.doesNotMatch(message, /full/i);
    assert.match(message, /refused/i);
  });

  it('says nothing about being full when there is no record at all', () => {
    assert.doesNotMatch(explainSyncFailure(err('storage/unauthorized')), /full/i);
  });

  // The daily bandwidth ceiling, refused by the database rules. It clears
  // overnight, and saying so is the difference between "wait" and "my app is
  // broken".
  it('explains the daily limit and that it resets', () => {
    const message = explainSyncFailure(err('permission_denied'));

    assert.match(message, /limit/i);
    assert.match(message, /resets/i);
  });

  // A rules rejection from the Realtime Database carries no code — only the
  // message says what happened.
  it('recognises a database rejection from its message alone', () => {
    const bare = new Error('permission_denied at /sync/default/users/abc/files');
    assert.match(explainSyncFailure(bare), /limit/i);
  });

  it('reassures rather than alarms when the connection dropped', () => {
    const message = explainSyncFailure(err('storage/retry-limit-exceeded'));
    assert.match(message, /nothing was lost/i);
  });

  it('tells an expired session to sign in again', () => {
    assert.match(explainSyncFailure(err('storage/unauthenticated')), /sign in/i);
  });

  // A friendly message that is wrong is worse than a technical one: it sends
  // somebody looking in the wrong place entirely.
  it('keeps the original text for anything it does not recognise', () => {
    const message = explainSyncFailure(err('storage/some-new-code', 'a brand new failure'));
    assert.equal(message, 'a brand new failure');
  });

  it('copes with junk instead of an error', () => {
    assert.equal(explainSyncFailure('just a string'), 'just a string');
    assert.equal(explainSyncFailure(null), 'unknown error');
    assert.equal(explainSyncFailure(undefined), 'unknown error');
  });

  it('is not case-sensitive about the code', () => {
    assert.match(
      explainSyncFailure(err('STORAGE/UNAUTHORIZED'), { storageUsage: { full: true } }),
      /full/i
    );
  });
});

// Asked for on 2026-09-27, after a 13 MB background stopped a folder syncing:
// "it should, instead of just throwing an error, explain like the other too
// much storage pop-ups." The database's own words named a property path and a
// byte count, and said nothing about the folder having stopped.
describe('a value too large for the database', () => {
  const oversized = property => new Error(
    `set failed: value argument contains a string greater than 10485760 utf8 bytes in property '${property}' ('data:image/png;base64,iVBOR...')`
  );

  it('says the background is too large, and that the folder has stopped syncing', () => {
    const message = explainSyncFailure(oversized('sync.default.users.u1.files.default.modeSettings.default.backgroundImage'));
    assert.match(message, /background picture/i);
    assert.match(message, /10 MB/);
    assert.match(message, /nothing else in it syncs/i);
    assert.doesNotMatch(message, /utf8|argument|sync\.default/);
  });

  it('still says what happened when it was something other than the background', () => {
    const message = explainSyncFailure(oversized('sync.default.users.u1.files.default.blocks.3.content'));
    assert.match(message, /Something in this folder/);
    assert.match(message, /nothing else in it syncs/i);
  });
});
