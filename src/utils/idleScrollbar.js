/**
 * Scrollbars that show only while something is scrolling -- every scroller in
 * the app, from one place.
 *
 * ## What was asked for
 *
 * 2026-11-11, Single Note and then Page mode: "the scrollbar should disappear
 * when we aren't scrolling". 2026-11-21, first "the scrollwheel in page mode
 * should disappear after 0.8sec of not scrolling", then the same day: "the
 * scrollbar thing should change to 0.2s and be the case for everywhere.
 * though the animation of the scrollbar disappearing should be longer."
 *
 * ## How
 *
 * Every scroller's thumb is drawn at `--sb-alpha` of its colour (app.css),
 * and every element starts at 0. A scroll or a wheel on a scroller sets its
 * own --sb-alpha to 1; 0.2 s after the last one it fades back to 0 over a
 * longer stretch (`scrollbarAlpha` decides, `installIdleScrollbars` acts).
 * The value is set on the scroller alone, inline, so a scroller inside it
 * keeps its own -- the `*` rule in app.css is what stops it inheriting.
 *
 * It is done in script rather than with a CSS transition because a
 * transition would have to be declared on every element, and would replace
 * whatever transition each component already declares for itself.
 *
 * The pointer near a scroller's right edge also shows its bar, so it can be
 * grabbed with a mouse; it stays while held.
 *
 * Only the thumb's colour changes, never the gutter, so nothing reflows as
 * it comes and goes.
 */
export const SCROLLBAR_IDLE_MS = 200;
export const SCROLLBAR_FADE_MS = 700;
export const SCROLLBAR_EDGE_PX = 24;

/** How much of a scrollbar shows, `since` ms after the last scroll: whole, then fading out. */
export function scrollbarAlpha(since, { idleMs = SCROLLBAR_IDLE_MS, fadeMs = SCROLLBAR_FADE_MS } = {}) {
  if (!(since >= 0) || since <= idleMs) return 1;
  const t = (since - idleMs) / fadeMs;
  if (t >= 1) return 0;
  // Eased: the bar lets go slowly at first, so the fade reads as one.
  return 1 - t * t * (3 - 2 * t);
}

function scrollerOf(target, doc) {
  if (!target || target === doc) return doc.scrollingElement || doc.documentElement;
  return target.nodeType === 1 ? target : null;
}

function canScroll(el, view) {
  if (el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1) return false;
  const style = view.getComputedStyle(el);
  return /(auto|scroll|overlay)/.test(style.overflowY + style.overflowX);
}

/**
 * Hooks the whole document once. Returns a function that unhooks it.
 * `now` and the frame scheduler are passed in so it can be driven by a test.
 */
export function installIdleScrollbars(doc = document, { now = () => performance.now(), frame = cb => requestAnimationFrame(cb) } = {}) {
  const view = doc.defaultView;
  const last = new Map(); // scroller -> time of its last scroll
  let held = null;
  let scheduled = false;

  const paint = () => {
    scheduled = false;
    const at = now();
    for (const [el, when] of last) {
      const alpha = el === held ? 1 : scrollbarAlpha(at - when);
      if (alpha <= 0) {
        el.style.removeProperty('--sb-alpha');
        last.delete(el);
      } else {
        el.style.setProperty('--sb-alpha', alpha.toFixed(3));
      }
    }
    if (last.size) schedule();
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    frame(paint);
  };
  const wake = el => {
    if (!el?.style) return;
    last.set(el, now());
    el.style.setProperty('--sb-alpha', '1');
    schedule();
  };

  const onScroll = event => wake(scrollerOf(event.target, doc));
  const onWheel = event => {
    for (let el = event.target; el && el.nodeType === 1; el = el.parentElement) {
      if (canScroll(el, view)) { wake(el); return; }
    }
  };
  // Near a scroller's right edge, its bar shows so it can be taken hold of.
  let pointerQueued = null;
  const onPointerMove = event => {
    if (event.pointerType === 'touch') return;
    const first = pointerQueued === null;
    pointerQueued = event;
    if (!first) return;
    frame(() => {
      const e = pointerQueued;
      pointerQueued = null;
      for (let el = e.target; el && el.nodeType === 1; el = el.parentElement) {
        if (!canScroll(el, view)) continue;
        const box = el.getBoundingClientRect();
        if (e.clientX <= box.right && e.clientX >= box.right - SCROLLBAR_EDGE_PX) wake(el);
        return;
      }
    });
  };
  const onPointerDown = event => {
    const el = event.target;
    if (el?.nodeType !== 1 || !last.has(el)) return;
    held = el;
  };
  const onPointerUp = () => {
    if (!held) return;
    wake(held);
    held = null;
  };

  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  doc.addEventListener('wheel', onWheel, { capture: true, passive: true });
  doc.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
  doc.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  view?.addEventListener('pointerup', onPointerUp, { capture: true, passive: true });
  view?.addEventListener('pointercancel', onPointerUp, { capture: true, passive: true });

  return () => {
    doc.removeEventListener('scroll', onScroll, { capture: true });
    doc.removeEventListener('wheel', onWheel, { capture: true });
    doc.removeEventListener('pointermove', onPointerMove, { capture: true });
    doc.removeEventListener('pointerdown', onPointerDown, { capture: true });
    view?.removeEventListener('pointerup', onPointerUp, { capture: true });
    view?.removeEventListener('pointercancel', onPointerUp, { capture: true });
    for (const el of last.keys()) el.style.removeProperty('--sb-alpha');
    last.clear();
  };
}

/**
 * `use:scrollbarBalance`: the scroller's scrollbar width as --sb-balance, for
 * it to pad its left side by, so what it shows is centred between its edges
 * rather than between its left edge and the scrollbar ("the same margin on
 * the left as on the right, including the scroll wheel width, so that it
 * feels centered when the scrollbar disappears", 2026-11-11). A phone's
 * scrollbar takes no room, and it is 0 there.
 */
export function scrollbarBalance(node) {
  const measure = () => {
    const style = getComputedStyle(node);
    const borders = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
    const width = Math.max(0, node.offsetWidth - node.clientWidth - borders);
    node.style.setProperty('--sb-balance', `${width}px`);
  };
  measure();
  let observer = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
  }
  return { destroy() { observer?.disconnect(); } };
}
