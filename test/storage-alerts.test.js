// Telling somebody their storage is filling up, before it stops them.
//
// Asked for on 2026-09-27: "there needs to be a pop up that says if your
// storage is full, so that people actually know."
//
// There was already a banner, but only in the `catch` around a failed upload —
// so the first anybody heard of a ceiling was a picture that did not save. The
// account's own record is watched now instead.
//
// The whole difficulty is that the record is rewritten on every upload and
// every delete. A rule that fires on a *state* would put the same banner back
// every few seconds and turn it into furniture, which is not read. So what is
// announced is the crossing, and only ever upwards.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { storageAnnouncement } from '../src/utils/storageAlerts.js';

describe('storageAnnouncement', () => {
  it('says nothing while there is room', () => {
    const verdict = storageAnnouncement({ state: 'ok', announced: '' });

    assert.equal(verdict.announce, false);
    assert.equal(verdict.announced, '');
  });

  it('speaks up on the way past nearly full', () => {
    const verdict = storageAnnouncement({ state: 'nearly', announced: '' });

    assert.equal(verdict.announce, true);
    assert.match(verdict.message, /nearly full/);
    assert.match(verdict.message, /notes themselves will keep syncing/);
    assert.equal(verdict.announced, 'nearly');
  });

  it('speaks up again when it actually fills', () => {
    const verdict = storageAnnouncement({ state: 'full', announced: 'nearly' });

    assert.equal(verdict.announce, true);
    assert.match(verdict.message, /is full/);
    assert.equal(verdict.announced, 'full');
  });

  // The record is written on every upload and delete. Saying it twice makes it
  // furniture, and furniture is not read.
  it('does not repeat itself while nothing has changed', () => {
    assert.equal(storageAnnouncement({ state: 'full', announced: 'full' }).announce, false);
    assert.equal(storageAnnouncement({ state: 'nearly', announced: 'nearly' }).announce, false);
  });

  // Emptying is the thing they were just asked to do. Announcing it would be
  // congratulating somebody for following an instruction.
  it('says nothing on the way back down', () => {
    const verdict = storageAnnouncement({ state: 'nearly', announced: 'full' });

    assert.equal(verdict.announce, false);
    assert.equal(verdict.announced, 'full', 'and it still remembers the worse one');
  });

  // Somebody who cleared space in March must be warned again in April.
  it('forgets once there is room again, so the next time is heard', () => {
    const cleared = storageAnnouncement({ state: 'ok', announced: 'full' });
    assert.equal(cleared.announced, '');

    const later = storageAnnouncement({ state: 'full', announced: cleared.announced });
    assert.equal(later.announce, true);
  });

  // An account with no ceiling has nothing to be warned about.
  it('has nothing to say to an unlimited account', () => {
    assert.equal(storageAnnouncement({ state: 'unlimited', announced: '' }).announce, false);
    assert.equal(storageAnnouncement({ state: 'unlimited', announced: 'full' }).announced, '');
  });

  it('copes with being asked about nothing at all', () => {
    assert.equal(storageAnnouncement({}).announce, false);
    assert.equal(storageAnnouncement().announce, false);
  });

  // The warning and the eventual refusal have to read as one idea. syncErrors
  // says "Your cloud storage is full, so images and audio are not being
  // uploaded"; hearing something different first is two things to understand.
  it('warns in the same words the failure will use', () => {
    const verdict = storageAnnouncement({ state: 'full', announced: '' });

    assert.match(verdict.message, /images and audio are not being uploaded/);
    assert.match(verdict.message, /Delete some to free space/);
  });
});
