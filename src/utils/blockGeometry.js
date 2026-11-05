/**
 * Where a dragged block lands, and how big a resized one gets.
 *
 * Five block components each carried their own copy of this: the same pointer
 * maths, the same clamps, the same division by the canvas scale. The copies had
 * already drifted apart in spelling — `{ ...size }` against `width: size.width`,
 * two indentations, a blank line here and there — which is the harmless kind of
 * drift, and exactly the kind that hides the other sort. Nothing in a copy
 * announces that it was meant to match four others.
 *
 * The maths lives here, in a module Node can import, so it can be checked
 * without a browser, a canvas or a block. The listening and the redrawing stay
 * at the call site, where they need a DOM.
 */

/** Below these a block stops being usable — a header with nothing under it. */
export const MIN_WIDTH = 100;
export const MIN_HEIGHT = 50;

/**
 * A pointer or touch event in canvas coordinates.
 *
 * The canvas is drawn under a scale transform, so client coordinates are in
 * screen pixels while a block's position is in canvas pixels. Dividing is what
 * keeps a block under the finger at any zoom; without it a block drifts further
 * from the pointer the further you are from 100%.
 *
 * A scale of zero or nonsense falls back to 1 rather than producing Infinity
 * and throwing the block off the canvas.
 */
export function canvasPoint(event, canvasScale) {
  const source = event.touches ? event.touches[0] : event;
  const scale = Number(canvasScale) > 0 ? Number(canvasScale) : 1;
  return {
    x: source.clientX / scale,
    y: source.clientY / scale
  };
}

/** The grab offset: where in the block the pointer took hold of it. */
export function grabOffset(point, position) {
  return { x: point.x - position.x, y: point.y - position.y };
}

/**
 * Held at the same spot in the block, and never off the top or left edge.
 *
 * Clamping at 0 is why a block cannot be dragged into negative space it could
 * not be scrolled back to.
 */
export function draggedPosition(point, offset) {
  return {
    x: Math.max(0, point.x - offset.x),
    y: Math.max(0, point.y - offset.y)
  };
}

/**
 * The size after dragging the corner handle, measured from where the resize
 * began rather than from the last frame, so a fast drag cannot accumulate
 * rounding error.
 */
export function resizedSize(point, resizeStart, { minWidth = MIN_WIDTH, minHeight = MIN_HEIGHT } = {}) {
  return {
    width: Math.max(minWidth, resizeStart.width + (point.x - resizeStart.x)),
    height: Math.max(minHeight, resizeStart.height + (point.y - resizeStart.y))
  };
}

/**
 * The size of a block that keeps its picture's shape: as wide as dragged, and
 * as tall as the picture is at that width plus the header above it. `aspect`
 * is the picture's width over its height. Null when the picture would be
 * shorter than 20px, which leaves the block as it was.
 */
export function aspectSize(width, aspect, headerHeight = 0, { minWidth = 50 } = {}) {
  const w = Math.max(minWidth, width);
  const content = w / aspect;
  if (!(content >= 20)) return null;
  return { width: w, height: content + headerHeight };
}
