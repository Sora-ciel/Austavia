/**
 * What a piece of markdown typed into the editor means, wherever it is typed.
 *
 * ## What was asked for
 *
 * "For things that use TipTap, make it so that we can aggregate markdowns — so
 * that for example we can use the `# ` markdown to have a title and then add
 * `- ` to have it making a list. Make sure all markdowns can work with that.
 * There's the separator, which would be cool to be able to put after, on the
 * same line. There's also images, where it would be cool we can use styling and
 * separation after too."
 *
 * The editor's own shortcuts only fire from a plain paragraph at the start of a
 * line. That is most of the time and none of the interesting times:
 *
 * - Inside a heading, `- ` types two literal characters. The list wrapper is
 *   refused because a list item must begin with a paragraph and the block is a
 *   heading, so the rule matches, fails, and leaves the marker behind.
 * - `---` only makes a separator on an empty line. After any writing at all it
 *   is three dashes.
 * - After a picture, nothing works — not the separator, not bold, not italic.
 *   The shortcuts all require the marker to follow a space or the start of the
 *   line, and what follows a picture is neither: the editor stands a leaf node
 *   in as the literal text "%leaf%", and none of the patterns know about it.
 *
 * ## What this decides, and what it does not
 *
 * This says what a typed run of characters means. Carrying it out — converting
 * a heading to a paragraph before wrapping it, splitting a line to put a
 * separator in — is the editor's job, and stays with the editor, which is the
 * only place that has a document to change.
 *
 * Splitting it this way is the point: the shape of a markdown shortcut is a
 * rule somebody wanted and can be argued about, and it can be argued about here
 * without an editor, a browser or a mouse.
 */

/**
 * What the editor puts in the text where a leaf node — a picture — sits.
 *
 * Its own doing, and worth knowing: it is the literal six characters "%leaf%",
 * not the object replacement character U+FFFC that a reader of ProseMirror
 * might reasonably expect. Getting that wrong means every rule below quietly
 * stops working next to a picture, which is the case they were written for.
 */
export const LEAF = '%leaf%';

/** Start of the line, a space, or the far side of a picture. */
const BOUNDARY = '(?:^|\\s|%leaf%)';

/**
 * In order. The first that matches is the answer, so anything narrower has to
 * come before anything wider.
 */
const RULES = [
  {
    // Back to ordinary writing, whatever the line had become.
    //
    // Every other shortcut turns a line into something; there was no way to
    // turn one back, and the case that hurts is a line that is *waiting* —
    // an empty heading typed by mistake, a list nobody wanted — where there is
    // no text to select and nothing obvious to undo.
    //
    // Two markers for one meaning, on purpose. `\ ` is the markdown escape
    // character, which already means "no formatting here", and `. ` is the one
    // to reach for on a keyboard where the backslash is a two-hand affair. A
    // line that genuinely begins with either is close enough to never.
    kind: 'paragraph',
    pattern: /^\s*(\\|\.)\s$/,
    extra: () => ({})
  },
  {
    kind: 'heading',
    pattern: /^(#{1,6})\s$/,
    extra: (match) => ({ level: match[1].length })
  },
  {
    kind: 'bulletList',
    pattern: /^\s*([-+*])\s$/,
    extra: () => ({})
  },
  {
    kind: 'orderedList',
    pattern: /^\s*(\d+)[.)]\s$/,
    extra: (match) => ({ start: Number(match[1]) || 1 })
  },
  {
    kind: 'blockquote',
    pattern: /^\s*>\s$/,
    extra: () => ({})
  },
  {
    kind: 'codeBlock',
    pattern: /^\s*```([a-z]*)\s$/,
    extra: (match) => ({ language: match[1] || null })
  },
  {
    // Anywhere on the line, not only on an empty one, and a picture counts as
    // something it can follow.
    kind: 'horizontalRule',
    pattern: new RegExp(`${BOUNDARY}(?:---|___|\\*\\*\\*)$`),
    extra: () => ({})
  }
];

/**
 * The mark shortcuts, which differ from the block ones in only one way: the
 * editor already handles them everywhere except after a picture. They are
 * repeated here with a boundary that knows what a picture is.
 */
const MARKS = [
  { kind: 'bold', pattern: new RegExp(`${BOUNDARY}(\\*\\*|__)([^*_]+)\\1$`) },
  { kind: 'italic', pattern: new RegExp(`${BOUNDARY}([*_])([^*_]+)\\1$`) },
  { kind: 'strike', pattern: new RegExp(`${BOUNDARY}(~~)([^~]+)\\1$`) },
  { kind: 'code', pattern: new RegExp(`${BOUNDARY}(\`)([^\`]+)\\1$`) }
];

function found(rule, match, extra = {}) {
  // The boundary, where there is one, is not part of the marker: it is the
  // space or the picture that came before it and has to stay.
  const boundary = /^(\s|%leaf%)/.exec(match[0]);
  const leading = boundary ? boundary[0].length : 0;
  return {
    kind: rule.kind,
    index: match.index + leading,
    text: match[0].slice(leading),
    match,
    ...extra
  };
}

/**
 * What the text typed so far in this block means, or null for ordinary writing.
 *
 * `textBefore` is the block's text up to and including the character just
 * typed, with a picture standing in as U+FFFC — which is what the editor hands
 * its input rules.
 */
export function shortcutFor(textBefore) {
  if (typeof textBefore !== 'string' || !textBefore) return null;

  for (const rule of RULES) {
    const match = rule.pattern.exec(textBefore);
    if (match) return found(rule, match, rule.extra(match));
  }
  return null;
}

/**
 * Whether a separator should sit in the line rather than break it.
 *
 * Asked for: "for the separator to be able to be on the same line as something
 * else, so that it can start after or before something else on the same line,
 * including images."
 *
 * It shares the line when there is something before it and nothing after: it
 * starts where the writing stopped and runs to the far edge of the line. That
 * is the shape that was asked for, and it is why "nothing after" matters — a
 * line that reaches the edge cannot have writing sitting in its way, so a
 * separator typed in front of something is the full-width break instead.
 *
 * On an empty line it is the full-width break it has always been.
 *
 * `hasContentAfter` is the part this cannot see for itself: the text handed to
 * a shortcut stops at the caret, and what sits after it is a question for
 * whoever has the document.
 */
export function separatorIsInline(found, { hasContentAfter = false } = {}) {
  if (!found || found.kind !== 'horizontalRule') return false;
  return found.index > 0 && !hasContentAfter;
}

/**
 * The same, for the shortcuts that put a mark on a run of text.
 *
 * Separate because the editor carries these out differently — the marker is
 * replaced by its own contents wearing a mark, rather than the block changing
 * kind — and because there is nothing wrong with the editor's own versions
 * except where they meet a picture.
 */
export function markShortcutFor(textBefore) {
  if (typeof textBefore !== 'string' || !textBefore) return null;

  for (const rule of MARKS) {
    const match = rule.pattern.exec(textBefore);
    if (match) return found(rule, match, { content: match[2] });
  }
  return null;
}
