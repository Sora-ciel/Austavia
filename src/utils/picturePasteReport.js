/**
 * Where a keyboard's picture stopped, on its way into a note.
 *
 * ## Why this exists
 *
 * "Something in app is failing, if you want to make sure with new logs on
 * diagnostic to see what is going on then try that since it seems you are
 * stuck." Which was fair. The cover that would not appear took three wrong
 * guesses and then one report to find, and this is the same report pointed at
 * the keyboard.
 *
 * ## The chain, and why every break looks identical
 *
 * A picture from the keyboard crosses four boundaries, and nothing anywhere
 * says which one it fell at — the person just sees that nothing happened:
 *
 * 1. **The keyboard asks the app what it accepts.** For a WebView this means
 *    `onCreateInputConnection` being called on our own subclass. If it never
 *    is, the keyboard is never told we take pictures and says so, and no amount
 *    of work further down matters.
 * 2. **The keyboard offers one.** It was told, and still may not.
 * 3. **The bytes are read** out of a temporary URI whose permission lasts for
 *    one call.
 * 4. **The page is handed them**, as a base64 string inside an
 *    `evaluateJavascript` call — which for a phone screenshot is several
 *    megabytes of JavaScript, and is the link most likely to give way quietly.
 *
 * The verdict below names the first one that did not happen. It is the whole
 * value of the report: the numbers were readable before and were read wrongly.
 */

/** Nothing has been tried yet. */
export const NOTHING_YET = Object.freeze({ calls: 0, lastOutcome: null, lastChars: 0 });

/**
 * What the page did with the last picture handed to it.
 *
 * `receivePictureFromKeyboard` already returns a word for what it did —
 * 'inserted', 'added as a block', 'not a picture', 'unreadable', 'failed' — and
 * this keeps the latest one so the report can say whether the page heard at all.
 */
export function notePictureArrived(previous, { outcome, chars } = {}) {
  const before = previous || NOTHING_YET;
  return {
    calls: before.calls + 1,
    lastOutcome: outcome || 'unknown',
    lastChars: Number.isFinite(chars) ? chars : 0
  };
}

/**
 * Which link broke, said plainly.
 *
 * Checked in the order the picture travels, so the answer is the *first* thing
 * that went wrong rather than the last thing noticed.
 */
export function picturePasteVerdict(native, page = NOTHING_YET) {
  if (!native) return 'the native side could not be asked — this build may be older than the report';

  const seen = page || NOTHING_YET;

  if (!native.installed) {
    return 'the app is not using its own WebView at all, so nothing was ever declared — the layout override is not taking effect';
  }
  if (!native.inputConnectionsCreated) {
    return 'the keyboard never asked the app to set up input, so it was never told pictures are accepted — this is what makes it say it cannot paste one';
  }
  if (!native.mimeTypesDeclared) {
    return 'the app was asked to set up input but never got as far as declaring what it accepts';
  }
  if (!native.contentOffers) {
    return 'the app declared that it accepts pictures and the keyboard still never offered one — the declaration is not reaching it';
  }
  if (!native.deliveriesToPage) {
    return `the keyboard offered a picture and the app could not take it: ${native.lastOffer || 'no detail'}`;
  }
  if (!seen.calls) {
    return `the app read the picture (${native.lastDataUrlChars} characters) and handed it to the page, and the page never heard — the handover itself is failing, and its size is the first thing to suspect`;
  }
  if (seen.lastOutcome !== 'inserted' && seen.lastOutcome !== 'added as a block') {
    return `the page received the picture and did not use it: ${seen.lastOutcome}`;
  }
  return `it worked: the page ${seen.lastOutcome} the last picture it was given`;
}

/** The lines for the diagnostics report. */
export function describePicturePaste(native, page = NOTHING_YET) {
  if (!native) return [];
  const seen = page || NOTHING_YET;

  return [
    '',
    'picture from the keyboard',
    `  our WebView: ${native.installed ? 'in use' : 'NOT IN USE'}` +
      ` · input set up ${native.inputConnectionsCreated} time(s)` +
      ` · accepts pictures: ${native.mimeTypesDeclared ? 'declared' : 'NEVER DECLARED'}`,
    `  offers from the keyboard: ${native.contentOffers} · ${native.lastOffer || 'no detail'}`,
    `  last picture: ${native.lastPictureBytes < 0 ? 'none read' : `${native.lastPictureBytes} bytes`}` +
      ` → ${native.lastDataUrlChars < 0 ? 'not handed over' : `${native.lastDataUrlChars} chars`}` +
      ` · handed to the page ${native.deliveriesToPage} time(s)`,
    `  the page heard ${seen.calls} time(s)${seen.lastOutcome ? ` · last: ${seen.lastOutcome}` : ''}`,
    ...(native.lastError ? [`  error: ${native.lastError}`] : []),
    `  → ${picturePasteVerdict(native, seen)}`
  ];
}
