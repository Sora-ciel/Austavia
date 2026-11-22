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

import { KEYBOARD_CLOSED_EVENT } from './keyboardCaret.js';

/** How tall the caret is against the letters: a little taller than the font size. */
export const CARET_HEIGHT = 1.2;
/** How long it takes to glide to its next place while typing (80ms; 60 was tried the same day and put back). */
export const CARET_GLIDE_MS = 80;

/**
 * Whether the caret glides to its next place or is simply there. Asked
 * 2026-11-17: when the caret is moved -- by a click or by keys -- it should
 * not glide: across a whole line, 80ms is long enough to see it travel frame
 * by frame. It glides only when writing moved it.
 */
/** How soon after a change to the writing a move still counts as writing. */
export const WRITING_WINDOW_MS = 200;

export function caretGlides({ textChanged = false } = {}) {
  return textChanged;
}

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
  // When the writing last changed. Several redraws follow one keystroke (the
  // note's height changing, the selection settling), and each must glide as
  // the keystroke does; a move with no writing near it does not.
  let typedAt = -Infinity;

  function hide() {
    caret.style.opacity = '0';
    caret.classList.remove('resting');
  }

  // Put away with the phone's keyboard (utils/keyboardCaret.js): hidden
  // until this writing is touched or typed in again, whatever focus says.
  let keyboardAway = false;

  function place() {
    frame = 0;
    if (keyboardAway || editor.isDestroyed || !view.hasFocus() || !editor.state.selection.empty) { hide(); return; }
    let rect;
    try { rect = view.coordsAtPos(editor.state.selection.head); } catch { hide(); return; }
    const hostRect = host.getBoundingClientRect();
    const scale = host.offsetWidth ? hostRect.width / host.offsetWidth : 1;
    const at = view.domAtPos(editor.state.selection.head);
    const el = at.node.nodeType === 1 ? at.node : at.node.parentElement;
    const fontSize = parseFloat(getComputedStyle(el || view.dom).fontSize) || 16;
    const box = caretBox({ rect, host: hostRect, scale, fontSize, scroll: { left: host.scrollLeft, top: host.scrollTop } });
    if (!box) { hide(); return; }
    // It glides only when writing moved it; put there otherwise -- the first
    // time it appears, after a click, after the arrow keys (caretGlides).
    const textChanged = performance.now() - typedAt < WRITING_WINDOW_MS;
    caret.style.transition = placed && caretGlides({ textChanged }) ? '' : 'none';
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
  // Writing is what the browser calls input -- typing, deleting, pasting --
  // and never an arrow key or a click. The document's own changes are not
  // the signal: the editor adjusts it by itself shortly after typing (a
  // separator re-measured), which made an arrow key glide.
  const onInput = () => { typedAt = performance.now(); keyboardAway = false; };
  const onKeyboardClosed = () => { keyboardAway = true; placed = false; hide(); };
  const onTouched = () => { keyboardAway = false; };
  window.addEventListener(KEYBOARD_CLOSED_EVENT, onKeyboardClosed);
  view.dom.addEventListener('pointerdown', onTouched);
  view.dom.addEventListener('beforeinput', onInput);
  view.dom.addEventListener('input', onInput);
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
    view.dom.removeEventListener('beforeinput', onInput);
    view.dom.removeEventListener('input', onInput);
    editor.off('focus', schedule);
    editor.off('blur', onBlur);
    resized?.disconnect();
    window.removeEventListener('resize', schedule);
    window.removeEventListener(KEYBOARD_CLOSED_EVENT, onKeyboardClosed);
    view.dom.removeEventListener('pointerdown', onTouched);
    view.dom.classList?.remove('has-austavia-caret');
    caret.remove();
  };
}
