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
import { normalizeCrop, sizeAfterCrop } from './crop.js';
import { pictureSource } from './gallery.js';

/** A picture's own size in pixels, `{ w, h }`, once it has loaded. */
export function naturalSizeOf(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('the picture would not load'));
    img.src = src;
  });
}

/**
 * The update for "Crop this picture" in the picture viewer, for every mode
 * that offers it: the crop, and the block's box in the shape of the part
 * kept (sizeAfterCrop) -- one step, so one Undo takes back both. Without
 * its size when the picture cannot be read: the crop alone, as before.
 */
export async function cropBlockUpdate(block, crop) {
  let size = null;
  try {
    size = sizeAfterCrop({ size: block?.size, natural: await naturalSizeOf(pictureSource(block)), crop });
  } catch { /* the crop alone */ }
  return {
    id: block.id,
    crop,
    ...(size ? { size } : {}),
    changedKeys: size ? ['crop', 'size'] : ['crop'],
    pushToHistory: true,
    bumpVersion: true
  };
}

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
