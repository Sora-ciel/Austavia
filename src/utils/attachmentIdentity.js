/**
 * Telling one picture from another without reading all of it.
 *
 * ## The problem this solves
 *
 * A picture pasted into a note is held as a base64 data URL inside the note's
 * writing, so a note with one photograph in it is a three-million-character
 * string. Uploading already avoids sending the same picture twice — it is named
 * after a hash of its bytes, and a map of what has been sent is kept — but the
 * check came *last*:
 *
 *   1. a regular expression over three megabytes, to find the data URL
 *   2. `fetch(dataUrl)` and `.blob()`, decoding the base64 back into bytes
 *   3. a hash looping over all 3.1 million characters
 *   4. and only then: "already uploaded, here is the link"
 *
 * Every save while typing in that note paid all four. In a log taken while
 * somebody wrote a few sentences, that happened six times in seventy seconds,
 * for a picture that had not changed since the first one.
 *
 * ## What this is, and what it is not
 *
 * A cheap fingerprint that can be computed in constant time: how long the data
 * URL is, plus a slice from each end. It is not a checksum and must not be used
 * as one — it is the key to "have I already dealt with exactly this string in
 * this session", and the expensive, exact path still runs the first time.
 *
 * Two different pictures colliding would need identical lengths *and* identical
 * first and last 64 characters, which for base64 means identical headers and
 * identical trailing bytes at exactly the same size. The consequence if it ever
 * happened is one picture linked where another was meant — so the slices are
 * taken from both ends rather than one, and the length is part of the key.
 */

/** How much of each end goes into the fingerprint. */
export const SAMPLE = 64;

/**
 * A key for "this exact string, already handled", or null for anything that is
 * not a picture worth keying.
 */
export function dataUrlFingerprint(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  return `${dataUrl.length}:${dataUrl.slice(0, SAMPLE)}:${dataUrl.slice(-SAMPLE)}`;
}

/**
 * The same, narrowed to where the picture is being kept.
 *
 * Uploads are stored per file, per block and per field, so the same picture in
 * two different notes is two objects. Keying the memory the same way keeps this
 * a pure speed-up rather than a change in what gets uploaded where.
 */
export function attachmentKey(scope, dataUrl) {
  const fingerprint = dataUrlFingerprint(dataUrl);
  return fingerprint ? `${scope || ''}|${fingerprint}` : null;
}
