/**
 * What a paste is, before anything decides where it goes.
 *
 * ## What was asked for
 *
 * "I want to improve our editor so that we can easily copy and paste lists,
 * images etc., which we can't yet in any mode." — 2026-09-28.
 *
 * ## What was actually wrong
 *
 * The editor itself copies and pastes lists and pictures fine. Two things
 * around it did not:
 *
 * - **Pasting onto the canvas, or onto a Simple Note block not being edited,**
 *   went to the window's own handler, which read only the plain text and split
 *   it into a block per blank line. A copied list puts a blank line between its
 *   items, so one paste of a list became one block per item, and the pictures
 *   and formatting were gone -- measured: one paste, six blocks.
 * - **Pasting from Word, Google Docs and the like into a note** put in a
 *   picture and nothing else. Those apps put a rendered image of the selection
 *   on the clipboard beside the real content, and a picture used to win over
 *   everything.
 *
 * ## The rule
 *
 * A picture wins only when the rest of the clipboard is nothing but that
 * picture -- copying an image in a browser (its `<img>` markup comes too) or in
 * a file manager (its path comes too). As soon as the HTML has any writing in
 * it, the HTML is the thing meant, and a picture beside it is a preview of it.
 *
 * Pure, so it can be tested without a clipboard; the call sites read the
 * clipboard and act.
 */

/** The writing in some HTML, with the markup, scripts and styles taken out. */
export function textOfHtml(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&[a-z#0-9]+;/gi, 'x')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether some HTML holds a picture of its own. */
export function htmlHasImage(html) {
  return /<img\b[^>]*\bsrc\s*=/i.test(String(html || ''));
}

/**
 * What a paste is: 'image', 'html', 'text' or 'none'.
 *
 * `imageCount` is how many picture files the clipboard carries.
 */
export function pasteKind({ html = '', text = '', imageCount = 0 } = {}) {
  const writing = textOfHtml(html);

  // HTML with writing in it is the content; a picture beside it is a preview.
  if (writing) return 'html';

  // A picture file, with nothing but its own markup or path beside it.
  if (imageCount > 0) return 'image';

  // Only pictures in the HTML, and no file -- a picture copied out of a note.
  if (htmlHasImage(html)) return 'html';

  if (String(text || '').trim()) return 'text';
  return 'none';
}

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
const FENCE = /^\s*(```|~~~)/;

/**
 * Plain text cut into the blocks it should become.
 *
 * Pasting plain text onto the canvas makes one block per paragraph, which is
 * what it was for. What it must not do is cut a list or a code block apart:
 * a list whose items are separated by blank lines stays one block, and so does
 * everything between two code fences.
 */
export function textChunks(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];

  const pieces = trimmed.split(/\n\s*\n/).map(piece => piece.trim()).filter(Boolean);
  const chunks = [];
  let insideFence = false;

  for (const piece of pieces) {
    const previous = chunks[chunks.length - 1];
    const firstLine = piece.split('\n')[0];
    const continuesList =
      previous !== undefined && LIST_ITEM.test(firstLine) && LIST_ITEM.test(previous.split('\n').pop());

    if (previous !== undefined && (insideFence || continuesList)) {
      chunks[chunks.length - 1] = `${previous}\n\n${piece}`;
    } else {
      chunks.push(piece);
    }

    // An odd number of fence lines in this piece opens or closes a code block.
    const fences = piece.split('\n').filter(line => FENCE.test(line)).length;
    if (fences % 2 === 1) insideFence = !insideFence;
  }

  return chunks;
}
