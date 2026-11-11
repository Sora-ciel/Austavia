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

/**
 * Plain text as the writing of one block: a paragraph for each run of text
 * between blank lines, a line break for each single newline.
 *
 * Pasting plain text onto the canvas made one block per paragraph -- what it
 * was first built for. Asked 2026-11-11: "if you aren't focused on a block of
 * text, it should create only one block of text with all the pasting thing,
 * not one for each paragraph." So it is one block now, its paragraphs inside.
 */
export function plainTextAsHtml(text) {
  const trimmed = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!trimmed) return '';
  const escape = value => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return trimmed
    .split(/\n\s*\n/)
    .map(paragraph => `<p>${paragraph.split('\n').map(escape).join('<br>')}</p>`)
    .join('');
}

/**
 * Whether a paste is going into writing -- a note, a field -- and is the
 * editor's to place at the caret, not the canvas's to make blocks of.
 *
 * `target` is where the paste landed, which in some engines is a text node
 * inside the editor rather than the editor itself; asking only that node
 * whether it could be typed in said no, and a paste meant for the caret in a
 * block became new blocks beside it (reported 2026-11-11: "when already
 * inside a canvas block of text, pasting should [not] create other blocks
 * ... it should only paste in the block of text focused and where your caret
 * is"). So the element around it is asked, and so is what has the focus.
 */
export function pasteIsForWriting(target, active = null) {
  const element = target && target.nodeType === 3 ? target.parentElement : target;
  const writable = node => Boolean(node && (
    node.tagName === 'INPUT'
    || node.tagName === 'TEXTAREA'
    || node.isContentEditable
    || node.closest?.('input, textarea, [contenteditable="true"], [contenteditable=""]')
  ));
  return writable(element) || writable(active);
}
