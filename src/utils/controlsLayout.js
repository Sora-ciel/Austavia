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
 * - `computer`: 'rail' (the column of modes, the new way) or 'top' (as it was).
 * - `order`: the modes in the order chosen; modes this list does not name
 *   (one added later) come after, in their own order.
 * - `hidden`: modes left out of the column, the sheet and the swipe. The mode
 *   open now is always offered, so nobody is stranded in a hidden one.
 */

export const LAYOUT_KEY = 'austavia.controlsLayout';
export const PHONE_LAYOUTS = ['bottom', 'top'];
export const COMPUTER_LAYOUTS = ['rail', 'top'];
export const DEFAULT_LAYOUT = Object.freeze({ phone: 'bottom', computer: 'rail', order: [], hidden: [] });

const strings = list => (Array.isArray(list) ? list.filter(item => typeof item === 'string' && item) : []);

/** A layout as stored, cleaned; the default for anything missing or unknown. */
export function normalizeLayout(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    phone: PHONE_LAYOUTS.includes(value.phone) ? value.phone : DEFAULT_LAYOUT.phone,
    computer: COMPUTER_LAYOUTS.includes(value.computer) ? value.computer : DEFAULT_LAYOUT.computer,
    order: [...new Set(strings(value.order))],
    hidden: [...new Set(strings(value.hidden))]
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
