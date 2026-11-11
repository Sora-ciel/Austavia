/**
 * "/" in the writing on a page: a menu of blocks to put where it was typed.
 *
 * ## What was asked for
 *
 * Planned 2026-10-27 (PENDING, "Page mode, and nests": "You'll be able to add
 * the blocks using '/' and the name of the block or command"), and asked for
 * 2026-11-04: "i want the typing to insert a block and the if you want to add
 * a block that already exist." So one menu, opened by "/", filtered by what
 * is typed after it, offering both a new block of each kind and the folder's
 * blocks not on the page yet. The "＋ Block…" button opens the same menu.
 *
 * ## The rules (here, so they can be tested)
 *
 * - `slashAt`: the menu is open while the text before the caret, in its
 *   line, ends with "/" and a word -- at the start of the line or after a
 *   space, so a date (4/11) or a link (a/b) never opens it.
 * - `slashItems`: what it offers for what is typed.
 * - `slashSplit`: where the block goes -- under the writing when "/" was at
 *   the end of it, over it when at the start, and between two halves of it
 *   otherwise, the text after the "/" becoming a text block of its own. A
 *   "/" alone in otherwise empty writing takes its place, as on an empty
 *   line: the block goes above, and the empty writing stays under it to
 *   carry on in.
 */

const MAX_QUERY = 30;

/** The "/" being typed before the caret, or null: `{ query, length }`, length counting the "/". */
export function slashAt(textBefore) {
  const match = /(?:^|\s)\/([^\s/]*)$/u.exec(String(textBefore ?? ''));
  if (!match || match[1].length > MAX_QUERY) return null;
  return { query: match[1], length: match[1].length + 1 };
}

const fold = value => String(value ?? '').toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/**
 * The menu's rows for `query`: a new block of each kind (`types`, `{ type,
 * label }`), then the existing ones (`existing`, `{ id, type, name }`) under
 * the name of their kind. A row matches when its name or its kind starts a
 * word with what was typed. Existing ones are capped, the rest being a
 * matter of typing more.
 */
export function slashItems({ query = '', types = [], existing = [], maxExisting = 8 } = {}) {
  const q = fold(query).trim();
  const typeLabel = new Map(types.map(t => [t.type, t.label]));
  const matches = (...texts) => !q || texts.some(text => fold(text).split(/[\s,.;:()-]+/).some(word => word.startsWith(q)) || fold(text).startsWith(q));
  const fresh = types
    .filter(t => matches(t.label, t.type))
    .map(t => ({ id: `new:${t.type}`, kind: 'new', type: t.type, name: t.label, hint: 'New' }));
  const old = existing
    .filter(b => matches(b.name, typeLabel.get(b.type) || b.type))
    .slice(0, maxExisting)
    .map(b => ({ id: `block:${b.id}`, kind: 'existing', type: b.type, blockId: b.id, name: b.name, hint: typeLabel.get(b.type) || b.type }));
  return [...fresh, ...old];
}

/** The next row to highlight for an arrow key, going round at the ends. */
export function stepChoice(index, count, key) {
  if (!count) return 0;
  if (key === 'ArrowDown') return (index + 1) % count;
  if (key === 'ArrowUp') return (index - 1 + count) % count;
  return Math.min(Math.max(index, 0), count - 1);
}

/** Where the block goes, from whether there is writing before and after the "/". */
export function slashSplit({ beforeEmpty, afterEmpty }) {
  if (beforeEmpty && afterEmpty) return 'above';
  if (afterEmpty) return 'below';
  if (beforeEmpty) return 'above';
  return 'split';
}

/** The tallest the menu is drawn, as in its style (min(340px, 60vh)). */
export const MENU_MAX_HEIGHT = 340;

/**
 * Where the menu goes: under the caret at (x, y), or above it when there is
 * no room below, always inside `view` -- the part of the screen that can be
 * seen -- and no taller than the room there is.
 *
 * `view` is the visible part, not the window: on a phone the keyboard covers
 * the bottom of the window without making it any shorter, and the menu went
 * behind the keyboard, out of reach (reported 2026-11-11: "it stays behind
 * the keyboard making it impossible to choose"). The call site reads it from
 * window.visualViewport.
 */
export function menuPlacement({ x = 0, y = 0, width = 0, height = 0, view, gap = 6, caretHeight = 22, margin = 8 }) {
  const area = view || { top: 0, bottom: 0, left: 0, right: 0 };
  const left = Math.max(area.left + margin, Math.min(x, area.right - width - margin));
  const below = area.bottom - margin - (y + gap);
  const above = (y - caretHeight - gap) - (area.top + margin);
  const wanted = Math.min(height, MENU_MAX_HEIGHT);
  if (wanted <= below) return { left, top: y + gap, maxHeight: MENU_MAX_HEIGHT };
  if (wanted <= above) return { left, top: y - caretHeight - gap - wanted, maxHeight: MENU_MAX_HEIGHT };
  // Room on neither side for all of it: the bigger side, its list scrolling.
  if (below >= above) return { left, top: y + gap, maxHeight: Math.max(80, below) };
  const room = Math.max(80, above);
  return { left, top: Math.max(area.top + margin, y - caretHeight - gap - room), maxHeight: room };
}
