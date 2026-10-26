/**
 * Picking up an item in a list and putting it somewhere else: the one way
 * every list in the app is reordered.
 *
 * ## Why this exists
 *
 * Task mode's reordering was written inside TaskMode.svelte -- its own handle
 * drag, its own press-and-hold with its own timer, its own scroll lock. The
 * habit tracker then wanted the same thing (2026-10-26, "drag to reorder, with
 * Task mode's drop line"), and the rule asked for the same day is that two
 * things doing the same job use the same code: "use the least amount of
 * different code when two things use the same thing" (CLAUDE.md, "One of
 * everything"). So it lives here, and both modes use it.
 *
 * Where the item lands, and where the line is drawn, is decided in
 * dropPlacement.js; holding a finger down is decided in longPress.js. This
 * only carries those out against the page.
 *
 * ## The gestures
 *
 * - **A mouse** drags from the item's handle, at once.
 * - **A finger** holds the item for a moment to pick it up -- moving before
 *   then is scrolling, and the hold is dropped. Once picked up, the page stops
 *   scrolling under it and it follows the finger.
 * - **A hold let go without moving** is not a reorder. It is how a phone asks
 *   for an item's menu, there being no right-click: `onHeld` is called, and the
 *   click that follows the lift is swallowed (`swallowClick`), so it does not
 *   also tick whatever was under the finger.
 *
 * ## What the caller gives it
 *
 * - `listOf(id)`: the element the dragged item's line is drawn in. It should be
 *   positioned (relative), since the line's `y` is measured from its top.
 * - `itemsIn(list)`: the items the dragged one can land among, in order.
 * - `idOf(element)`: an item element's id.
 * - `onLine(line)`: `{ list, y }` while there is a place to show, else null.
 * - `onDrop(id, groupIds, slot)`: let go after moving, over a slot.
 * - `onHeld(id, point)`: let go after a hold, without moving.
 * - `onPick(id)`: an item picked up (its id), or put down (null) -- for
 *   styling the one being carried.
 */

import { dropSlot, dropLineY } from './dropPlacement.js';
import { createLongPress, movedTooFar } from './longPress.js';

export const DROP_GAP = 6;

/**
 * How long a finger holds an item to pick it up. Shorter than longPress.js's
 * 500ms on purpose: Android opens its own long-press (contextmenu) at about
 * that moment, and the pick-up has to have happened first so the item's own
 * handler can tell the two apart. Task mode used 420ms from the start.
 */
export const PICK_UP_MS = 420;

/**
 * How soon after a hold is let go a click still belongs to it. A phone often
 * sends no click at all after a long press; a "swallow the next click" with no
 * time limit then waited and ate the next real tap, whenever it came -- seen
 * 2026-10-26 as a day that would not take its third tap.
 */
export const HOLD_CLICK_MS = 400;

export function createListReorder({
  listOf,
  itemsIn,
  idOf,
  onLine = () => {},
  onDrop = () => {},
  onHeld = () => {},
  onPick = () => {},
  gap = DROP_GAP
} = {}) {
  let draggingId = null;
  let heldByTouch = false;
  let moved = false;
  let origin = { x: 0, y: 0 };
  let group = [];
  let slot = null;
  let pressedId = null;
  let swallowUntil = 0;

  const hold = createLongPress({
    delay: PICK_UP_MS,
    onLongPress: point => {
      // The hold has become a pick-up; from here the drag listens instead.
      stopHold();
      begin(pressedId, { held: true, point });
    }
  });

  const preventScroll = event => event.preventDefault();

  function listen() {
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    // Block the page scrolling while an item is held by a finger.
    document.addEventListener('touchmove', preventScroll, { passive: false });
  }

  function unlisten() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', cancel);
    document.removeEventListener('touchmove', preventScroll);
  }

  function begin(id, { held = false, point = { x: 0, y: 0 } } = {}) {
    if (!id) return;
    draggingId = id;
    heldByTouch = held;
    moved = false;
    origin = point;
    onPick(id);
    if (held && typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(15); } catch { /* not every phone */ }
    }
    listen();
  }

  function move(event) {
    if (!draggingId) return;
    const point = { x: event.clientX, y: event.clientY };
    if (movedTooFar(origin, point, 8)) moved = true;
    const list = listOf(draggingId);
    if (!list) { slot = null; onLine(null); return; }
    const top = list.getBoundingClientRect().top;
    const items = itemsIn(list).filter(element => idOf(element) !== draggingId);
    const rects = items.map(element => {
      const r = element.getBoundingClientRect();
      return { top: r.top - top, bottom: r.bottom - top };
    });
    group = items.map(idOf);
    slot = dropSlot(rects, point.y - top);
    const y = dropLineY(rects, slot, gap);
    onLine(y === null ? null : { list, y, id: draggingId });
  }

  // A pointer the system took away -- a call, a gesture of its own -- puts
  // the item back where it was rather than wherever the finger last was.
  function cancel() {
    end({ cancelled: true });
  }

  function end({ cancelled = false } = {}) {
    unlisten();
    const id = draggingId;
    const wasHeldStill = !cancelled && heldByTouch && !moved;
    if (!cancelled && id && moved && slot !== null) onDrop(id, group, slot);
    draggingId = null;
    heldByTouch = false;
    group = [];
    slot = null;
    onLine(null);
    onPick(null);
    if (wasHeldStill) {
      swallowUntil = Date.now() + HOLD_CLICK_MS;
      onHeld(id, origin);
    }
  }

  function stopHold() {
    hold.cancel();
    window.removeEventListener('pointermove', holdMove);
    window.removeEventListener('pointerup', releaseHold);
    window.removeEventListener('pointercancel', releaseHold);
  }

  // A finger lifted, or wandered off, before the hold became a pick-up.
  function releaseHold() {
    stopHold();
  }

  function holdMove(event) {
    hold.move({ x: event.clientX, y: event.clientY });
  }

  return {
    /** A mouse on the item's handle: picked up at once. */
    handleDown(event, id) {
      event.preventDefault();
      begin(id, { point: { x: event.clientX, y: event.clientY } });
    },

    /** Any pointer on the item itself: a finger starts a hold, a mouse nothing. */
    itemDown(event, id) {
      if (event.pointerType === 'mouse') return;
      if (event.target?.closest?.('button, input, textarea, a, [contenteditable="true"]')) return;
      pressedId = id;
      hold.start({ x: event.clientX, y: event.clientY });
      window.addEventListener('pointermove', holdMove);
      window.addEventListener('pointerup', releaseHold);
      window.addEventListener('pointercancel', releaseHold);
    },

    /** The click after a hold, eaten before it does anything. True if eaten. */
    swallowClick(event) {
      if (Date.now() > swallowUntil) return false;
      swallowUntil = 0;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return true;
    },

    get draggingId() {
      return draggingId;
    },

    destroy() {
      stopHold();
      unlisten();
    }
  };
}
