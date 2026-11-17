/**
 * Pictures in writing stored by reference (PENDING section 2, asked
 * 2026-11-17: "do the image change", to make writing in heavy folders not
 * lag).
 *
 * A picture pasted into a note used to be stored inside its writing as a
 * data: URL -- one photograph, 1.5 to 3.6 million characters -- so every
 * keystroke, save and undo step carried it. Now the picture is kept once on
 * the device (utils/pictureStore.js, by the hash of its bytes) and the
 * writing holds `austavia-picture:<hash>`, a few dozen characters. The editor
 * shows it by looking it up (TipTapEditor's image view); an upload sends the
 * picture and the cloud copy carries its link, as before, so other devices
 * and older versions see what they always saw.
 *
 * This file is the plain part: the reference's shape and finding pictures in
 * HTML. Tested in Node.
 */

export const PICTURE_REF_PREFIX = 'austavia-picture:';
const REF_SOURCE = 'austavia-picture:[A-Za-z0-9_-]+';
const IMG_SRC = /(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+)(["'])/gi;

export function isPictureRef(value) {
  return typeof value === 'string' && new RegExp(`^${REF_SOURCE}$`).test(value);
}

export function refFor(hash) {
  return `${PICTURE_REF_PREFIX}${hash}`;
}

export function hashOfRef(ref) {
  return isPictureRef(ref) ? ref.slice(PICTURE_REF_PREFIX.length) : null;
}

/** Every picture reference in some HTML, once each. */
export function pictureRefsIn(html) {
  return [...new Set(String(html || '').match(new RegExp(REF_SOURCE, 'g')) || [])];
}

/** Every data: picture used as an <img>'s source, once each. */
export function dataPicturesIn(html) {
  const found = new Set();
  for (const match of String(html || '').matchAll(IMG_SRC)) {
    if (/^data:image\//i.test(match[2])) found.add(match[2]);
  }
  return [...found];
}

/** The HTML with each <img> source in `map` (old -> new) replaced. */
export function withPictureSources(html, map) {
  if (typeof html !== 'string' || !map?.size) return html;
  return html.replace(IMG_SRC, (whole, open, src, close) => (map.has(src) ? `${open}${map.get(src)}${close}` : whole));
}

/** Whether some writing still holds a picture inside it rather than by reference. */
export function holdsInlinePictures(html) {
  return typeof html === 'string' && html.includes('data:image/') && dataPicturesIn(html).length > 0;
}
