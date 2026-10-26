// Shared canvas-zoom math — single source of truth for "what zoom does the
// canvas open at" and "how big is the screen, in canvas-space units, at that
// zoom". CanvasMode.svelte uses this for its own mount/reset zoom; App.svelte
// uses it to size pasted/dropped media and to place new blocks within what's
// actually visible. Keeping one implementation avoids the kind of drift bug
// where two copies of the same formula quietly disagree.

export const MIN_CANVAS_WIDTH = 1080;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 16;

export function getControlsHeight() {
  if (typeof document === 'undefined') return 56;
  const v = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--controls-height'));
  return Number.isFinite(v) && v > 0 ? v : 56;
}

// Deterministic "home" zoom based purely on screen width (not content), so
// it matches CanvasMode's own opening/reset zoom regardless of whether the
// canvas is currently mounted.
export function getInitialCanvasScale() {
  if (typeof window === 'undefined') return 1;
  const availableWidth = Math.max(window.innerWidth, 1);
  const fitted = availableWidth / MIN_CANVAS_WIDTH;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(1, fitted)));
}

// The box (in canvas-space units) that fills the screen at the canvas's
// opening zoom — i.e. how big something needs to be, in canvas units, to
// look "about as tall/wide as the screen" right when the canvas first opens.
export function getOpeningViewportBox() {
  const scale = getInitialCanvasScale();
  const controlsHeight = getControlsHeight();
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  return {
    width: w / scale,
    height: Math.max(1, h - controlsHeight) / scale
  };
}

/**
 * How big the board is for the blocks on it, and how far its content is moved
 * sideways: `{ width, height, offsetX }`.
 *
 * ## Left is the same as top
 *
 * Reported 2026-10-26: "a block shouldn't be able to go farther than the
 * screen's left ... like it does when you put it on top, it doesn't go
 * further."
 *
 * This used to slide the whole board left so the leftmost block sat at the
 * margin -- `offsetX = margin - minX`, negative whenever no block was at the
 * very left. A block is held at x >= 0 while dragged, but on a board slid 40px
 * left, x = 0 is 40px off the screen; so the block crossed the edge while
 * dragged and jumped back on release, when the board was measured again. The
 * top was never slid, which is why it held.
 *
 * So the board is no longer slid left. Empty space left of the blocks stays,
 * as empty space above them always has. It is only ever moved right: by the
 * margin, and past it for a block an older build saved at a negative x, so
 * that block can still be reached.
 */
export function canvasExtent(blocks, {
  marginLeft = 0,
  marginRight = 0,
  marginBottom = 0,
  minWidth = MIN_CANVAS_WIDTH,
  minHeight = 0
} = {}) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { width: minWidth, height: minHeight, offsetX: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = 0;
  for (const block of blocks) {
    const x = Number(block?.position?.x ?? 0) || 0;
    const y = Number(block?.position?.y ?? 0) || 0;
    const width = Number(block?.size?.width ?? 220) || 0;
    const height = Number(block?.size?.height ?? 140) || 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }
  const offsetX = marginLeft + Math.max(0, -minX);
  return {
    width: Math.max(minWidth, maxX + offsetX + marginRight),
    height: Math.max(minHeight, maxY + marginBottom),
    offsetX
  };
}
