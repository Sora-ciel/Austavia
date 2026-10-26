/**
 * Where a task being dragged will land, and where to draw the line that says so.
 *
 * ## What was asked for
 *
 * 2026-10-26, Task mode: "when moving a task from its order I see that it shows
 * a line below or above another task, but it should be better than that. When
 * you're past the middle height of a note it should already register that the
 * task is going to be put below or above the middle. And if it's the case it
 * puts a line so that you see it will be put there, in the middle of two tasks
 * or below the last task. A big line that is right in the middle of them.
 * Also the line is the colour of the text."
 *
 * ## What was wrong with the old one
 *
 * It asked which task was under the pointer, then which half of it. In the gap
 * between two tasks nothing is under the pointer, so the line vanished; and
 * the line was drawn on the edge of one task, not between two, so "above this
 * one" and "below that one" looked like different places when they are the
 * same.
 *
 * ## The rule
 *
 * The tasks the dragged one can land among, in order, each described by its
 * top and bottom on screen. The slot is the number of those whose middle is
 * above the pointer -- so crossing a task's middle is what moves the slot, and
 * a gap belongs to the slot it sits in. The line goes halfway between the task
 * above the slot and the task below it; above the first or below the last, it
 * sits half a gap outside.
 *
 * The dragged task itself is left out of the list: dropping it next to where
 * it already is changes nothing, and it should not take a slot of its own.
 */

/** Which slot the pointer is in: 0 is above the first task, n below the last. */
export function dropSlot(rects = [], y = 0) {
  let slot = 0;
  for (const rect of rects) {
    if (y > (rect.top + rect.bottom) / 2) slot += 1;
    else break;
  }
  return slot;
}

/** Where the line for a slot goes, in the same coordinates as the rects. */
export function dropLineY(rects = [], slot = 0, gap = 6) {
  if (!rects.length) return null;
  const s = Math.max(0, Math.min(rects.length, slot));
  if (s === 0) return rects[0].top - gap / 2;
  if (s === rects.length) return rects[rects.length - 1].bottom + gap / 2;
  return (rects[s - 1].bottom + rects[s].top) / 2;
}

/**
 * The list with the dragged task moved into a slot among the tasks it was
 * dragged across (`group`, in order, without it). Everything else keeps its
 * place. Returns the same list when nothing would move.
 */
export function moveToSlot(list = [], draggedId, group = [], slot = 0) {
  const from = list.findIndex(item => item?.id === draggedId);
  if (from < 0) return list;
  const dragged = list[from];
  const rest = list.filter((_, i) => i !== from);
  let at;
  if (!group.length) at = from;
  else if (slot >= group.length) at = rest.findIndex(item => item?.id === group[group.length - 1].id) + 1;
  else at = rest.findIndex(item => item?.id === group[Math.max(0, slot)].id);
  if (at < 0) return list;
  const next = [...rest.slice(0, at), dragged, ...rest.slice(at)];
  return next.every((item, i) => item === list[i]) ? list : next;
}
