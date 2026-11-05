/**
 * What a page shows: the list of blocks put on it, in order.
 *
 * ## What was asked for
 *
 * 2026-10-27, settled in PENDING ("Page mode, and nests"): a mode like
 * Notion's pages, where "it doesn't show all blocks from the get go, but you
 * can add blocks that already exist in the folder ... and then you should be
 * able to see if you create a new one or show one that exists already."
 * Started 2026-11-04.
 *
 * ## The shape
 *
 * A page is a column of blocks, and keeps nothing but which blocks, in what
 * order: `modeSettings.page.entries`, a list of `{ blockId }`. The blocks are
 * the folder's own -- the clock on a page is the clock the Canvas shows --
 * so a page holds no data of its own (CLAUDE.md, "a mode only shows blocks").
 *
 * Not `modeOrders`: those always hold every block of the folder, and drop
 * any id they cannot find. A page holds only what was put on it, and later
 * (PENDING step 6) blocks from other folders, `{ folderId, blockId }`, which
 * this folder cannot find and must not drop.
 *
 * ## Kept as it comes
 *
 * An entry this build does not understand -- one with a `folderId`, or of a
 * kind added later -- is kept in its place and not shown (CLAUDE.md, "an
 * older version keeps what it does not understand"). An entry whose block is
 * gone from this folder is not shown either, and is only tidied away when the
 * page is next changed (`tidyPage`): an Undo can bring the block back, and
 * finds it still in its place.
 */

import { withUnknown } from './keepUnknown.js';

const isEntry = entry => entry && typeof entry === 'object' && typeof entry.blockId === 'string' && entry.blockId;
/** An entry this build shows: a block of this folder. */
const isLocal = entry => isEntry(entry) && !entry.folderId;

/** The entries as stored, cleaned: anything not an entry is dropped, unknown fields kept, a block listed once. */
export function normalizePageEntries(entries) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    if (!isEntry(entry)) continue;
    const key = `${entry.folderId || ''}\u0000${entry.blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(withUnknown({ blockId: entry.blockId }, entry, ['blockId']));
  }
  return out;
}

/** The page's settings as stored: `{ entries }`, plus whatever a newer build added. */
export function normalizePageSettings(page) {
  return withUnknown({ entries: normalizePageEntries(page?.entries) }, page || {}, ['entries']);
}

/** The blocks the page shows, in its order. */
export function blocksOnPage(entries, blocks = []) {
  const byId = new Map((blocks || []).map(block => [block.id, block]));
  const out = [];
  for (const entry of entries || []) {
    if (!isLocal(entry)) continue;
    const block = byId.get(entry.blockId);
    if (block) out.push(block);
  }
  return out;
}

/** The folder's blocks that are not on the page, in the folder's order: what "/" offers as existing. */
export function blocksOffPage(entries, blocks = []) {
  const on = new Set((entries || []).filter(isLocal).map(entry => entry.blockId));
  return (blocks || []).filter(block => !on.has(block.id));
}

/** The entries without the local ones whose block is gone; foreign ones stay. */
export function tidyPage(entries, blocks = []) {
  const ids = new Set((blocks || []).map(block => block.id));
  return (entries || []).filter(entry => !isLocal(entry) || ids.has(entry.blockId));
}

/** The page with a block put on it: after `afterId` if given and there, else at the end. Once only. */
export function putOnPage(entries, blockId, { afterId = null, blocks = null } = {}) {
  const list = blocks ? tidyPage(entries, blocks) : [...(entries || [])];
  if (list.some(entry => isLocal(entry) && entry.blockId === blockId)) return list;
  const at = afterId ? list.findIndex(entry => isLocal(entry) && entry.blockId === afterId) : -1;
  const entry = { blockId };
  if (at === -1) return [...list, entry];
  return [...list.slice(0, at + 1), entry, ...list.slice(at + 1)];
}

/** The page with a block taken off it. The block itself stays in the folder. */
export function takeOffPage(entries, blockId, { blocks = null } = {}) {
  const list = blocks ? tidyPage(entries, blocks) : [...(entries || [])];
  return list.filter(entry => !(isLocal(entry) && entry.blockId === blockId));
}

/** The page with two of its blocks trading places, as cards are moved in Simple Note. */
export function swapOnPage(entries, aId, bId) {
  const list = [...(entries || [])];
  const a = list.findIndex(entry => isLocal(entry) && entry.blockId === aId);
  const b = list.findIndex(entry => isLocal(entry) && entry.blockId === bId);
  if (a === -1 || b === -1 || a === b) return list;
  [list[a], list[b]] = [list[b], list[a]];
  return list;
}

/** Whether two entry lists are the same page, so an unchanged one is not saved or pushed to history. */
export function samePage(a, b) {
  return JSON.stringify(normalizePageEntries(a)) === JSON.stringify(normalizePageEntries(b));
}

/** What "/" or "+" can put on a page, and the name each is offered under. */
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
