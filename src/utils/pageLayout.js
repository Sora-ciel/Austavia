/**
 * What a page shows: rows of the folder's blocks, a row being one block or
 * several side by side.
 *
 * ## What was asked for
 *
 * 2026-10-27, settled in PENDING ("Page mode, and nests"): a mode like
 * Notion's pages, where "it doesn't show all blocks from the get go, but you
 * can add blocks that already exist in the folder ... and then you should be
 * able to see if you create a new one or show one that exists already."
 *
 * 2026-11-04, on seeing the first version: "on one line or multiple lines we
 * can have multiple blocks sharing the width etc." -- so rows rather than a
 * list; and "the page wherever you click, it's basically a line and you can
 * directly write something" -- `clickBelow`.
 *
 * ## The shape
 *
 * `modeSettings.page.rows`: `[{ cells: [{ blockId }] }]`. The blocks are the
 * folder's own -- the clock on a page is the clock the Canvas shows -- so a
 * page holds no data of its own (CLAUDE.md, "a mode only shows blocks").
 *
 * Not `modeOrders`: those always hold every block of the folder, and drop
 * any id they cannot find. A page holds only what was put on it, and later
 * (PENDING step 6) blocks from other folders, `{ folderId, blockId }`, which
 * this folder cannot find and must not drop.
 *
 * ## Kept as it comes
 *
 * A cell this build does not understand -- one with a `folderId`, or of a
 * kind added later -- is kept in its place and not shown, and so are fields
 * on rows and cells it does not know (CLAUDE.md, "an older version keeps
 * what it does not understand"). A cell whose block is gone from this folder
 * is not shown either, and is only tidied away when the page is next changed
 * (`tidyPage`): an Undo can bring the block back, and finds it in its place.
 */

import { withUnknown } from './keepUnknown.js';

const isCell = cell => cell && typeof cell === 'object' && typeof cell.blockId === 'string' && cell.blockId;
/** A cell this build shows: a block of this folder. */
const isLocal = cell => isCell(cell) && !cell.folderId;
const cellKey = cell => `${cell.folderId || ''}\u0000${cell.blockId}`;

/** The rows as stored, cleaned: anything not a cell dropped, a block on the page once, no empty rows, unknown fields kept. */
export function normalizePageRows(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !Array.isArray(row.cells)) continue;
    const cells = [];
    for (const cell of row.cells) {
      if (!isCell(cell) || seen.has(cellKey(cell))) continue;
      seen.add(cellKey(cell));
      cells.push(withUnknown({ blockId: cell.blockId }, cell, ['blockId']));
    }
    if (cells.length) out.push(withUnknown({ cells }, row, ['cells']));
  }
  return out;
}

/** The page's settings as stored: `{ rows }`, plus whatever a newer build added. */
export function normalizePageSettings(page) {
  return withUnknown({ rows: normalizePageRows(page?.rows) }, page || {}, ['rows']);
}

/** The rows the page shows, each `{ key, blocks }`, in its order; a row with nothing to show is left out. */
export function blocksOnPage(rows, blocks = []) {
  const byId = new Map((blocks || []).map(block => [block.id, block]));
  const out = [];
  for (const row of rows || []) {
    const shown = (row.cells || []).filter(isLocal).map(cell => byId.get(cell.blockId)).filter(Boolean);
    if (shown.length) out.push({ key: shown[0].id, blocks: shown });
  }
  return out;
}

/** The folder's blocks that are not on the page, in the folder's order: what is offered as existing. */
export function blocksOffPage(rows, blocks = []) {
  const on = new Set();
  for (const row of rows || []) for (const cell of row.cells || []) if (isLocal(cell)) on.add(cell.blockId);
  return (blocks || []).filter(block => !on.has(block.id));
}

/** The rows without the local cells whose block is gone; other folders' cells stay. */
export function tidyPage(rows, blocks = []) {
  const ids = new Set((blocks || []).map(block => block.id));
  return normalizePageRows((rows || []).map(row => ({
    ...row,
    cells: (row.cells || []).filter(cell => !isLocal(cell) || ids.has(cell.blockId))
  })));
}

const rowOf = (rows, blockId) => rows.findIndex(row => (row.cells || []).some(cell => isLocal(cell) && cell.blockId === blockId));

/** The page with a block taken off it. The block itself stays in the folder. */
export function takeOffPage(rows, blockId, { blocks = null } = {}) {
  const list = blocks ? tidyPage(rows, blocks) : normalizePageRows(rows);
  return normalizePageRows(list.map(row => ({
    ...row,
    cells: row.cells.filter(cell => !(isLocal(cell) && cell.blockId === blockId))
  })));
}

/**
 * The page with a block placed by another one: `side` 'above' or 'below' puts
 * it on a row of its own there, 'left' or 'right' beside it in its row. A
 * block already on the page moves; one not on it yet is put on. With no
 * `targetId` (or one not on the page) it goes on a row of its own at the end.
 */
export function placeOnPage(rows, blockId, { targetId = null, side = 'below', blocks = null } = {}) {
  if (blockId === targetId) return normalizePageRows(blocks ? tidyPage(rows, blocks) : rows);
  const kept = takeOffPage(rows, blockId, { blocks });
  const cell = { blockId };
  const existing = (rows || []).flatMap(row => row.cells || []).find(c => isLocal(c) && c.blockId === blockId);
  const moved = existing ? withUnknown(cell, existing, ['blockId']) : cell;
  const at = targetId ? rowOf(kept, targetId) : -1;
  if (at === -1) return [...kept, { cells: [moved] }];
  if (side === 'left' || side === 'right') {
    const row = kept[at];
    const i = row.cells.findIndex(c => isLocal(c) && c.blockId === targetId);
    const cells = [...row.cells];
    cells.splice(side === 'left' ? i : i + 1, 0, moved);
    return kept.map((r, k) => (k === at ? { ...r, cells } : r));
  }
  const next = [...kept];
  next.splice(side === 'above' ? at : at + 1, 0, { cells: [moved] });
  return next;
}

/** The page with a block put on it, on its own row after `afterId`'s, or at the end. */
export function putOnPage(rows, blockId, { afterId = null, blocks = null } = {}) {
  const list = normalizePageRows(blocks ? tidyPage(rows, blocks) : rows);
  if (rowOf(list, blockId) !== -1) return list;
  return placeOnPage(list, blockId, { targetId: afterId, side: 'below' });
}

/** Whether two pages are the same, so an unchanged one is not saved or pushed to history. */
export function samePage(a, b) {
  return JSON.stringify(normalizePageRows(a)) === JSON.stringify(normalizePageRows(b));
}

/**
 * What a click on the empty page below everything does: write. Into the last
 * row's text block when the page ends with writing (`{ focus: id }`), or into
 * a new text block at the end when it ends with anything else, or is empty
 * (`{ add: 'text' }`).
 */
export function clickBelow(shownRows = []) {
  const last = shownRows[shownRows.length - 1];
  const only = last && last.blocks.length === 1 ? last.blocks[0] : null;
  if (only && (only.type === 'text' || only.type === 'cleantext')) return { focus: only.id };
  return { add: 'text' };
}

/** Which side of a block a point is on, for dropping beside or between: within a quarter of its width of an edge is beside. */
export function dropSide({ left, right, top, bottom, x, y }) {
  const width = right - left;
  if (x < left + width / 4) return 'left';
  if (x > right - width / 4) return 'right';
  return y < (top + bottom) / 2 ? 'above' : 'below';
}

/** What can be put on a page, and the name each is offered under. */
export const PAGE_BLOCK_TYPES = [
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'task', label: 'Task list' },
  { type: 'clock', label: 'Clock' },
  { type: 'music', label: 'Music' },
  { type: 'embed', label: 'Embed' }
];

/** How an existing block is named in the list to pick from: its title, or its first line. */
export function blockPickName(block, htmlToText = value => String(value || '')) {
  if (!block) return '';
  if (block.type === 'task') return (block.title || '').trim() || 'Task list';
  if (block.type === 'clock') return block.alarmEnabled && block.alarmTime ? `Clock, alarm ${block.alarmTime}` : 'Clock';
  if (block.type === 'image') return 'Image';
  if (block.type === 'embed') return String(block.content || '').trim() || 'Embed';
  if (block.type === 'music') return (block.title || '').trim() || 'Music';
  const first = htmlToText(block.content || '').split('\n').map(line => line.trim()).find(Boolean);
  return first ? (first.length > 60 ? `${first.slice(0, 60)}…` : first) : 'Empty text';
}
