/**
 * When the editor tells the rest of the app that the writing changed.
 *
 * ## What was asked for
 *
 * "Writing on the phone it seems like even without images the writing is slow,
 * like slightly slower than it should be."
 *
 * ## What was measured
 *
 * A keystroke in a note of 15,930 characters costs about 7ms. Roughly 3.4ms of
 * that is ours and runs inside the key event, before the browser is allowed to
 * draw the character:
 *
 * | | per keystroke |
 * | --- | --- |
 * | serialising the document (`getHTML()`) | ~1.5ms |
 * | the Svelte cascade after `dispatch('change')` | ~1.9ms |
 *
 * The rest is the browser laying the document out again, which is a separate
 * item (see PENDING.md 1a).
 *
 * ## Why a delay makes typing faster
 *
 * The obvious reading of "coalesce" is that several keystrokes get merged into
 * one piece of work, and for a fast burst — holding backspace, a phone keyboard
 * inserting a whole word — they do. But most typing is slower than this window,
 * so most of the time nothing is merged at all, and the win is somewhere else:
 * the work is no longer *on the way* to the character appearing. The keystroke
 * returns, the browser paints, and the serialising happens afterwards.
 *
 * So the number below is not "how much typing to swallow". It is short enough
 * to be invisible and long enough to be a different task from the keypress.
 *
 * Measured afterwards, against the same component with the delay switched off,
 * on a note of 16,000 characters: thirty edits cost **thirty** serialise-and-
 * dispatch passes and 15.5ms before, and **six** passes and 2.1ms after. Those
 * per-pass numbers are from a development build on a note of one long
 * paragraph, which is the cheapest possible document to serialise — a real
 * note, with its marks and its paragraphs, costs more per pass and so saves
 * more. The ratio is the part worth quoting.
 *
 * ## Only typing is ever made to wait
 *
 * Content set into the editor by the app — an undo being applied, a copy
 * arriving from another device — is sent on immediately, because the code that
 * set it does its own bookkeeping on the line after and the order the two
 * happen in is load-bearing. Whatever is waiting is also sent before any of
 * those, or it would be overwritten by them and the characters would be gone.
 * The call site says where those points are; this only counts the time.
 */

/** Long enough to be a separate task from the keypress, short enough to be invisible. */
export const COALESCE_MS = 50;

/**
 * Something that collects changes and sends at most one every `delay`.
 *
 * `send` is called with nothing and reads the editor itself, rather than being
 * handed a value when the change was noted. That is deliberate: the point is to
 * serialise *once*, at the end, from whatever the document has become — holding
 * a value per keystroke would put back the cost that was just taken out.
 *
 * The timers are injected so the whole of this can be exercised without one.
 */
export function createUpdateCoalescer({
  send,
  delay = COALESCE_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  let timer = null;

  const fire = () => {
    timer = null;
    send?.();
  };

  return {
    /** Something changed. Starts the clock, or lets a running one finish. */
    noteChange() {
      // A burst keeps the first timer rather than pushing it back. A window
      // that restarts on every keystroke never ends while somebody is typing,
      // so the writing would reach the save and the undo history only once
      // they stopped — which is the failure this is meant to avoid, not a
      // version of it.
      if (timer !== null) return;
      timer = setTimer(fire, delay);
    },

    /**
     * Send now, if anything is waiting. Returns whether it sent, so a caller
     * can tell "there was nothing to do" from "it has been done".
     */
    flush() {
      if (timer === null) return false;
      clearTimer(timer);
      fire();
      return true;
    },

    /** Drop what is waiting without sending it. For a teardown that has already flushed. */
    stop() {
      if (timer === null) return;
      clearTimer(timer);
      timer = null;
    },

    /** Whether there is a change that has not been sent yet. */
    get waiting() {
      return timer !== null;
    }
  };
}
