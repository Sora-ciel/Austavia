/**
 * On a phone, putting the keyboard away takes the caret away too -- in every
 * part of the app.
 *
 * Asked 2026-11-21: "on phone when you remove the keyboard it should remove
 * the caret. not remove the focus but the caret. because it stays. it should
 * be a all around app change." Android hides the keyboard (the back button,
 * the keyboard's own button) without telling the page, so the writing kept
 * its caret blinking with nothing to type with.
 *
 * So when the screen grows back by a keyboard's height while something is
 * being written in, that writing is let go of (blur): the caret goes, and
 * what was typed is saved as any blur saves it. The block stays the one
 * focused -- that is the app's own state (focusedBlockId), not the browser's.
 *
 * `keyboardStep` decides from the screen's height; `installKeyboardCaret`
 * listens and acts.
 */

/** A keyboard is at least this tall; anything less is a bar coming and going. */
export const KEYBOARD_MIN_PX = 120;

/**
 * The next state from a new measurement of the visible screen.
 * `state`: { width, tallest, open } -- the tallest height seen at this width
 * (a turn of the phone starts again), and whether a keyboard is up.
 * Returns { state, closed }: `closed` when a keyboard just went away.
 */
export function keyboardStep(state, { width, height }) {
  const sameWidth = state && Math.abs(state.width - width) < 2;
  const tallest = sameWidth ? Math.max(state.tallest, height) : height;
  const open = tallest - height >= KEYBOARD_MIN_PX;
  const closed = Boolean(sameWidth && state.open && !open);
  return { state: { width, tallest, open }, closed };
}

/** Whether an element is something a caret blinks in. */
export function holdsCaret(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  const type = String(el.type || 'text').toLowerCase();
  return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image', 'hidden'].includes(type);
}

/** Only on a touch screen, where the keyboard is on the screen. Returns an undo. */
export function installKeyboardCaret(win = window) {
  const vv = win.visualViewport;
  const touch = win.matchMedia?.('(pointer: coarse)')?.matches;
  if (!vv || !touch) return () => {};
  let state = null;
  const measure = () => {
    const step = keyboardStep(state, { width: Math.round(vv.width), height: Math.round(vv.height) });
    state = step.state;
    if (!step.closed) return;
    const active = win.document.activeElement;
    if (holdsCaret(active)) active.blur();
  };
  measure();
  vv.addEventListener('resize', measure);
  return () => vv.removeEventListener('resize', measure);
}
