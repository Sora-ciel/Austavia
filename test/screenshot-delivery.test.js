// What happens to a screenshot once it has been drawn.
//
// Asked for on 2026-09-21: "make it so that it downloads the image like a
// normal download and also puts it in the clipboard, for both PC and phones."
// Both, every time — where before a phone got a share sheet instead of a
// download and nobody got a clipboard.
//
// The interesting parts are not the download. They are the name, which has to
// survive being a filename on three operating systems, and knowing whether
// this browser can be handed a picture at all.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  screenshotFileName,
  canCopyImage,
  deliveryMessage
} from '../src/utils/screenshotDelivery.js';

const AT = new Date(2026, 8, 21, 19, 5, 3); // 21 September 2026, 19:05:03 local

describe('screenshotFileName', () => {
  it('names the file after the folder and the mode', () => {
    assert.equal(
      screenshotFileName({ saveName: 'Trip notes', mode: 'simple', at: AT }),
      'Trip notes-simple-2026-09-21-19-05-03.png'
    );
  });

  // A filename sorts as text, so a single-digit month puts the year out of
  // order in every file manager there is.
  it('pads every part, so the files sort in the order they were taken', () => {
    const early = screenshotFileName({ saveName: 'a', mode: 'm', at: new Date(2026, 0, 2, 3, 4, 5) });
    const late = screenshotFileName({ saveName: 'a', mode: 'm', at: new Date(2026, 9, 2, 3, 4, 5) });

    assert.match(early, /2026-01-02-03-04-05/);
    assert.ok(early < late, 'January should sort before October');
  });

  // toISOString is UTC. West of Greenwich an evening screenshot would be
  // stamped with tomorrow's date — the same trap habitDays.js carries a scar
  // from. A filename is read by a person, and the person is in their own day.
  it('stamps the day the person is living in, not the UTC one', () => {
    const evening = new Date(2026, 8, 21, 23, 30, 0);
    assert.match(screenshotFileName({ at: evening }), /2026-09-21/);
  });

  // A folder can be called anything. A file cannot.
  it('will not let a folder name build a path', () => {
    const name = screenshotFileName({ saveName: '../../etc/passwd', mode: 'single', at: AT });
    assert.ok(!name.includes('/'), name);
    assert.ok(!name.includes('\\'), name);
    assert.match(name, /\.png$/);
  });

  it('refuses the characters Windows and macOS reject', () => {
    const name = screenshotFileName({ saveName: 'a:b*c?d"e<f>g|h', mode: 'x', at: AT });
    assert.equal(name, 'a-b-c-d-e-f-g-h-x-2026-09-21-19-05-03.png');
  });

  // A leading dot hides the file on every unix-alike; a trailing dot or space
  // is quietly dropped by Windows, which silently merges two screenshots into
  // one filename.
  it('does not produce a hidden or silently renamed file', () => {
    assert.match(screenshotFileName({ saveName: '  .hidden  ', mode: 'x', at: AT }), /^hidden-x-/);
    assert.match(screenshotFileName({ saveName: 'trailing. ', mode: 'x', at: AT }), /^trailing-x-/);
  });

  it('falls back when there is no folder name yet', () => {
    assert.match(screenshotFileName({ saveName: '', mode: '', at: AT }), /^austavia-view-/);
    assert.match(screenshotFileName({ at: AT }), /^austavia-view-/);
  });

  it('keeps a very long folder name from eating the whole filename', () => {
    const name = screenshotFileName({ saveName: 'x'.repeat(300), mode: 'single', at: AT });
    assert.ok(name.length < 120, `too long: ${name.length}`);
    assert.match(name, /-single-2026-09-21-19-05-03\.png$/);
  });

  it('survives a date it cannot read', () => {
    assert.match(screenshotFileName({ saveName: 'a', mode: 'b', at: 'not a date' }), /^a-b-\d{4}-/);
  });
});

describe('canCopyImage', () => {
  const working = {
    isSecureContext: true,
    navigator: { clipboard: { write: () => {} } },
    ClipboardItem: function () {}
  };

  it('says yes when the browser has everything', () => {
    assert.equal(canCopyImage(working), true);
  });

  // Over plain http the API is missing entirely, and an attempt throws rather
  // than returning anything.
  it('says no outside a secure context', () => {
    assert.equal(canCopyImage({ ...working, isSecureContext: false }), false);
  });

  // Some browsers have a clipboard that takes text and nothing else, and the
  // giveaway is the missing ClipboardItem rather than the missing clipboard.
  it('says no to a browser that cannot hold a picture', () => {
    assert.equal(canCopyImage({ ...working, ClipboardItem: undefined }), false);
  });

  it('says no when there is no clipboard at all', () => {
    assert.equal(canCopyImage({ ...working, navigator: {} }), false);
    assert.equal(canCopyImage({ ...working, navigator: { clipboard: {} } }), false);
    assert.equal(canCopyImage(undefined), false);
  });
});

describe('deliveryMessage', () => {
  it('says what actually happened', () => {
    assert.equal(deliveryMessage({ downloaded: true, copied: true }), 'Saved and copied');
    assert.equal(deliveryMessage({ downloaded: true, copied: false }), 'Saved');
    assert.equal(deliveryMessage({ downloaded: false, copied: true }), 'Copied');
  });

  // A clipboard that refused is a lesser result, not a failure — the file is
  // on disk either way. Nothing at all is a failure.
  it('only calls it a failure when nothing arrived', () => {
    assert.equal(deliveryMessage({}), 'Could not save that view.');
  });
});
