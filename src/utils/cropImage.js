/**
 * A picture cut to a crop (utils/crop.js), as a new PNG: for saving a
 * cropped copy, or making a new picture block from part of one -- the
 * picture viewer's crop (asked 2026-11-10: it "can activate the same block
 * recropper that crops the block ... or crops the block for download or
 * creation of another image block").
 *
 * Fetched first rather than drawn from the <img> on screen: a picture from
 * the cloud is another origin, and drawing it straight would taint the
 * canvas and refuse to give anything back.
 */
import { normalizeCrop } from './crop.js';

export async function croppedBlob(src, crop) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`could not fetch the picture: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const c = normalizeCrop(crop) || { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(c.x * bitmap.width);
  const sy = Math.round(c.y * bitmap.height);
  const sw = Math.max(1, Math.round(c.w * bitmap.width));
  const sh = Math.max(1, Math.round(c.h * bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('could not draw the crop'))), 'image/png'));
}

/** A blob as a data: address, to store inside a new picture block as any pasted picture is. */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
