import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  picturePasteVerdict,
  describePicturePaste,
  notePictureArrived,
  NOTHING_YET
} from '../src/utils/picturePasteReport.js';

// Asked for after the app kept failing and three guesses had missed: "if you
// want to make sure with new logs on diagnostic to see what is going on then
// try that since it seems you are stuck."
//
// A keyboard's picture crosses four boundaries on its way into a note, and
// every break looks identical from outside the phone -- nothing happens. The
// verdict names the FIRST one that did not happen, because the last thing
// noticed is usually not the thing that went wrong.

const working = Object.freeze({
  installed: true,
  inputConnectionsCreated: 3,
  mimeTypesDeclared: true,
  contentOffers: 1,
  lastOffer: 'took 1 item(s)',
  lastPictureBytes: 512000,
  lastDataUrlChars: 682670,
  deliveriesToPage: 1,
  lastError: null
});
const heard = { calls: 1, lastOutcome: 'inserted', lastChars: 682670 };

test('the layout override not taking effect is named first of all', () => {
  // Everything downstream is meaningless if our WebView is not the one running.
  const verdict = picturePasteVerdict({ ...working, installed: false }, heard);
  assert.match(verdict, /not using its own WebView/);
});

test('the keyboard never asking is named, and tied to the message it shows', () => {
  // The leading suspect: a WebView may never call onCreateInputConnection on a
  // subclass, and then nothing was ever declared.
  const verdict = picturePasteVerdict({ ...working, inputConnectionsCreated: 0, mimeTypesDeclared: false }, NOTHING_YET);
  assert.match(verdict, /never asked/);
  assert.match(verdict, /cannot paste/, 'says why the keyboard says what it says');
});

test('being told and still not offering is a different fault, and says so', () => {
  const verdict = picturePasteVerdict({ ...working, contentOffers: 0, deliveriesToPage: 0 }, NOTHING_YET);
  assert.match(verdict, /still never offered/);
});

test('an offer the app could not read repeats what was offered', () => {
  const verdict = picturePasteVerdict(
    { ...working, deliveriesToPage: 0, lastOffer: 'offered 1 item(s) but could read none' },
    NOTHING_YET
  );
  assert.match(verdict, /could not take it/);
  assert.match(verdict, /could read none/);
});

test('handed over but never heard points at the size of the handover', () => {
  // The link most likely to give way quietly: the picture crosses as base64
  // inside an evaluateJavascript call, which for a screenshot is megabytes.
  const verdict = picturePasteVerdict(working, NOTHING_YET);
  assert.match(verdict, /never heard/);
  assert.match(verdict, /682670/, 'and says how big it was');
  assert.match(verdict, /size is the first thing to suspect/);
});

test('heard but not used repeats what the page decided', () => {
  const verdict = picturePasteVerdict(working, { calls: 1, lastOutcome: 'not a picture', lastChars: 10 });
  assert.match(verdict, /did not use it/);
  assert.match(verdict, /not a picture/);
});

test('working is reported as working, both ways it can land', () => {
  assert.match(picturePasteVerdict(working, heard), /it worked/);
  assert.match(
    picturePasteVerdict(working, { calls: 1, lastOutcome: 'added as a block', lastChars: 10 }),
    /it worked/
  );
});

test('an older build that cannot answer says so instead of guessing', () => {
  assert.match(picturePasteVerdict(null), /could not be asked/);
  assert.deepEqual(describePicturePaste(null), []);
});

test('what the page heard is counted, latest last', () => {
  let seen = NOTHING_YET;
  seen = notePictureArrived(seen, { outcome: 'inserted', chars: 100 });
  seen = notePictureArrived(seen, { outcome: 'failed', chars: 200 });
  assert.equal(seen.calls, 2);
  assert.equal(seen.lastOutcome, 'failed');
  assert.equal(seen.lastChars, 200);
  assert.equal(notePictureArrived(null, {}).lastOutcome, 'unknown', 'never left blank');
});

test('the printed lines carry every link, so the verdict can be argued with', () => {
  const lines = describePicturePaste(working, heard).join('\n');
  for (const expected of ['our WebView', 'offers from the keyboard', 'last picture', 'the page heard', '→']) {
    assert.ok(lines.includes(expected), `missing "${expected}"`);
  }
});
