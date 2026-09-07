/**
 * Which rows of a long list are worth drawing.
 *
 * The playlist used to render 200 rows behind a "show more" button. That was
 * removed so a library could be looked down without asking permission — and the
 * cost came back in full: every track became a row, and every row asked storage
 * for its cover art.
 *
 * The cover loading is what made it unusable rather than merely slow. Each cover
 * that arrived replaced the whole map of them, so Svelte redrew a list of
 * thousands of rows, thousands of times. Quadratic work for a screen that shows
 * about thirty rows — which is why nothing could be clicked while it ran, and
 * why opening the app into Playlist mode took so long.
 *
 * Both problems have the same answer, and it is not a button: draw the rows that
 * are on screen, plus a margin, and let the scrollbar be the right length by
 * padding above and below. Every row is still there and still reachable — the
 * list simply stops building the ones nobody is looking at.
 *
 * The arithmetic lives here because it is the part that goes wrong quietly: an
 * off-by-one shows as a row that flickers at the edge, a bad clamp as a list
 * that will not scroll to its end, and neither throws.
 */

/** Rows kept beyond each edge, so scrolling does not reveal blank space. */
export const OVERSCAN = 8;

const clamp = (n, low, high) => Math.min(Math.max(n, low), high);

/**
 * The slice to render, and the space to leave for what is not rendered.
 *
 * `padTop` and `padBottom` stand in for the rows above and below, so the
 * scroller keeps the height it would have had and the scrollbar means what it
 * says.
 *
 * A row height of zero — asked before anything has been measured — would divide
 * to Infinity, so it falls back to rendering the first screenful rather than
 * NaN. The next measurement corrects it.
 */
export function windowRange({
  scrollTop = 0,
  viewportHeight = 0,
  rowHeight = 0,
  count = 0,
  overscan = OVERSCAN
} = {}) {
  const total = Math.max(0, Math.floor(count));
  if (total === 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };

  const height = Number(rowHeight);
  if (!Number.isFinite(height) || height <= 0) {
    const end = Math.min(total, Math.max(1, overscan * 2));
    return { start: 0, end, padTop: 0, padBottom: 0 };
  }

  const top = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
  const view = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;

  const firstVisible = Math.floor(top / height);
  const visibleCount = Math.ceil(view / height) + 1;

  const start = clamp(firstVisible - overscan, 0, total);
  const end = clamp(firstVisible + visibleCount + overscan, start, total);

  return {
    start,
    end,
    padTop: start * height,
    padBottom: (total - end) * height
  };
}
