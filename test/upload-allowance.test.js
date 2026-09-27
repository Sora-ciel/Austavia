// Deciding whether a picture can be added, before it is.
//
// Asked for on 2026-09-27, after watching the real thing take half a minute:
// "maybe we should have the storage calculus and the block client side too —
// so it blocks when it goes further than the plan when you are connected and
// auto sync, and says it wouldn't sync when auto sync is off, and says nothing
// when not connected."
//
// Thirty seconds is the floor for the server, and not a fault: the ceiling is
// enforced by counting what actually landed, so the file has to upload before
// anything can be said about it. That is a good way to enforce a limit and a
// useless way to tell somebody about one.
//
// This is the telling, not the enforcing. The server keeps that, because a
// client can be lied to and this one runs on somebody else's machine — which
// is why every uncertain case here allows rather than refuses.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { attachmentVerdict, roomLeft } from '../src/utils/uploadAllowance.js';

const MB = 1024 * 1024;
const tiny = { bytes: 900 * 1024, limit: MB }; // 124 KB left of a 1 MB plan

describe('roomLeft', () => {
  it('is what the ceiling leaves', () => {
    assert.equal(roomLeft({ bytes: 900 * 1024, limit: MB }), MB - 900 * 1024);
  });

  it('is never negative, however far over the account is', () => {
    assert.equal(roomLeft({ bytes: 5 * MB, limit: MB }), 0);
  });

  // Null is how the database stores "no ceiling", because Infinity is not JSON.
  it('is unlimited when there is no ceiling', () => {
    assert.equal(roomLeft({ bytes: 5 * MB, limit: null }), Number.POSITIVE_INFINITY);
    assert.equal(roomLeft({}), Number.POSITIVE_INFINITY);
  });
});

describe('attachmentVerdict', () => {
  it('lets a picture through when there is room for it', () => {
    const verdict = attachmentVerdict({ bytes: 50 * 1024, usage: tiny, signedIn: true, autoSync: true });

    assert.equal(verdict.allow, true);
    assert.equal(verdict.message, '');
  });

  // The case the whole thing is for.
  it('refuses one that will not fit, while it is still being synced', () => {
    const verdict = attachmentVerdict({ bytes: 2 * MB, usage: tiny, signedIn: true, autoSync: true });

    assert.equal(verdict.allow, false);
    assert.match(verdict.message, /2 MB/);
    assert.match(verdict.message, /124 KB/);
    assert.match(verdict.message, /Delete something/);
  });

  // Nothing is going anywhere with auto sync off, so refusing would be
  // inventing a rule. Saying so is the honest half.
  it('allows it with auto sync off, and says it will not be uploaded', () => {
    const verdict = attachmentVerdict({ bytes: 2 * MB, usage: tiny, signedIn: true, autoSync: false });

    assert.equal(verdict.allow, true);
    assert.match(verdict.message, /stays on this device/);
    assert.match(verdict.message, /will not fit when it is on/);
  });

  // A limit on cloud storage has no business stopping somebody keeping a
  // picture on their own computer.
  it('says nothing at all to somebody who is not signed in', () => {
    const verdict = attachmentVerdict({ bytes: 500 * MB, usage: tiny, signedIn: false, autoSync: true });

    assert.equal(verdict.allow, true);
    assert.equal(verdict.message, '');
  });

  // Failing open, deliberately. Refusing a picture on an account that has room
  // is worse than the server refusing one later.
  it('allows when the balance has not arrived yet', () => {
    assert.equal(attachmentVerdict({ bytes: 500 * MB, usage: null, signedIn: true, autoSync: true }).allow, true);
  });

  it('allows anything on an account with no ceiling', () => {
    const verdict = attachmentVerdict({
      bytes: 500 * MB,
      usage: { bytes: 900 * MB, limit: null },
      signedIn: true,
      autoSync: true
    });

    assert.equal(verdict.allow, true);
    assert.equal(verdict.message, '');
  });

  // Exactly filling it is not over it.
  it('lets the last byte through', () => {
    const verdict = attachmentVerdict({ bytes: 124 * 1024, usage: tiny, signedIn: true, autoSync: true });
    assert.equal(verdict.allow, true);
  });

  it('reads as full rather than negative once the account is over', () => {
    const verdict = attachmentVerdict({
      bytes: 1024,
      usage: { bytes: 5 * MB, limit: MB },
      signedIn: true,
      autoSync: true
    });

    assert.equal(verdict.allow, false);
    assert.match(verdict.message, /no space is left/);
  });

  it('copes with being asked about nothing', () => {
    assert.equal(attachmentVerdict().allow, true);
    assert.equal(attachmentVerdict({ bytes: 'lots', usage: tiny, signedIn: true, autoSync: true }).allow, true);
  });
});
