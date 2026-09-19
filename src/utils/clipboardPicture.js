/**
 * Getting a picture into a note without the keyboard's permission.
 *
 * ## What was asked for
 *
 * "On mobile app I can't paste images in Single Note mode. But I tried and even
 * on the site on Chrome." With a screenshot of Gboard's clipboard and its own
 * message across the bottom: *Chrome no permite pegar imágenes aquí.*
 *
 * ## Why there are two different problems here
 *
 * That message is the keyboard's, and it is about the app it is typing into. A
 * keyboard does not paste a picture through the clipboard — it calls
 * `commitContent`, and the app has to have said in advance which kinds of
 * content it will take.
 *
 * - **In the Android app** that is ours to declare, and `ImagePasteWebView`
 *   does declare it.
 * - **In Chrome it is Chrome's**, and Chrome said no. Nothing in this codebase
 *   can change that, so no amount of work on the app will make the keyboard's
 *   clipboard hand a picture to the website.
 *
 * So the way out is not to ask the keyboard at all. The clipboard can be read
 * directly, and a file can always be chosen. Both work in every browser this
 * app runs in, and neither cares what the keyboard thinks.
 *
 * ## What this decides
 *
 * Which of the things on the clipboard is a picture, and what to do when there
 * is not one. The reading and the inserting are at the call site, where a
 * document exists.
 */

/**
 * In the order we would rather have them.
 *
 * PNG first because a screenshot is a PNG and a screenshot is most of what gets
 * pasted into a note. JPEG next because a photograph is one. The rest are taken
 * if offered but never preferred: a GIF is usually an animation that will be
 * frozen by the time it is a note's picture, and that is a surprise best kept
 * to last.
 */
export const PREFERRED_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);

/** The picture type among what something is offering, or null. */
export function pictureTypeIn(types) {
  const offered = (Array.isArray(types) ? types : []).filter((t) => typeof t === 'string');
  for (const preferred of PREFERRED_TYPES) {
    if (offered.includes(preferred)) return preferred;
  }
  // Anything else calling itself an image. The browser will refuse it if it
  // cannot actually draw it, which is a better answer than this guessing.
  return offered.find((t) => t.startsWith('image/')) || null;
}

/** The first clipboard entry holding a picture, with the type to ask it for. */
export function pictureAmong(items) {
  for (const item of Array.isArray(items) ? items : []) {
    const type = pictureTypeIn(item?.types);
    if (type) return { item, type };
  }
  return null;
}

/** Whether the clipboard can be read at all here. */
export function canReadClipboard(clipboard) {
  return Boolean(clipboard && typeof clipboard.read === 'function');
}

/**
 * What to do, given how the clipboard went.
 *
 * Falling back to the file picker rather than reporting a failure is the whole
 * point: the person pressed a button meaning "put a picture here", and every
 * reason the clipboard might not oblige — an old browser, a refused permission,
 * a clipboard holding only text — has the same sensible answer, which is to let
 * them choose one. Only a picture actually found is worth going straight in
 * with.
 */
export function pictureAction({ canRead = false, found = false, failed = false } = {}) {
  if (!canRead) return 'pick';
  if (failed) return 'pick';
  return found ? 'insert' : 'pick';
}

/** A data URL's type, or '' — used to name the file a picker-chosen picture becomes. */
export function typeOfDataUrl(dataUrl) {
  const match = /^data:([^;,]+)[;,]/.exec(String(dataUrl || ''));
  return match && match[1].startsWith('image/') ? match[1] : '';
}
