/**
 * Pictures in writing, kept once on this device and found by reference
 * (utils/pictureRefs.js has the why). Browser-only.
 *
 * - storePicture: a pasted or dropped picture in, its reference out.
 * - showPicture: an <img> pointed at a reference shows the picture.
 * - pictureBlob / pictureDataUrl: the bytes back, for an upload or an export.
 * - referencesForInlinePictures: writing that still holds pictures inside it,
 *   rewritten to hold references (the existing heavy notes, as they open).
 */
import { putPictureBlob, getPictureBlob } from '../storage.js';
import { refFor, hashOfRef, isPictureRef, dataPicturesIn, withPictureSources } from './pictureRefs.js';

const shown = new Map(); // ref -> object URL, for as long as the app runs

function base64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashOf(blob) {
  const buffer = await blob.arrayBuffer();
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return base64url(new Uint8Array(digest)).slice(0, 32);
  }
  // No Web Crypto (an insecure context): FNV-1a twice, with the size.
  const bytes = new Uint8Array(buffer);
  let a = 0x811c9dc5; let b = 0x01000193 ^ bytes.length;
  for (let i = 0; i < bytes.length; i += 1) { a = Math.imul(a ^ bytes[i], 0x01000193); b = Math.imul(b ^ bytes[i], 0x5bd1e995); }
  return `f${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${bytes.length.toString(36)}`;
}

async function blobOf(source) {
  if (source instanceof Blob) return source;
  if (typeof source === 'string' && source.startsWith('data:')) return (await fetch(source)).blob();
  return null;
}

/** A picture kept on this device; its reference. The same picture twice is kept once. */
export async function storePicture(source) {
  const blob = await blobOf(source);
  if (!blob) return null;
  const hash = await hashOf(blob);
  if (!(await getPictureBlob(hash))) await putPictureBlob(hash, blob);
  return refFor(hash);
}

export async function pictureBlob(ref) {
  const hash = hashOfRef(ref);
  return hash ? getPictureBlob(hash) : null;
}

/** An address the page can show for a reference, or null when the picture is not on this device. */
export async function resolvePicture(ref) {
  if (shown.has(ref)) return shown.get(ref);
  const blob = await pictureBlob(ref);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  shown.set(ref, url);
  return url;
}

/** Points an <img> at a source: a reference is looked up, anything else used as it is. */
export function showPicture(img, src) {
  img.dataset.pictureSrc = src || '';
  if (!isPictureRef(src)) { img.src = src || ''; return; }
  const known = shown.get(src);
  if (known) { img.src = known; return; }
  img.removeAttribute('src');
  resolvePicture(src).then(url => {
    if (img.dataset.pictureSrc !== src) return; // pointed elsewhere meanwhile
    if (url) img.src = url;
    else img.alt = 'This picture is not on this device yet';
  });
}

export async function pictureDataUrl(ref) {
  const blob = await pictureBlob(ref);
  if (!blob) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Writing with every picture held inside it kept on the device and replaced by its reference. */
export async function referencesForInlinePictures(html) {
  const inline = dataPicturesIn(html);
  if (!inline.length) return html;
  const map = new Map();
  for (const dataUrl of inline) {
    const ref = await storePicture(dataUrl);
    if (ref) map.set(dataUrl, ref);
  }
  return withPictureSources(html, map);
}
