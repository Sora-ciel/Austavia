/**
 * What the picture viewer is handed: every picture among `blocks`, in their
 * order, the block each one is and its crop -- one way of making it for
 * every mode that opens the viewer (CLAUDE.md, "one of everything"). The
 * block ids are what its "Crop this picture" changes (2026-11-10).
 */

/** Where a picture block's picture can be read from, or ''. */
export function pictureSource(block) {
  if (!block) return '';
  if (typeof block.src === 'string' && block.src) return block.src;
  return block.resolvedSrc || '';
}

/** `{ images, blockIds, crops, start }` for the viewer, starting on `clickedSrc`. */
export function galleryOf(blocks = [], clickedSrc = '') {
  const pictures = (blocks || []).filter(block => block?.type === 'image' && pictureSource(block));
  const images = pictures.map(pictureSource);
  const blockIds = pictures.map(block => block.id);
  const crops = Object.fromEntries(pictures.filter(block => block.crop).map(block => [block.id, block.crop]));
  if (!images.length && clickedSrc) return { images: [clickedSrc], blockIds: [], crops: {}, start: 0 };
  const start = Math.max(0, images.indexOf(clickedSrc));
  return { images, blockIds, crops, start };
}
