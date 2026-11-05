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
