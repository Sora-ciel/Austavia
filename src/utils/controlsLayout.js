/**
 * How the controls are laid out on this device, and which modes they offer.
 *
 * ## What was asked for
 *
 * 2026-11-10, on how modes are changed: on a phone the bar at the bottom,
 * taking no more height than before; on a computer a column of mode icons
 * down the left edge; modes put in order or hidden. Then, the same day: "In
 * advanced settings we'll have another button that will be called controls
 * layout where for phone and pc we can change the layout and basically go
 * back to the way things were before our update for both phone or pc. and
 * it's saved per device for now. Later we will save it per account per
 * default. but not until maybe 1 year."
 *
 * So this is how this device shows things, kept on the device (CLAUDE.md,
 * "Everything somebody makes syncs" -- this is not content). PENDING, "How
 * modes are changed", says when it becomes the account's default.
 *
 * - `phone`: 'bottom' (the bar at the bottom, the new way) or 'top' (as it was).
 * - `computer`: 'rail' (the column of modes, the new way), 'auto' (the column
 *   hidden until the pointer reaches the left edge -- asked 2026-11-10) or
 *   'top' (as it was).
 * - `order`: the modes in the order chosen; modes this list does not name
 *   (one added later) come after, in their own order.
 * - `hidden`: modes left out of the column, the sheet and the swipe. The mode
 *   open now is always offered, so nobody is stranded in a hidden one.
 * - `statusBar`: the phone's own status bar (time, battery) 'shown', with the
 *   mode reaching up under it and its content kept clear of it, or 'hidden'
 *   (asked 2026-11-10: "maybe make the phone's info disappear? and being able
 *   to disable it in layout").
 */

export const LAYOUT_KEY = 'austavia.controlsLayout';
export const PHONE_LAYOUTS = ['bottom', 'top'];
export const COMPUTER_LAYOUTS = ['rail', 'auto', 'top'];
export const STATUS_BAR = ['shown', 'hidden'];
/**
 * How a finger on the phone's bar changes mode -- two to compare, asked
 * 2026-11-10: "make it so that i can change between one or the other to see
 * which one is neater". 'strip': sliding along the bar shows every mode in a
 * strip, each at its own place, the open one where the finger started.
 * 'sheet': sliding up from the bar opens the modes, and letting go on one
 * opens it.
 */
export const MODE_GESTURES = ['strip', 'sheet'];
// The defaults, chosen 2026-11-10 for the release: the slide up on a phone,
// and on a computer the column hidden until the pointer reaches the edge.
export const DEFAULT_LAYOUT = Object.freeze({ phone: 'bottom', computer: 'auto', order: [], hidden: [], statusBar: 'shown', modeGesture: 'sheet' });

const strings = list => (Array.isArray(list) ? list.filter(item => typeof item === 'string' && item) : []);

/** A layout as stored, cleaned; the default for anything missing or unknown. */
export function normalizeLayout(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    phone: PHONE_LAYOUTS.includes(value.phone) ? value.phone : DEFAULT_LAYOUT.phone,
    computer: COMPUTER_LAYOUTS.includes(value.computer) ? value.computer : DEFAULT_LAYOUT.computer,
    order: [...new Set(strings(value.order))],
    hidden: [...new Set(strings(value.hidden))],
    statusBar: STATUS_BAR.includes(value.statusBar) ? value.statusBar : DEFAULT_LAYOUT.statusBar,
    modeGesture: MODE_GESTURES.includes(value.modeGesture) ? value.modeGesture : DEFAULT_LAYOUT.modeGesture
  };
}

export function readLayout(storage) {
  try {
    return normalizeLayout(JSON.parse(storage?.getItem(LAYOUT_KEY) || '{}'));
  } catch {
    return normalizeLayout({});
  }
}

export function writeLayout(storage, layout) {
  try {
    storage?.setItem(LAYOUT_KEY, JSON.stringify(normalizeLayout(layout)));
  } catch {
    // Not remembered: the next visit opens on the default.
  }
}

/** Every mode, in the order chosen, then any the order does not name. */
export function orderedModes(allModes, layout) {
  const known = new Set(allModes);
  const chosen = normalizeLayout(layout).order.filter(id => known.has(id));
  return [...chosen, ...allModes.filter(id => !chosen.includes(id))];
}

/** The modes offered: in order, without the hidden ones -- but never without the one open now. */
export function offeredModes(allModes, layout, current = null) {
  const hidden = new Set(normalizeLayout(layout).hidden);
  return orderedModes(allModes, layout).filter(id => !hidden.has(id) || id === current);
}

/** The mode a swipe goes to: the next or previous offered one, going round. */
export function neighbourMode(allModes, layout, current, direction) {
  const offered = offeredModes(allModes, layout, current);
  if (offered.length < 2) return current;
  const at = Math.max(0, offered.indexOf(current));
  return offered[(at + (direction > 0 ? 1 : -1) + offered.length) % offered.length];
}

/** The layout with a mode moved one place up (-1) or down (+1) in the order. */
export function movedMode(allModes, layout, id, step) {
  const order = orderedModes(allModes, layout);
  const at = order.indexOf(id);
  const to = at + step;
  if (at === -1 || to < 0 || to >= order.length) return normalizeLayout(layout);
  [order[at], order[to]] = [order[to], order[at]];
  return { ...normalizeLayout(layout), order };
}

/** The layout with a mode shown or hidden. At least one mode always stays shown. */
export function withModeHidden(allModes, layout, id, hide) {
  const current = normalizeLayout(layout);
  const hidden = new Set(current.hidden);
  if (hide) hidden.add(id); else hidden.delete(id);
  if (allModes.every(mode => hidden.has(mode))) return current;
  return { ...current, hidden: [...hidden] };
}

/** Whether a horizontal finger movement along the bar is a swipe to the next mode: far enough, and more across than down. */
export function swipeDirection(dx, dy, { min = 60 } = {}) {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * How many modes a slide along the bar has gone through: one for every
 * `step` pixels across, positive for the next ones (sliding left), or null
 * while the finger is going more down than across. Asked 2026-11-10: "we
 * should be able to slide through multiple modes in one movement if we do it
 * slow. and show the name of the mode we'll use with its icon while we
 * slide."
 */
export function slideSteps(dx, dy, { step = 64 } = {}) {
  if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) return null;
  const steps = Math.trunc(Math.abs(dx) / step);
  return dx < 0 ? steps : -steps;
}

/** The mode so many places on from the open one, among those offered, going round. */
export function modeAfterSteps(allModes, layout, current, steps) {
  const offered = offeredModes(allModes, layout, current);
  if (!offered.length || !steps) return current;
  const at = Math.max(0, offered.indexOf(current));
  const n = offered.length;
  return offered[(((at + steps) % n) + n) % n];
}

/**
 * The strip of modes (modeGesture 'strip'): every mode always at the same
 * place, in their order, across the width -- whichever mode is open -- with
 * a space in the middle where letting go keeps the mode you are in. Asked
 * 2026-11-10, correcting the first strip, which slid so the open mode sat
 * under the finger: "every mode should always be at the same place. it
 * should show all modes at all time and not slide ... it should separate the
 * modes so that there's a space in the middle so that if you go back you
 * stay on the mode you were at."
 *
 * The first half of the modes (rounded up) to the left of the space, the
 * rest to its right. Returns each slot's left edge and the space's edges.
 */
export function stripLayout(count, width, { margin = 8, gap = 1.2 } = {}) {
  const usable = Math.max(0, width - 2 * margin);
  const slot = count > 0 ? usable / (count + gap) : 0;
  const leftCount = Math.ceil(count / 2);
  const slots = Array.from({ length: count }, (_, i) => ({
    index: i,
    left: margin + (i < leftCount ? i : i + gap) * slot,
    width: slot
  }));
  const spaceLeft = margin + leftCount * slot;
  return { slot, slots, space: { left: spaceLeft, right: spaceLeft + gap * slot } };
}

/** The mode under a finger at `x` in the strip: its index, or null over the space (stay). */
export function stripPick(x, layout) {
  if (x >= layout.space.left && x < layout.space.right) return null;
  const hit = layout.slots.find(s => x >= s.left && x < s.left + s.width);
  if (hit) return hit.index;
  // Past either end: the mode at that end.
  if (!layout.slots.length) return null;
  return x < layout.slots[0].left ? 0 : layout.slots.length - 1;
}

/**
 * Which way a finger set off from the bar: 'across' (the strip), away from
 * the bar into the screen (the sheet) -- 'up' from a bar at the bottom,
 * 'down' from one at the top (`toward`) -- or null while it has not gone far,
 * or went the other way.
 *
 * From the top too since 2026-11-11: "the modes slides don't work when the
 * controls are up. ... if the bar is up it works from up to bottom".
 */
export function gestureStart(dx, dy, { min = 12, toward = 'up' } = {}) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return null;
  const inward = toward === 'down' ? dy : -dy;
  if (inward > Math.abs(dx)) return toward === 'down' ? 'down' : 'up';
  if (Math.abs(dx) >= Math.abs(dy)) return 'across';
  return null;
}

/**
 * Whether a touch that began at `y` is the bar's: on it, and for a bar at the
 * bottom also in a band half its height above it, so a slide can start just
 * off it (asked 2026-11-10).
 *
 * Not under a bar at the top. It was given one on 2026-11-11 and taken off
 * the same day: "remove the band when the bar is up, it actually makes things
 * hard to move in canvas mode" -- the top of a mode is where blocks are
 * picked up, and the band took those touches.
 */
export function inBarBand(y, bar, at = 'bottom') {
  if (!bar) return false;
  if (y >= bar.top && y <= bar.bottom) return true;
  if (at === 'top') return false;
  const band = (bar.bottom - bar.top) / 2;
  return y < bar.top && y >= bar.top - band;
}

/**
 * Whether this is a phone, for where the controls go: narrow, or a touch
 * screen whose short side is a phone's. By width alone, a phone turned on its
 * side was wide enough to count as a computer, and the bar chosen to be at
 * the bottom went back to the top (reported 2026-11-11: "when i turn my phone
 * around the controls go back up even though i chose below").
 */
export function isPhoneShape({ width = 0, height = 0, coarse = false } = {}) {
  if (width <= 700) return true;
  return coarse && Math.min(width, height) <= 500;
}
