/**
 * A scroller whose scrollbar fades when nobody is scrolling, and comes back on
 * a scroll, a wheel, or the pointer near its right edge -- as a Svelte action,
 * `use:idleScrollbar`. Only the thumb's colour changes (`sb-idle` sets
 * --sb-thumb transparent, app.css), so nothing reflows as it comes and goes.
 *
 * Single Note's, made shared when Page mode wanted the same (asked
 * 2026-11-11: "the scrollbar should disappear when we aren't scrolling") --
 * CLAUDE.md, "one of everything".
 *
 * `balance`: the scrollbar's width is also given as --sb-balance, for a
 * scroller to pad its left side by, so what it shows is centred between its
 * edges rather than between its left edge and the scrollbar ("the same margin
 * on the left as on the right, including the scroll wheel width, so that it
 * feels centered when the scrollbar disappears"). A phone's scrollbar takes
 * no room, and it is 0 there.
 */
export const SCROLLBAR_IDLE_MS = 5000;
export const SCROLLBAR_EDGE_PX = 60;

export function idleScrollbar(node, { balance = false, idleMs = SCROLLBAR_IDLE_MS, edgePx = SCROLLBAR_EDGE_PX } = {}) {
  let timer = null;
  node.classList.add('sb-idle');

  const wake = () => {
    node.classList.remove('sb-idle');
    clearTimeout(timer);
    timer = setTimeout(() => node.classList.add('sb-idle'), idleMs);
  };
  const near = event => {
    if (event.clientX >= node.getBoundingClientRect().right - edgePx) wake();
  };

  node.addEventListener('scroll', wake, { capture: true, passive: true });
  node.addEventListener('wheel', wake, { passive: true });
  node.addEventListener('pointermove', near, { passive: true });

  let observer = null;
  const measure = () => {
    const style = getComputedStyle(node);
    const borders = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
    const width = Math.max(0, node.offsetWidth - node.clientWidth - borders);
    node.style.setProperty('--sb-balance', `${width}px`);
  };
  if (balance) {
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(node);
      for (const child of node.children) observer.observe(child);
    }
  }

  return {
    destroy() {
      clearTimeout(timer);
      node.removeEventListener('scroll', wake, { capture: true });
      node.removeEventListener('wheel', wake);
      node.removeEventListener('pointermove', near);
      observer?.disconnect();
    }
  };
}
