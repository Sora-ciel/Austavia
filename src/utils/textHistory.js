// Undo history for written text, kept per block and outside the editors.
//
// The editors are destroyed and rebuilt more often than it looks: moving a
// block on the canvas remounts it, and every mode switch tears the whole tree
// down. An editor's own history goes with it, so after either of those Ctrl+Z
// did nothing at all — the text looked the same but its past was gone.
//
// Holding the history here instead means it belongs to the block rather than
// to whichever editor happens to be showing it, so writing stays undoable
// after a move, after switching modes and back, and for as long as the app is
// open.
//
// This is deliberately the *only* history for text. The workspace has its own,
// for adding, moving and deleting blocks; letting both answer the same
// keystroke is what previously made one Ctrl+Z undo two different things and
// cost a page of writing.

const histories = new Map();

// How typing is grouped into undo steps.
//
// A rolling pause alone is not enough: while someone keeps typing the window
// keeps being pushed back, so an unbroken paragraph collapses into a single
// step and one Ctrl+Z erases the lot. But breaking at every word is the
// opposite mistake — it took twenty-nine presses to walk back three sentences,
// where any other editor takes a handful. Notepad steps back a whole typing
// run; ProseMirror's own history groups on a half-second pause and nothing
// else. A sentence is the unit that sits between those, so a step is closed by
// whichever of these comes first.
const COALESCE_MS = 500;        // a pause in typing
const MAX_STEP_CHARS = 80;      // an uninterrupted run this long
const SENTENCE_END = /[.!?\n]$/; // finishing a sentence, or a new line

// Tags carry no meaning for step size — only the words the person typed do.
// Block ends become newlines first, so that starting a new paragraph reads as
// a break here rather than running two paragraphs together.
const BLOCK_BREAK = /<\/(?:p|div|h[1-6]|li|blockquote|pre)>|<br\s*\/?>/gi;

function plainText(html) {
  return String(html ?? '')
    .replace(BLOCK_BREAK, '\n')
    .replace(/<[^>]*>/g, '');
}

function plainLength(html) {
  return plainText(html).length;
}

// What was actually added, found by comparing the two versions rather than by
// looking at the end of the document. Typing usually happens in the middle of
// something already written, where the last characters of the document never
// change — testing those told us nothing about the word being typed.
function insertedText(before, after) {
  const limit = Math.min(before.length, after.length);
  let start = 0;
  while (start < limit && before[start] === after[start]) start += 1;
  const growth = after.length - before.length;
  return growth > 0 ? after.slice(start, start + growth) : '';
}

// Enough to step back through a long session without holding a whole
// document's history for every block that has ever been open.
const MAX_STEPS = 200;

// And by size. A picture pasted into writing is stored in the text, so one
// photograph makes every step of that note about 3.6 million characters, and
// two hundred of them is over a gigabyte held for one block. Past this many
// characters across a block's steps, the oldest go -- a note with a picture
// in it keeps fewer steps, a note of words keeps them all. Reported 2026-11-17
// as the app's memory climbing from 400MB to 1.1GB between heavy folders.
export const MAX_HISTORY_CHARS = 20_000_000;

function trimToSize(entry) {
  let total = entry.past.reduce((sum, step) => sum + (step.content?.length || 0), 0)
    + entry.future.reduce((sum, step) => sum + (step.content?.length || 0), 0);
  while (total > MAX_HISTORY_CHARS && entry.past.length) total -= entry.past.shift().content?.length || 0;
  while (total > MAX_HISTORY_CHARS && entry.future.length) total -= entry.future.pop().content?.length || 0;
}

function historyFor(key) {
  let entry = histories.get(key);
  if (!entry) {
    entry = {
      past: [],
      future: [],
      current: null,
      // Where the caret sat in the current state, so undo can put it back
      // instead of dropping it at the end of the block.
      currentCaret: null,
      lastRecordedAt: 0,
      // Length at the start of the current step, so its size can be measured.
      stepStartLength: 0,
      // Switching between typing and deleting starts a new step.
      lastDirection: null
    };
    histories.set(key, entry);
  }
  return entry;
}

/**
 * Seeds a block's history the first time its editor mounts. Does nothing if
 * the block already has a past, which is what makes a remount pick up where
 * the previous editor left off.
 */
export function initTextHistory(key, content) {
  if (!key) return;
  const entry = historyFor(key);
  if (entry.current === null) entry.current = content ?? '';
}

function pushPast(entry) {
  entry.past.push({ content: entry.current, caret: entry.currentCaret });
  if (entry.past.length > MAX_STEPS) entry.past.shift();
  trimToSize(entry);
}

/** Records a new state, coalescing a burst of typing into one step. */
export function recordText(key, content, caret = null) {
  if (!key) return;
  const entry = historyFor(key);
  if (content === entry.current) return;

  const now = Date.now();
  const nextText = plainText(content);
  const previousText = plainText(entry.current);
  const length = nextText.length;
  const previousLength = previousText.length;
  const direction = length >= previousLength ? 'insert' : 'delete';

  const startsNewStep =
    entry.current !== null &&
    (now - entry.lastRecordedAt >= COALESCE_MS ||
      // Deleting after typing, or typing after deleting, is a change of intent.
      (entry.lastDirection !== null && direction !== entry.lastDirection) ||
      Math.abs(length - entry.stepStartLength) >= MAX_STEP_CHARS);

  // Only the state *before* a step is kept: recording every intermediate value
  // would make undo crawl back letter by letter.
  if (startsNewStep) {
    pushPast(entry);
    entry.stepStartLength = previousLength;
  } else if (entry.current === null) {
    entry.stepStartLength = length;
  }

  entry.current = content;
  entry.currentCaret = caret;
  entry.lastDirection = direction;
  entry.lastRecordedAt = now;
  // Finishing a sentence closes the step, so the next character begins a new
  // one. Together with the length cap this keeps undo somewhere between a
  // phrase and a sentence while typing continuously, rather than swallowing a
  // whole paragraph at one end or crawling word by word at the other.
  //
  // The test is on the characters just inserted, wherever in the document they
  // went. Testing the end of the document instead only worked while writing at
  // the very end of it: editing anywhere earlier left the tail unchanged, the
  // rule never fired, and steps grew to a paragraph at a time.
  if (direction === 'insert' && SENTENCE_END.test(insertedText(previousText, nextText))) {
    entry.lastRecordedAt = 0;
  }
  // A fresh edit is a new branch, so anything undone past this point is gone.
  entry.future = [];
}

/** Steps back. Returns the content to show, or null when there is no past. */
export function undoText(key) {
  const entry = histories.get(key);
  if (!entry || !entry.past.length) return null;
  const previous = entry.past.pop();
  // The caret goes where the undone change was, not where it sat when the
  // older state was recorded. Those are different places: the state before an
  // edit was left with the caret at the end of whatever had been typed then,
  // so restoring that is what sent the cursor to the bottom of the block. The
  // position being left behind is the one that marks the edit.
  const caretAtEdit = entry.currentCaret;
  entry.future.push({ content: entry.current, caret: entry.currentCaret });
  entry.current = previous.content;
  entry.currentCaret = previous.caret;
  // Closes the current step so the next keystroke starts a new one.
  entry.lastRecordedAt = 0;
  entry.lastDirection = null;
  entry.stepStartLength = plainLength(previous.content);
  return { content: previous.content, caret: caretAtEdit ?? previous.caret };
}

/** Steps forward again. Returns the content to show, or null. */
export function redoText(key) {
  const entry = histories.get(key);
  if (!entry || !entry.future.length) return null;
  const next = entry.future.pop();
  pushPast(entry);
  entry.current = next.content;
  // Redo puts it where the change lands, which is the position recorded with
  // the state being restored.
  entry.currentCaret = next.caret;
  entry.lastRecordedAt = 0;
  entry.lastDirection = null;
  entry.stepStartLength = plainLength(next.content);
  return next;
}

export function canUndoText(key) {
  return Boolean(histories.get(key)?.past.length);
}

export function canRedoText(key) {
  return Boolean(histories.get(key)?.future.length);
}

/**
 * Keeps the recorded state in step when content changes from somewhere other
 * than typing — a cloud download, or the workspace undo restoring a snapshot.
 * Without this the next Ctrl+Z would jump back to a version the block no
 * longer has.
 */
export function syncTextHistory(key, content) {
  if (!key) return;
  const entry = historyFor(key);
  if (entry.current === content) return;
  if (entry.current !== null) pushPast(entry);
  entry.current = content;
  entry.currentCaret = null;
  entry.future = [];
  entry.lastRecordedAt = 0;
  entry.lastDirection = null;
  entry.stepStartLength = plainLength(content);
}

/** Drops a block's history once the block itself is gone. */
export function forgetTextHistory(key) {
  histories.delete(key);
}

/**
 * Keeps the histories of these blocks and lets every other go -- called when
 * a folder opens, with its blocks. Nothing used to let go: every note ever
 * opened stayed in memory with its past for as long as the app ran, so moving
 * between heavy folders only ever added (2026-11-17, 400MB to 1.1GB). Undo
 * still lasts across moves and mode switches within the folder open.
 */
export function keepTextHistoriesFor(keys) {
  const kept = new Set(keys);
  for (const key of [...histories.keys()]) if (!kept.has(key)) histories.delete(key);
}

/** How many blocks have a history, and its characters -- for diagnostics and tests. */
export function textHistorySize() {
  let chars = 0;
  for (const entry of histories.values()) {
    chars += (entry.current?.length || 0);
    for (const step of entry.past) chars += step.content?.length || 0;
    for (const step of entry.future) chars += step.content?.length || 0;
  }
  return { blocks: histories.size, chars };
}
