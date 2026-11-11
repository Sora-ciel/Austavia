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

// ── Columns ──────────────────────────────────────────────────────────────
//
// Asked 2026-11-10: "if i want to put a block just after the end of another
// block when they are both on the right side of another longer block, it
// should be possible. right now it's whether the block stays below both or
// it puts itself on the side again. i want to have those three solutions."
//
// So a cell is a column: its own block, and blocks stacked under it in the
// same column (`under: [{ blockId }]`). A build from before this reads the
// cell's own block and keeps `under` whole as a field it does not know.
// A column's `width` (edit mode) is the cell's, whichever block heads it.

/** A cell's blocks, top to bottom: its own, then those stacked under it. */
const stackOf = cell => [cell, ...(Array.isArray(cell?.under) ? cell.under : [])].filter(isCell);
const localIdsOf = cell => stackOf(cell).filter(isLocal).map(c => c.blockId);
const plain = entry => withUnknown({ blockId: entry.blockId }, entry, ['blockId', 'under', 'width']);

/** A cell made of these entries, top to bottom, keeping the column's own fields from `from`; null when none are left. */
function cellOf(entries, from) {
  if (!entries.length) return null;
  const [first, ...rest] = entries;
  const head = plain(first);
  if (from && from.width != null) head.width = from.width;
  if (rest.length) head.under = rest.map(plain);
  return head;
}

/** The rows as stored, cleaned: anything not a cell dropped, a block on the page once, no empty rows, unknown fields kept. */
export function normalizePageRows(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !Array.isArray(row.cells)) continue;
    const cells = [];
    for (const cell of row.cells) {
      if (!cell || typeof cell !== 'object') continue;
      const entries = stackOf(cell).filter(entry => {
        if (seen.has(cellKey(entry))) return false;
        seen.add(cellKey(entry));
        return true;
      });
      const made = cellOf(entries, cell);
      if (!made) continue;
      // What a newer build put on the cell itself stays with it.
      const extra = withUnknown({}, cell, ['blockId', 'under', 'width', 'folderId']);
      cells.push(entries[0] === cell ? made : { ...made, ...extra });
    }
    if (cells.length) out.push(withUnknown({ cells }, row, ['cells']));
  }
  return out;
}

/** The page's settings as stored: `{ rows }`, plus whatever a newer build added. */
export function normalizePageSettings(page) {
  const out = { rows: normalizePageRows(page?.rows) };
  if (Array.isArray(page?.narrowRows)) out.narrowRows = normalizePageRows(page.narrowRows);
  return withUnknown(out, page || {}, ['rows', 'narrowRows']);
}

// ── A layout for a computer, and one for a phone ─────────────────────────
//
// Asked 2026-11-10: "Page mode will on pc use more of the width than on
// phone. between pc width and phone width you'll be able to put the blocks in
// different positions etc. making it so that if i change for the blocks to be
// a certain way in phone, it won't change it for pc too."
//
// So a page has `rows`, as a computer shows it, and `narrowRows`, as a phone
// does. Until something is moved on a phone there is no `narrowRows`, and a
// phone shows the computer's rows one block under another (`stacked`).
// Putting a block on a page or taking it off is the page's content and
// changes both; moving a block is how it is laid out and changes only the
// layout it was moved in (`editPage`).

/** Up to this width a page is laid out as on a phone. */
export const NARROW_MAX = 700;
export const isNarrow = width => Number(width) > 0 && Number(width) <= NARROW_MAX;

/** The computer's rows, one block to a row, in reading order: what a phone shows until it has a layout of its own. */
export function stacked(rows) {
  return normalizePageRows(rows).flatMap(row => row.cells.flatMap(cell => stackOf(cell).map(entry => ({ cells: [plain(entry)] }))));
}

/** The rows of a page as shown at this width. */
export function rowsFor(page, narrow) {
  if (!narrow) return normalizePageRows(page?.rows);
  return Array.isArray(page?.narrowRows) ? normalizePageRows(page.narrowRows) : stacked(page?.rows);
}

/**
 * The page after an edit made at this width: `op` turns rows into rows.
 * `content` (putting on, taking off) is done to both layouts; anything else
 * (moving) only to the one in use, a phone's starting from the stacked
 * rows the first time.
 */
export function editPage(page, { narrow = false, op, content = false } = {}) {
  const base = page || {};
  const next = { ...base };
  if (content) {
    next.rows = op(normalizePageRows(base.rows));
    if (Array.isArray(base.narrowRows)) next.narrowRows = op(normalizePageRows(base.narrowRows));
    return next;
  }
  if (narrow) next.narrowRows = op(rowsFor(base, true));
  else next.rows = op(normalizePageRows(base.rows));
  return next;
}

/** Whether two pages are the same in both layouts. */
export function samePageLayouts(a, b) {
  return samePage(a?.rows, b?.rows) &&
    Array.isArray(a?.narrowRows) === Array.isArray(b?.narrowRows) &&
    (!Array.isArray(a?.narrowRows) || samePage(a.narrowRows, b.narrowRows));
}

/**
 * The rows the page shows, each `{ key, columns, blocks }` -- its columns,
 * each `{ key, blocks, width }` top to bottom, and all its blocks in reading
 * order; anything with nothing to show is left out.
 */
export function blocksOnPage(rows, blocks = []) {
  const byId = new Map((blocks || []).map(block => [block.id, block]));
  const out = [];
  for (const row of rows || []) {
    const columns = [];
    for (const cell of row.cells || []) {
      const shown = localIdsOf(cell).map(id => byId.get(id)).filter(Boolean);
      if (shown.length) columns.push({ key: shown[0].id, blocks: shown, width: cell.width });
    }
    if (columns.length) out.push({ key: columns[0].key, columns, blocks: columns.flatMap(c => c.blocks) });
  }
  return out;
}

/** The folder's blocks that are not on the page, in the folder's order: what is offered as existing. */
export function blocksOffPage(rows, blocks = []) {
  const on = new Set();
  for (const row of rows || []) for (const cell of row.cells || []) for (const id of localIdsOf(cell)) on.add(id);
  return (blocks || []).filter(block => !on.has(block.id));
}

/** The rows with only the entries `keep` says yes to, columns and rows left empty gone. */
function keepEntries(rows, keep) {
  return normalizePageRows(normalizePageRows(rows).map(row => ({
    ...row,
    cells: row.cells.map(cell => cellOf(stackOf(cell).filter(keep), cell)).filter(Boolean)
  })));
}

/**
 * The page's title as a place in its rows (asked 2026-11-10: "make it so
 * titles in pages or folders in page mode can be moved places with other
 * blocks"). Not a block: Page mode draws the folder's name or the page's
 * title there. A page whose rows do not hold it shows it first.
 */
export const TITLE_ID = '__title';

/** The rows with the title placed: as stored when they hold it, else first. */
export function withTitle(rows) {
  const list = normalizePageRows(rows);
  if (rowOf(list, TITLE_ID) !== -1) return list;
  return [{ cells: [{ blockId: TITLE_ID }] }, ...list];
}

/** The rows without the local entries whose block is gone; other folders' stay, and so does the title. */
export function tidyPage(rows, blocks = []) {
  const ids = new Set((blocks || []).map(block => block.id));
  ids.add(TITLE_ID);
  return keepEntries(rows, entry => !isLocal(entry) || ids.has(entry.blockId));
}

const rowOf = (rows, blockId) => rows.findIndex(row => (row.cells || []).some(cell => localIdsOf(cell).includes(blockId)));

/** The page with a block taken off it. The block itself stays in the folder. */
export function takeOffPage(rows, blockId, { blocks = null } = {}) {
  const list = blocks ? tidyPage(rows, blocks) : normalizePageRows(rows);
  return keepEntries(list, entry => !(isLocal(entry) && entry.blockId === blockId));
}

/**
 * The page with a block placed by another one. `side`:
 * - 'left' or 'right': a column of its own beside the target's column;
 * - 'above' or 'below': a row of its own above or below the target's row;
 * - 'over' or 'under': in the target's column, just before or after it.
 * A block already on the page moves; one not on it yet is put on. With no
 * `targetId` (or one not on the page) it goes on a row of its own at the end.
 */
export function placeOnPage(rows, blockId, { targetId = null, side = 'below', blocks = null } = {}) {
  if (blockId === targetId) return normalizePageRows(blocks ? tidyPage(rows, blocks) : rows);
  const existing = normalizePageRows(rows).flatMap(row => row.cells.flatMap(stackOf)).find(c => isLocal(c) && c.blockId === blockId);
  const moved = existing ? plain(existing) : { blockId };
  const kept = takeOffPage(rows, blockId, { blocks });
  const at = targetId ? rowOf(kept, targetId) : -1;
  if (at === -1) return [...kept, { cells: [moved] }];
  const row = kept[at];
  const i = row.cells.findIndex(cell => localIdsOf(cell).includes(targetId));
  if (side === 'left' || side === 'right') {
    const cells = [...row.cells];
    cells.splice(side === 'left' ? i : i + 1, 0, moved);
    return kept.map((r, k) => (k === at ? { ...r, cells } : r));
  }
  if (side === 'over' || side === 'under') {
    const stack = stackOf(row.cells[i]);
    const j = stack.findIndex(entry => isLocal(entry) && entry.blockId === targetId);
    stack.splice(side === 'over' ? j : j + 1, 0, moved);
    const cells = row.cells.map((cell, k) => (k === i ? cellOf(stack, cell) : cell));
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

/** How far the pointer may move between press and release and still be a click. */
export const CLICK_SLOP_PX = 5;

/**
 * Whether a click on the page writes (clickBelow): only a click begun and
 * ended on the empty page below everything, without a drag. A selection left
 * from before does not stop it -- a plain click there is meant to write.
 *
 * Below everything (`below`), not anywhere off a block: a click in the margin
 * beside a row or in the gap between two, often just to let go of something,
 * made a text block at the end of the page each time the page did not end
 * with one -- "it creates easily text blocks, all the time" (2026-11-11).
 *
 * Reported 2026-11-11: selecting writing and dragging past the block made
 * the page jump somewhere the selection was not. A press in a block and a
 * release on the empty page reach the page as a click -- the browser sends it
 * to the nearest thing both were in -- so it wrote: the caret went to the end
 * of the last text block, or into a new one, and the page scrolled there.
 */
export function clickWrites({ pressOnPage = false, moved = 0, below = true } = {}) {
  return pressOnPage && below && moved <= CLICK_SLOP_PX;
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
  { type: 'calendar', label: 'Calendar' },
  { type: 'music', label: 'Music' },
  { type: 'embed', label: 'Embed' },
  { type: 'nest', label: 'Nest' },
  { type: 'page', label: 'Page' }
];

/** How an existing block is named in the list to pick from: its title, or its first line. */
export function blockPickName(block, htmlToText = value => String(value || '')) {
  if (!block) return '';
  if (block.type === 'task') return (block.title || '').trim() || 'Task list';
  if (block.type === 'clock') return block.alarmEnabled && block.alarmTime ? `Clock, alarm ${block.alarmTime}` : 'Clock';
  if (block.type === 'image') return 'Image';
  if (block.type === 'embed') return String(block.content || '').trim() || 'Embed';
  if (block.type === 'music') return (block.title || '').trim() || 'Music';
  if (block.type === 'nest') return (block.title || '').trim() || 'Nest';
  if (block.type === 'calendar') return (block.title || '').trim() || 'Calendar';
  if (block.type === 'page') return (block.title || '').trim() || 'Untitled page';
  const first = htmlToText(block.content || '').split('\n').map(line => line.trim()).find(Boolean);
  return first ? (first.length > 60 ? `${first.slice(0, 60)}…` : first) : 'Empty text';
}

/**
 * The rows with one block's share of its row set (a fraction, 0.15 to 1) or
 * cleared (null) -- Page mode's edit mode, asked 2026-11-10 ("change the
 * images size"). On the cell, so each layout keeps its own (editPage).
 */
export function setCellWidth(rows, blockId, width) {
  return normalizePageRows(rows).map(row => ({
    ...row,
    cells: row.cells.map(cell => {
      if (!localIdsOf(cell).includes(blockId)) return cell;
      const { width: _old, ...rest } = cell;
      return width == null ? rest : { ...rest, width: Math.max(0.15, Math.min(1, Number(width))) };
    })
  }));
}

/**
 * The rows with a field set on one block's place, or cleared (null): how that
 * block is shown on this page in this layout, as a picture's crop or a nest's
 * tile size (asked 2026-11-10: "on phone or pc you have different crop
 * following the same rule as block moving"). On the entry, wherever it sits
 * in its column; editPage keeps each layout's own.
 */
export function setPlaceField(rows, blockId, key, value) {
  const set = entry => {
    if (!isLocal(entry) || entry.blockId !== blockId) return entry;
    const { [key]: _old, ...rest } = entry;
    return value == null ? rest : { ...rest, [key]: value };
  };
  return normalizePageRows(normalizePageRows(rows).map(row => ({
    ...row,
    cells: row.cells.map(cell => {
      const head = set(cell);
      return Array.isArray(cell.under) ? { ...head, under: cell.under.map(set) } : head;
    })
  })));
}

/** Each block's place on the page, by id: the stored entry, with its own fields. */
export function placesById(rows) {
  const out = new Map();
  for (const row of normalizePageRows(rows)) for (const cell of row.cells) for (const entry of stackOf(cell)) {
    if (isLocal(entry)) out.set(entry.blockId, entry);
  }
  return out;
}

/**
 * What a block's menu on a page offers -- opened by a long press on a phone
 * or a right-click on a computer, outside edit mode as well as in it. Asked
 * 2026-11-11: "make it easier to add an image or delete an image or block
 * without having to go to edit mode, using for example a pop-up that comes
 * after a long press". A picture's size is not here: it is edit mode's, and
 * stays there ("i want it stuck when out of edit mode").
 */
export function pageBlockMenu(block) {
  const picture = block?.type === 'image';
  return [
    ...(picture ? [
      { id: 'replacePicture', label: 'Replace picture' },
      { id: 'crop', label: 'Crop' }
    ] : []),
    { id: 'addPicture', label: 'Add a picture below' },
    { id: 'addBlock', label: 'Add a block below…' },
    { id: 'takeOff', label: 'Take off page' },
    { id: 'delete', label: picture ? 'Delete picture' : 'Delete block', variant: 'danger' }
  ];
}

/**
 * The sizes a picture can be given in one press in edit mode, as shares of
 * its row -- easier on a phone than dragging its edge (asked 2026-11-11, "make
 * it so that it's easier to change the size"). `null` is its natural size.
 */
export const PICTURE_SIZES = Object.freeze([
  { label: '⅓', width: 1 / 3 },
  { label: '½', width: 0.5 },
  { label: '¾', width: 0.75 },
  { label: 'Full', width: 1 },
  { label: 'Natural', width: null }
]);
