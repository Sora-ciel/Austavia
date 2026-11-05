/**
 * A note's writing cut in two at a position, as HTML: what a "/" on a page
 * splits when a block is put in the middle of the writing (utils/slashMenu.js,
 * slashSplit). Needs the editor's schema, and a document to serialise into.
 */
import { DOMSerializer } from '@tiptap/pm/model';

/** Whether a piece of writing holds nothing: no text, no picture, nothing but empty lines. */
export function isEmptyWriting(fragment) {
  let empty = true;
  fragment.descendants(node => {
    if (!empty) return false;
    if (node.isText) { if (node.text.trim()) empty = false; }
    else if (node.isAtom && node.type.name !== 'hardBreak') empty = false;
    return empty;
  });
  return empty;
}

export function splitWritingAt(editor, pos) {
  const { doc, schema } = editor.state;
  const serializer = DOMSerializer.fromSchema(schema);
  const html = fragment => {
    const holder = document.createElement('div');
    holder.appendChild(serializer.serializeFragment(fragment, { document }));
    return holder.innerHTML;
  };
  const before = doc.cut(0, pos).content;
  const after = doc.cut(pos).content;
  return {
    beforeHtml: html(before),
    afterHtml: html(after),
    beforeEmpty: isEmptyWriting(before),
    afterEmpty: isEmptyWriting(after)
  };
}
