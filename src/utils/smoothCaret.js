/**
 * Austavia's own caret in writing: as tall as the letters it stands beside,
 * gliding to where it goes next.
 *
 * Asked 2026-11-17: "the caret we use to write seems so long", and "I'd want
 * the caret in everything in the app to have a bit of animation when we
 * write so that it's smoother when you write". The browser draws its caret
 * as tall as the whole line, spacing between lines included; and it jumps.
 * So in every TipTap editor (notes, pages, tasks) the browser's caret is
 * made invisible and this one is drawn instead. One-line fields keep the
 * system's caret.
 *
 * `caretBox` is the plain part (tested); `attachSmoothCaret` draws it.
 */

/** How tall the caret is against the letters: a little taller than the font size. */
export const CARET_HEIGHT = 1.2;
/** How long it takes to glide to its next place: 60ms, asked 2026-11-17 (80 first). */
export const CARET_GLIDE_MS = 60;

/**
 * Where to draw the caret inside its host, in the host's own pixels.
 * `rect`: the caret position on screen (ProseMirror coordsAtPos); `host`:
 * the host's box on screen; `scale`: how much the host is drawn larger or
 * smaller than its own size (the Canvas zoom); `fontSize`: of the letters
 * at the caret, in the host's pixels; `scroll`: the host's scroll.
 */
export function caretBox({ rect, host, scale = 1, fontSize = 16, scroll = { left: 0, top: 0 } }) {
  if (!rect || !host || !(scale > 0)) return null;
  const middle = (rect.top + rect.bottom) / 2;
  const lineHeight = (rect.bottom - rect.top) / scale;
  const height = Math.max(4, Math.min(lineHeight, fontSize * CARET_HEIGHT));
  return {
    x: (rect.left - host.left) / scale + scroll.left,
    y: (middle - host.top) / scale + scroll.top - height / 2,
    height
  };
}

/**
 * Draw the caret for a TipTap `editor` inside `host` (an element that
 * contains the editable and is positioned). Returns a function that removes it.
 */
export function attachSmoothCaret(editor, host) {
  if (!editor || !host || typeof document === 'undefined') return () => {};
  const view = editor.view;
  const caret = document.createElement('span');
  caret.className = 'austavia-caret';
  caret.setAttribute('aria-hidden', 'true');
  caret.style.setProperty('--caret-glide', `${CARET_GLIDE_MS}ms`);
  host.appendChild(caret);
  view.dom.classList.add('has-austavia-caret');

  let frame = 0;
  let restTimer = 0;
  let placed = false;

  function hide() {
    caret.style.opacity = '0';
    caret.classList.remove('resting');
  }

  function place() {
    frame = 0;
    if (editor.isDestroyed || !view.hasFocus() || !editor.state.selection.empty) { hide(); return; }
    let rect;
    try { rect = view.coordsAtPos(editor.state.selection.head); } catch { hide(); return; }
    const hostRect = host.getBoundingClientRect();
    const scale = host.offsetWidth ? hostRect.width / host.offsetWidth : 1;
    const at = view.domAtPos(editor.state.selection.head);
    const el = at.node.nodeType === 1 ? at.node : at.node.parentElement;
    const fontSize = parseFloat(getComputedStyle(el || view.dom).fontSize) || 16;
    const box = caretBox({ rect, host: hostRect, scale, fontSize, scroll: { left: host.scrollLeft, top: host.scrollTop } });
    if (!box) { hide(); return; }
    // The first time it appears it is put there; after that it glides.
    caret.style.transition = placed ? '' : 'none';
    caret.style.height = `${box.height}px`;
    caret.style.transform = `translate(${box.x}px, ${box.y}px)`;
    caret.style.opacity = '1';
    placed = true;
    // Still while typing; it blinks once the writing pauses, as a caret does.
    caret.classList.remove('resting');
    clearTimeout(restTimer);
    restTimer = setTimeout(() => caret.classList.add('resting'), 500);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(place);
  }

  const onBlur = () => { placed = false; hide(); };
  editor.on('selectionUpdate', schedule);
  editor.on('transaction', schedule);
  editor.on('focus', schedule);
  editor.on('blur', onBlur);
  const resized = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
  resized?.observe(view.dom);
  window.addEventListener('resize', schedule);

  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(restTimer);
    editor.off('selectionUpdate', schedule);
    editor.off('transaction', schedule);
    editor.off('focus', schedule);
    editor.off('blur', onBlur);
    resized?.disconnect();
    window.removeEventListener('resize', schedule);
    view.dom.classList?.remove('has-austavia-caret');
    caret.remove();
  };
}
