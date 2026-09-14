/**
 * How much of the control bar fits on one line, and what goes behind the menu.
 *
 * ## What was asked for
 *
 * "We also need to improve the controls UI for smaller screen sizes than FHD.
 * Basically as the screen size gets smaller, more and more buttons should go to
 * the menu button — at first the ones that are least likely to be used. So that
 * if you are on only an HD computer you don't have the controls in two lines,
 * and the most buttons you can have without having to click the menu button
 * first, so that you have the least need to open it. Do that till it's like our
 * phone screen size."
 *
 * There were two states before this: everything on the bar, or — at 1024px and
 * under — everything behind the menu. In between, the bar simply wrapped onto a
 * second line, which costs a strip of the window on every screen that is not
 * 1920 wide.
 *
 * ## Measured, not guessed at
 *
 * The obvious way is a ladder of breakpoints: hide Clear under 1600, Export
 * under 1450, and so on. It is wrong the moment anything changes size — a
 * longer file name, a theme with a wider font, a mode whose name is two words,
 * a browser zoomed to 110% — and it is wrong in the expensive direction, either
 * wrapping anyway or hiding buttons that would have fitted.
 *
 * So the caller measures what it has: the width of the bar, and the width each
 * control took when it was last on it. This works out what fits. The answer is
 * exact at any width, in any theme, at any zoom, and it needs no numbers in it.
 *
 * ## In order, and no further
 *
 * Controls leave the bar from the bottom of `CONTROL_PRIORITY` upwards, and the
 * search stops at the first one that does not fit rather than carrying on to
 * see whether something smaller further down would.
 *
 * Carrying on would fit another button or two at some widths, which is the
 * letter of "the most buttons you can have". It would also mean Clear sitting
 * on the bar while Import is in the menu, purely because Clear is a shorter
 * word — the order would change under you as you resized, and the thing you
 * reach for without looking would move. A bar you can learn is worth more than
 * one more button at one width.
 *
 * For the same reason the order controls *leave* in is not the order they are
 * *shown* in. Which one goes first is about how often it is used; where it sits
 * is where it has always sat, and a window being resized is no reason for the
 * bar to rearrange itself.
 */

/**
 * The controls, most likely to be used first.
 *
 * Leaving the bar happens from the end. The first two are what the bar is for —
 * getting to another mode and putting something on the page — and everything
 * else is arranged behind them by how often a hand goes to it.
 */
export const CONTROL_PRIORITY = [
  'mode',
  'addBlock',
  'undo',
  'redo',
  'fileName',
  'moveBlock',
  'columns',
  'bg',
  'export',
  'import',
  'clear',
  // Last off the bar, which is to say first into the menu. A text size is set
  // once and then lived with; of everything here it is the control a hand goes
  // to least often, so it is the one whose place on the bar is worth least.
  'text'
];

/** Left to right, as the bar has always read. */
export const CONTROL_ORDER = [
  'mode',
  'addBlock',
  'moveBlock',
  'clear',
  'export',
  'import',
  'undo',
  'redo',
  'fileName',
  'columns',
  'bg',
  // Next to Bg, because they are the two panels rather than the two buttons,
  // and somebody looking for a setting looks where the last setting was.
  'text'
];

/** The bar is never empty: without this a narrow enough window hides the lot. */
export const ALWAYS_ON_BAR = ['mode'];

/** Sorted the way the bar reads, with anything unranked left where it was. */
function inDisplayOrder(ids, order) {
  const place = (id) => {
    const index = (order || []).indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...ids].sort((a, b) => place(a) - place(b));
}

/**
 * What stays on the bar and what goes behind the menu button.
 *
 * `present` is the controls this mode actually has, in any order. `widths` maps
 * a control to the pixels it took on the bar; a control with no measurement yet
 * is assumed to fit, so the first paint shows everything and the measurement
 * that follows is what narrows it — showing too much for one frame is better
 * than hiding something that would have fitted.
 */
export function fitControls({
  present = [],
  widths = {},
  available = 0,
  gap = 8,
  menuWidth = 0,
  priority = CONTROL_PRIORITY,
  order = CONTROL_ORDER,
  alwaysOnBar = ALWAYS_ON_BAR
} = {}) {
  const here = new Set(present || []);
  const ordered = (priority || []).filter((id) => here.has(id));
  // Anything the priority list has never heard of still has to go somewhere,
  // and the safe place is the bar: an unknown control is more likely to be new
  // than to be unimportant.
  for (const id of present || []) if (!ordered.includes(id)) ordered.unshift(id);

  const widthOf = (id) => {
    const value = Number(widths?.[id]);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };

  const measured = ordered.filter((id) => widthOf(id) > 0);
  if (!Number.isFinite(available) || available <= 0 || measured.length !== ordered.length) {
    return { bar: inDisplayOrder(ordered, order), menu: [] }; // nothing to decide with yet
  }

  const laidOut = (ids) =>
    ids.reduce((total, id, index) => total + widthOf(id) + (index ? gap : 0), 0);

  if (laidOut(ordered) <= available) return { bar: inDisplayOrder(ordered, order), menu: [] };

  // Room for the menu button has to come out of the budget, or the last control
  // to fit pushes the button that holds the rest onto a second line.
  const budget = available - (menuWidth ? menuWidth + gap : 0);

  const bar = [];
  for (const id of ordered) {
    const next = [...bar, id];
    if (laidOut(next) <= budget || (alwaysOnBar || []).includes(id)) {
      bar.push(id);
      continue;
    }
    break;
  }

  const kept = new Set(bar);
  return {
    bar: inDisplayOrder(bar, order),
    menu: inDisplayOrder(ordered.filter((id) => !kept.has(id)), order)
  };
}
