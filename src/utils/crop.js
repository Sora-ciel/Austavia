/**
 * A picture's crop, and its size on a page: the rules of Page mode's edit
 * mode.
 *
 * Asked 2026-11-10: "i want to be able to activate an edit mode for that
 * mode. where you can change the images size even crop it and other things
 * we'll be able to do."
 *
 * - **The crop** is the picture's own (`crop` on the image block, so the
 *   Canvas shows it cropped too, and it syncs): `{ x, y, w, h }`, fractions
 *   of the picture, the part kept. None means the whole picture.
 * - **The size on a page** is the cell's (`width` on the cell, a fraction of
 *   the row), so a phone and a computer can size it differently
 *   (pageLayout.js, editPage).
 */

export const MIN_CROP = 0.05;
export const MIN_WIDTH = 0.15;

const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));

/** A crop as stored, cleaned; null for the whole picture, or anything that cannot be read. */
export function normalizeCrop(crop) {
  if (!crop || typeof crop !== 'object') return null;
  const x = clamp01(crop.x);
  const y = clamp01(crop.y);
  const w = Math.min(1 - x, Math.max(MIN_CROP, clamp01(crop.w)));
  const h = Math.min(1 - y, Math.max(MIN_CROP, clamp01(crop.h)));
  if (!(w >= MIN_CROP && h >= MIN_CROP)) return null;
  if (x === 0 && y === 0 && w >= 0.999 && h >= 0.999) return null;
  return { x, y, w, h };
}

/**
 * Where the crop editor's frame starts: the crop the picture has, or round
 * the whole picture when it has none -- it started a tenth in from every
 * edge, which read as cropped already (2026-11-11). Also what Reset goes
 * back to.
 */
export function startFrame(crop) {
  return normalizeCrop(crop) || { x: 0, y: 0, w: 1, h: 1 };
}

/** The shape of what is kept: the picture's width over height, times the crop's. */
export function croppedAspect(naturalAspect, crop) {
  const c = normalizeCrop(crop);
  return c ? naturalAspect * (c.w / c.h) : naturalAspect;
}

/**
 * How tall a block's header is on the Canvas: its 24px controls and 6px above
 * and below them (BlockShell, since 2026-11-11).
 */
export const CANVAS_HEADER_HEIGHT = 36;

/**
 * A picture block's size on the Canvas once it is cropped: the box takes the
 * shape of the part kept -- asked 2026-11-11, "after crop on canvas, the image
 * block size and format should be recalculated ... right now it keeps the same
 * as before". Its longer side stays as long as the box's was, so a block
 * keeps its place on the board; Reset (no crop) gives back the whole
 * picture's shape the same way.
 *
 * `natural` is the picture's own size in pixels. Null when it is not known.
 */
export function sizeAfterCrop({ size, natural, crop, headerHeight = CANVAS_HEADER_HEIGHT }) {
  if (!size || !natural?.w || !natural?.h) return null;
  const aspect = croppedAspect(natural.w / natural.h, crop);
  if (!(aspect > 0)) return null;
  const longest = Math.max(Number(size.width) || 0, (Number(size.height) || 0) - headerHeight);
  if (!(longest > 0)) return null;
  const width = aspect >= 1 ? longest : longest * aspect;
  const height = aspect >= 1 ? longest / aspect : longest;
  return { width: Math.round(width), height: Math.round(height + headerHeight) };
}

/** The crop moved by a fraction of the picture, staying inside it. */
export function movedCrop(crop, dx, dy) {
  const c = crop || { x: 0, y: 0, w: 1, h: 1 };
  return {
    ...c,
    x: Math.max(0, Math.min(1 - c.w, c.x + dx)),
    y: Math.max(0, Math.min(1 - c.h, c.y + dy))
  };
}

/**
 * The crop with one corner dragged by a fraction of the picture -- `corner`
 * is 'nw', 'ne', 'sw' or 'se'. The opposite corner stays put; it never gets
 * smaller than 5% or leaves the picture.
 */
export function resizedCrop(crop, corner, dx, dy) {
  const c = crop || { x: 0, y: 0, w: 1, h: 1 };
  let left = c.x;
  let top = c.y;
  let right = c.x + c.w;
  let bottom = c.y + c.h;
  if (corner.includes('w')) left = Math.max(0, Math.min(right - MIN_CROP, left + dx));
  if (corner.includes('e')) right = Math.min(1, Math.max(left + MIN_CROP, right + dx));
  if (corner.includes('n')) top = Math.max(0, Math.min(bottom - MIN_CROP, top + dy));
  if (corner.includes('s')) bottom = Math.min(1, Math.max(top + MIN_CROP, bottom + dy));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** A picture's share of its row on a page, from where its edge was dragged to. */
export function widthFromDrag({ rowLeft, rowWidth, cellLeft, x }) {
  if (!(rowWidth > 0)) return 1;
  return Math.max(MIN_WIDTH, Math.min(1, (x - cellLeft) / rowWidth));
}
