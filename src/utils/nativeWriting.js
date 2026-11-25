/**
 * The native writing layer, the page's half (PENDING, "Native writing layer
 * on Android"): when a paragraph can be written in a native Android field
 * laid over it, and putting what was written there back into the note.
 *
 * Why: measured 2026-11-25 on the Samsung A15, finger lifted to letter on
 * screen, a native field 40ms and steady, any text box in the web view 62ms
 * -- two frames, the web view's own. Sora's line is the native field's.
 * Stage 1: top-level paragraphs of plain text, in Single Note, in the
 * Android app. Anything else is written in the web editor as before.
 *
 * `writableParagraph` decides (tested); `attachNativeWriting` acts, with the
 * Android plugin (NativeWritingPlugin.java) drawing the field.
 */

/**
 * The paragraph the caret is in, if it can be written natively: the
 * selection a caret, in a paragraph at the top of the note, holding nothing
 * but plain text. { pos, text, caret } or null.
 */
export function writableParagraph(state) {
  const selection = state?.selection;
  if (!selection || !selection.empty) return null;
  const $from = selection.$from;
  if ($from.depth !== 1) return null;
  const node = $from.parent;
  if (node.type.name !== 'paragraph') return null;
  let plain = true;
  node.forEach(child => { if (!child.isText || child.marks.length) plain = false; });
  if (!plain) return null;
  return { pos: $from.before(1), text: node.textContent, caret: $from.parentOffset };
}

/** Where the caret goes, and what the two paragraphs hold, when Enter splits one. */
export function splitText(before, after) {
  return { first: before, second: after, caret: 0 };
}

/** What a paragraph joined onto the plain one before it holds, and where the caret lands. */
export function joinedText(previous, current) {
  return { text: `${previous}${current}`, caret: previous.length };
}

/**
 * Hooks the layer onto a TipTap editor. `plugin` is the native one
 * (Capacitor's NativeWriting); `scroller` the element the note scrolls in.
 * Returns a function that takes it off.
 */
export function attachNativeWriting(editor, { plugin, scroller, pm }) {
  const { Plugin, PluginKey, Decoration, DecorationSet, TextSelection } = pm;
  const key = new PluginKey('nativeWriting');
  // Which paragraph the field is over (its text hidden under it), mapped
  // through every change so a sync elsewhere in the note does not lose it.
  editor.registerPlugin(new Plugin({
    key,
    state: {
      init: () => ({ pos: null, height: 0 }),
      apply(tr, value) {
        const meta = tr.getMeta(key);
        if (meta) return { ...value, ...meta };
        if (value.pos === null || !tr.docChanged) return value;
        const pos = tr.mapping.map(value.pos, -1);
        return { ...value, pos };
      }
    },
    props: {
      decorations(state) {
        const { pos, height } = key.getState(state);
        if (pos === null) return null;
        const node = state.doc.nodeAt(pos);
        if (!node) return null;
        return DecorationSet.create(state.doc, [Decoration.node(pos, pos + node.nodeSize, {
          class: 'native-writing-under',
          ...(height ? { style: `min-height: ${height}px` } : {})
        })]);
      }
    }
  }));

  const view = () => editor.view;
  const active = () => key.getState(editor.state)?.pos ?? null;
  const mark = meta => view().dispatch(view().state.tr.setMeta(key, meta));
  let opening = false;
  let closed = true;

  /** The field's text put into the paragraph it was over. */
  function commit(text, caret = null) {
    const pos = active();
    if (pos === null) return;
    const state = view().state;
    const node = state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'paragraph') return;
    const from = pos + 1;
    const to = from + node.content.size;
    let tr = state.tr;
    if (node.textContent !== text) tr = text ? tr.insertText(text, from, to) : tr.delete(from, to);
    if (caret !== null) tr = tr.setSelection(TextSelection.create(tr.doc, Math.min(from + caret, from + text.length)));
    if (tr.docChanged || caret !== null) view().dispatch(tr);
  }

  /**
   * Where the field goes: over the paragraph's text, and clipped to the
   * note's visible area -- the scroller, and above the keyboard -- so it is
   * never drawn over the app's controls.
   */
  function geometry(dom) {
    const box = dom.getBoundingClientRect();
    const style = getComputedStyle(dom);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padTop = parseFloat(style.paddingTop) || 0;
    const area = (scroller || dom).getBoundingClientRect();
    const visibleBottom = Math.min(area.bottom, window.visualViewport?.height ?? window.innerHeight);
    return {
      left: box.left + padLeft,
      top: box.top + padTop,
      width: Math.max(10, box.width - padLeft - (parseFloat(style.paddingRight) || 0)),
      clipLeft: area.left,
      clipTop: Math.max(0, area.top),
      clipWidth: area.width,
      clipHeight: Math.max(0, visibleBottom - Math.max(0, area.top))
    };
  }

  async function open(target) {
    const dom = view().nodeDOM(target.pos);
    if (!dom || !dom.getBoundingClientRect) return;
    opening = true;
    try {
      // Read before the paragraph's text is hidden: hidden, its colour is
      // "transparent", and the field wrote in invisible ink (seen 2026-11-25).
      const style = getComputedStyle(dom);
      const color = style.color;
      const where = geometry(dom);
      const fontSize = parseFloat(style.fontSize) || 16;
      const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.5;
      const spacing = parseFloat(style.letterSpacing);
      mark({ pos: target.pos, height: 0 });
      await plugin.open({
        ...where,
        fontSize,
        lineHeight,
        letterSpacingEm: Number.isFinite(spacing) ? spacing / fontSize : 0,
        color,
        text: target.text,
        caret: target.caret
      });
      closed = false;
      // The web editor lets go, or its own caret stays drawn in the note
      // beside the field's (two carets, seen 2026-11-25).
      view().dom.blur();
    } finally {
      opening = false;
    }
  }

  /** Back to the web editor: the field's text kept, the field gone. */
  async function close({ focusPage = true, keepCaret = false } = {}) {
    if (closed) return;
    closed = true;
    const { text, caret } = await plugin.close({ focusPage });
    // Leaving by a tap elsewhere: the caret is where the tap put it, so the
    // text goes back without moving it.
    commit(text, keepCaret ? null : caret);
    mark({ pos: null, height: 0 });
    if (focusPage) view().focus();
  }

  // The caret landing in a paragraph that can be written natively, in the
  // web editor: the field opens over it. Once a frame at most.
  let frame = 0;
  function consider() {
    if (frame) return;
    frame = requestAnimationFrame(async () => {
      frame = 0;
      if (opening || !view().hasFocus()) return;
      if (!closed) await close({ focusPage: false, keepCaret: true });
      // Found after the text went back, which can move everything below it.
      const target = writableParagraph(view().state);
      if (target) await open(target);
    });
  }

  const listeners = [];
  const on = (event, fn) => listeners.push(plugin.addListener(event, fn));
  on('pause', ({ text }) => commit(text));
  on('height', ({ height }) => { if (active() !== null) mark({ height }); });
  on('closed', ({ text }) => {
    closed = true;
    commit(text);
    mark({ pos: null, height: 0 });
  });
  on('enter', async ({ before, after }) => {
    const pos = active();
    if (pos === null) return;
    commit(before);
    const state = view().state;
    const node = state.doc.nodeAt(pos);
    const at = pos + node.nodeSize;
    const paragraph = state.schema.nodes.paragraph.create(null, after ? state.schema.text(after) : null);
    let tr = state.tr.insert(at, paragraph);
    tr = tr.setSelection(TextSelection.create(tr.doc, at + 1));
    view().dispatch(tr);
    const next = { pos: at, text: after, caret: 0 };
    await open(next);
    // The new line in view, as typing past the bottom would bring it.
    view().nodeDOM(at)?.scrollIntoView?.({ block: 'nearest' });
  });
  on('joinBackward', async ({ text }) => {
    const pos = active();
    if (pos === null) return;
    const state = view().state;
    const $pos = state.doc.resolve(pos);
    const index = $pos.index(0);
    const previous = index > 0 ? state.doc.child(index - 1) : null;
    const plainPrevious = previous && previous.type.name === 'paragraph' && (() => { let ok = true; previous.forEach(c => { if (!c.isText || c.marks.length) ok = false; }); return ok; })();
    if (plainPrevious) {
      const node = state.doc.nodeAt(pos);
      const joined = joinedText(previous.textContent, text);
      const prevPos = pos - previous.nodeSize;
      let tr = state.tr.delete(pos, pos + node.nodeSize);
      tr = joined.text ? tr.insertText(joined.text, prevPos + 1, prevPos + 1 + previous.content.size) : tr;
      tr = tr.setSelection(TextSelection.create(tr.doc, prevPos + 1 + joined.caret));
      tr = tr.setMeta(key, { pos: prevPos, height: 0 });
      view().dispatch(tr);
      await open({ pos: prevPos, text: joined.text, caret: joined.caret });
      return;
    }
    // Anything else before it -- a heading, a list, a picture, or nothing:
    // the web editor does the joining, from the start of the paragraph.
    commit(text, 0);
    await close({ focusPage: true });
    editor.commands.joinBackward();
  });

  // Scrolling the note moves the paragraph from under the field: the field
  // goes, and comes back when the scrolling stops.
  let scrollTimer = 0;
  const onScroll = () => {
    if (!closed) close({ focusPage: true });
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(consider, 200);
  };
  scroller?.addEventListener('scroll', onScroll, { passive: true });
  // The page re-laid out under the field -- the keyboard opening or closing,
  // the phone turned: the field follows its paragraph, its text untouched.
  let placeFrame = 0;
  const follow = () => {
    if (closed || placeFrame) return;
    placeFrame = requestAnimationFrame(() => {
      placeFrame = 0;
      const pos = active();
      const dom = pos === null ? null : view().nodeDOM(pos);
      if (dom && !closed) plugin.place(geometry(dom));
    });
  };
  window.addEventListener('resize', follow);
  window.visualViewport?.addEventListener('resize', follow);
  editor.on('selectionUpdate', consider);
  editor.on('focus', consider);

  return () => {
    editor.off('selectionUpdate', consider);
    editor.off('focus', consider);
    scroller?.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', follow);
    window.visualViewport?.removeEventListener('resize', follow);
    cancelAnimationFrame(placeFrame);
    clearTimeout(scrollTimer);
    cancelAnimationFrame(frame);
    for (const l of listeners) Promise.resolve(l).then(h => h?.remove?.());
    if (!closed) close({ focusPage: false });
    try { editor.unregisterPlugin(key); } catch { /* the editor is going */ }
  };
}
