<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { Editor, Extension, InputRule, Node as TipTapNode } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Placeholder from '@tiptap/extension-placeholder';
  import Image from '@tiptap/extension-image';
  import { ListItem } from '@tiptap/extension-list-item';
  import { Markdown } from 'tiptap-markdown';
  import { shortcutFor, markShortcutFor, separatorFillsLine } from '../utils/markdownShortcuts.js';
  import { imagesFrom, hasImage } from '../utils/pastedImages.js';
  import {
    initTextHistory,
    recordText,
    undoText,
    redoText,
    syncTextHistory
  } from '../utils/textHistory.js';

  export let content = '';
  export let placeholder = 'Write here…';
  export let initialScrollTop = 0;
  // Tasks are stored as markdown, notes as HTML. Emitting markdown keeps task
  // text in the format the rest of the app already reads, so nothing else has
  // to change to gain a real editor.
  export let emit = 'html'; // 'html' | 'markdown'
  // 'inline' drops the note-sized padding and min-height so the editor can sit
  // inside a single task row.
  export let variant = 'block'; // 'block' | 'inline'
  // Identifies whose history this is — normally the block's id. The history
  // lives outside the editor so it survives this component being rebuilt,
  // which happens on a move and on every mode switch.
  export let historyKey = '';

  const dispatch = createEventDispatcher();

  let wrapEl;
  let element;
  let editor;
  let separatorWatcher;
  // Set while an undo or redo is being written into the editor, so the update
  // it causes isn't recorded as a fresh edit.
  let applyingHistory = false;

  // Where two versions of the text first differ. Undoing an insertion diverges
  // where the inserted text began; undoing a deletion, where the removed text
  // began. Either way that is the spot the change happened.
  function divergencePoint(before, after) {
    const limit = Math.min(before.length, after.length);
    let i = 0;
    while (i < limit && before[i] === after[i]) i += 1;
    return i;
  }

  // The document as a plain string, counting text and nothing else.
  //
  // It has to agree exactly with the walker below, or the offset is measured
  // in one alphabet and spent in another. getText() was the earlier choice and
  // does not agree: it emits a character for every line break, so a note with
  // a run of empty lines drifted by one position per break and the caret ended
  // up near the bottom. Both separators are emptied here so only real text
  // counts, on both sides.
  function documentText(doc) {
    return doc.textBetween(0, doc.content.size, '', '');
  }

  // Turns an offset into that text into a document position. A stored position
  // cannot be reused directly: the restored document is a different shape, and
  // the same number lands on a different line once paragraph boundaries shift.
  function positionForTextOffset(doc, offset) {
    let position = null;
    let seen = 0;
    doc.descendants((node, nodePos) => {
      if (position !== null) return false;
      if (node.isText) {
        const length = node.text.length;
        if (seen + length >= offset) {
          position = nodePos + (offset - seen);
          return false;
        }
        seen += length;
      }
      return true;
    });
    return position ?? Math.max(1, doc.content.size - 1);
  }

  function applyHistory(step) {
    if (!step || !editor) return false;
    const { content } = step;
    // Measured before the document is replaced, so the two can be compared.
    const textBefore = documentText(editor.state.doc);
    applyingHistory = true;
    try {
      editor.commands.setContent(content || '', false);
      // Put the caret back where it was when this state was recorded. Dropping
      // it at the end of the block instead is disorienting: you undo a word in
      // the middle of a paragraph and the cursor leaps to the bottom.
      //
      // Selecting and focusing has to be one call. Done as two, focus() runs
      // its own transaction and falls back to the selection the editor has
      // stored — which after setContent is the end of the document, so it
      // undid the position that had just been set.
      const textAfter = documentText(editor.state.doc);
      // Held as an offset into the text, not as a document position. The
      // content goes out to the parent and comes back as a prop, which can
      // replace the document again; a position worked out beforehand would
      // then point at the wrong place, which is why the caret sometimes landed
      // a paragraph or two away. An offset stays meaningful, so it is resolved
      // against whatever document is actually there at the moment of placing.
      //
      // Undoing takes text away, and the caret belongs where it went from —
      // the point the two versions diverge. Redoing puts text back, and the
      // caret belongs after it, the way it would sit had you just typed it.
      // Using the divergence for both left redo sitting at the start of what
      // had reappeared, a step behind itself.
      const restored = Math.max(0, textAfter.length - textBefore.length);
      const targetOffset = divergencePoint(textBefore, textAfter) + restored;

      const placeCaret = () => {
        if (!editor || editor.isDestroyed) return;
        // Focus first, then select. focus() resolves to whatever selection the
        // editor has stored, which after setContent is the end of the
        // document, so it has to run before the position is set rather than
        // after it.
        editor.commands.focus();
        editor.commands.setTextSelection(
          positionForTextOffset(editor.state.doc, targetOffset)
        );
      };

      placeCaret();
      // Setting the content tells the parent, which sends it back down as a
      // prop; that round trip lands after this function returns and can move
      // the caret again. Re-asserting once the update has settled is what makes
      // the position actually stick.
      queueMicrotask(placeCaret);
      setTimeout(placeCaret, 0);
      lastPushedContent = content;
      dispatch('change', content);
    } finally {
      applyingHistory = false;
    }
    return true;
  }

  function handleHistoryKeys(view, event) {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return false;
    const key = event.key?.toLowerCase();

    const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
    const isUndo = key === 'z' && !event.shiftKey;
    if (!isUndo && !isRedo) return false;

    // Handled here whether or not there is anything left to step through, so
    // the keystroke never falls through to the workspace's own undo.
    event.preventDefault();
    applyHistory(isRedo ? redoText(historyKey) : undoText(historyKey));
    return true;
  }

  // Markdown shortcuts that work wherever you are, rather than only from a
  // plain paragraph at the start of a line.
  //
  // What each run of characters means is decided in utils/markdownShortcuts.js,
  // where it can be argued with without an editor. This is the carrying out,
  // which needs a document.
  //
  // These run after StarterKit's own, and ProseMirror stops at the first rule
  // whose handler actually changes something — so where the editor already did
  // the right thing it still does it, and these only get a turn where it gave
  // up. A rule that matches and then finds it cannot wrap the block returns
  // nothing, which is exactly the case of typing "- " inside a heading.
  // Every separator currently on screen, so they can be re-measured together
  // when the editor changes shape. A Set rather than a query each time: these
  // are node views and they know when they are gone.
  const drawnSeparators = new Set();

  /** Whether anything real follows this separator on its line. */
  function hasContentAfter(dom) {
    for (let next = dom.nextSibling; next; next = next.nextSibling) {
      // The editor leaves scaffolding of its own at the end of a line — an
      // empty image after a trailing inline node, a <br> to give an empty line
      // height. Every piece of it is named ProseMirror-something, and none of
      // it is content. Counting the <br> was enough to make a separator on an
      // empty line come out three ems long.
      if (next.nodeType === 1 && /(^|\s)ProseMirror-/.test(next.className || '')) continue;
      if (next.nodeType === 3 && !next.nodeValue.trim()) continue;
      return true;
    }
    return false;
  }

  // Its width is whatever is left of the line, or a short divider when
  // something is already sitting beside it — see utils/markdownShortcuts.js.
  //
  // Zeroed before measuring, or a second pass measures the room it is already
  // filling and the line grows by its own width every time. A pixel is left
  // spare so a rounding error cannot push it onto the next line — where it
  // would measure a full line's worth of room and stay there.
  function fitSeparator(dom) {
    const line = dom?.parentElement;
    if (!line) return;

    dom.style.width = '0px';
    if (!separatorFillsLine({ hasContentAfter: hasContentAfter(dom) })) {
      dom.style.width = '3em';
      return;
    }

    const room = line.getBoundingClientRect().right - dom.getBoundingClientRect().left;
    dom.style.width = `${Math.max(0, Math.floor(room) - 1)}px`;
  }

  function fitSeparators() {
    for (const dom of drawnSeparators) fitSeparator(dom);
  }

  // A separator that sits in a line rather than breaking it.
  //
  // An <hr> is a block: it takes the whole width and pushes whatever was beside
  // it onto another line. That is right for a page break on an empty line and
  // wrong for "a separator on the same line as something else, before or after,
  // including images", which is what was asked for. So there are two, and
  // utils/markdownShortcuts.js says which one a given line gets.
  //
  // It carries no text and cannot be typed into, which is what `atom` means
  // here — it behaves as one object to the caret, like a picture does.
  const InlineSeparator = TipTapNode.create({
    name: 'inlineSeparator',
    inline: true,
    group: 'inline',
    atom: true,
    // Selectable, which is what lets a backspace take it: the editor deletes an
    // atom by selecting it first, and an unselectable one simply refuses to go.
    // Being easy to get rid of is half the reason it lives on a line at all.
    selectable: true,

    parseHTML() {
      return [{ tag: 'span[data-inline-separator]' }];
    },

    renderHTML() {
      return ['span', { 'data-inline-separator': '', class: 'tiptap-inline-sep' }];
    },

    // Drawn by hand because its width is a measurement, not a length.
    //
    // It has to start where the writing stopped and finish at the far edge of
    // the line, and CSS cannot express that: an inline box has no way to ask
    // for "the rest of the line". Flex would do it and breaks inline text —
    // every `<strong>` becomes its own flex item and the spaces between them
    // are dropped. Absolute positioning gets one end or the other, never both:
    // with `left` at its static position the box shrink-wraps, and with
    // `left: 0` it starts at the beginning of the line rather than at the text.
    //
    // So the room is measured and written on as a width. `ignoreMutation` keeps
    // the editor from treating that as somebody typing.
    addNodeView() {
      return () => {
        const dom = document.createElement('span');
        dom.className = 'tiptap-inline-sep';
        dom.setAttribute('data-inline-separator', '');
        dom.contentEditable = 'false';
        drawnSeparators.add(dom);
        fitSeparator(dom);

        return {
          dom,
          // Only the width we write on it. Ignoring *everything* also ignores
          // the browser removing it, so a backspace deleted it on screen, the
          // editor never heard, and it came straight back on the next redraw.
          ignoreMutation: (mutation) => mutation.type === 'attributes',
          destroy() {
            drawnSeparators.delete(dom);
          }
        };
      };
    },

    // Tasks are stored as markdown, and a node the serialiser has never heard
    // of throws rather than being skipped. Three dashes is what was typed and
    // what it reads back as.
    addStorage() {
      return {
        markdown: {
          serialize(state) {
            state.write('---');
          }
        }
      };
    }
  });

  // A list item may begin with anything, not only a paragraph.
  //
  // This is what makes a title able to become a list item while staying a
  // title. The stock rule is `paragraph block*`, so wrapping a heading in a
  // list is refused outright — which is why typing "- " inside one left the
  // marker sitting there as text. `- # Title` is ordinary markdown and
  // round-trips as ordinary markdown; nothing that was valid before stops
  // being valid.
  const AnyBlockListItem = ListItem.extend({ content: 'block+' });

  /**
   * A picture pasted into a note becomes a picture in the note.
   *
   * There was no paste handling here at all, and the window-level one in
   * App.svelte steps aside for anything editable on purpose -- so a picture
   * pasted into writing went nowhere, on every platform. Reported from a phone,
   * where the keyboard says so out loud.
   *
   * Reads as a data URL and inserts it, which is what the image extension is
   * configured for (`allowBase64`). The picture then travels with the note like
   * any other, rather than pointing at wherever it was copied from.
   */
  function handleImagePaste(view, event) {
    const clipboard = event?.clipboardData;
    if (!hasImage(clipboard)) return false;

    // The picture wins over whatever came with it. Copying an image in a
    // browser also puts the <img> markup on the clipboard, and copying one in a
    // file manager also puts its path there as text; inserting either alongside
    // the picture is noise at best and a link that rots at worst.
    event.preventDefault();
    const pictures = imagesFrom(clipboard);

    // Reading a file is asynchronous and ProseMirror wants an answer now, so
    // the answer is "handled" and the insert follows.
    (async () => {
      for (const picture of pictures) {
        try {
          const src = await readAsDataUrl(picture);
          if (src) editor.chain().focus().setImage({ src }).run();
        } catch (error) {
          console.error('Could not paste a picture:', error);
        }
      }
    })();

    return true;
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  const AggregateMarkdown = Extension.create({
    name: 'aggregateMarkdown',

    addInputRules() {
      // TipTap wants { index, text, data } back from a finder — an object, not
      // a match array. Handing it an array makes it read `.text` off it, get
      // undefined, and throw on the length of it.
      const finder = (decide) => (text) => {
        const found = decide(text);
        return found ? { index: found.index, text: found.text, data: found } : null;
      };

      return [
        new InputRule({
          find: finder(shortcutFor),
          handler: ({ chain, range, match }) => {
            const found = match.data;
            const run = chain().deleteRange(range);

            switch (found.kind) {
              // Back to ordinary writing. clearNodes lifts the line out of
              // whatever is wrapping it — a list, a quote — as well as turning
              // it back into a paragraph, which is the difference between this
              // and setParagraph on its own.
              case 'paragraph':
                run.clearNodes().unsetAllMarks();
                break;
              case 'heading':
                run.setNode('heading', { level: found.level });
                break;
              // The block keeps whatever it already is — a heading stays a
              // heading inside its new list item, which is the aggregating
              // that was asked for and what AnyBlockListItem above allows.
              case 'bulletList':
                run.toggleBulletList();
                break;
              case 'orderedList':
                run.toggleOrderedList();
                if (found.start > 1) run.updateAttributes('orderedList', { start: found.start });
                break;
              case 'blockquote':
                run.toggleBlockquote();
                break;
              case 'codeBlock':
                run.setNode('codeBlock', found.language ? { language: found.language } : {});
                break;
              // Always the one that lives on a line. How wide it is gets
              // worked out once it is there and can be measured.
              case 'horizontalRule':
                run.insertContent({ type: 'inlineSeparator' });
                break;
              default:
                return;
            }

            run.run();
          }
        }),

        new InputRule({
          find: finder(markShortcutFor),
          handler: ({ chain, range, match }) => {
            const found = match.data;
            const mark = { bold: 'bold', italic: 'italic', strike: 'strike', code: 'code' }[found.kind];
            if (!mark) return;

            chain()
              .deleteRange(range)
              .insertContent({ type: 'text', marks: [{ type: mark }], text: found.content })
              // Or everything typed afterwards is bold as well.
              .unsetMark(mark)
              .run();
          }
        })
      ];
    }
  });

  // StarterKit ships no image node, so markdown like ![alt](url) had nothing
  // to become and silently did nothing. Add the node, and give it a width that
  // survives save/reload plus a corner handle to drag it to any size.
  const ResizableImage = Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        width: {
          default: null,
          parseHTML: element => element.getAttribute('width') || element.style.width || null,
          renderHTML: attributes => {
            if (!attributes.width) return {};
            return { width: attributes.width, style: `width: ${attributes.width}` };
          }
        },
        // inline flows with the sentence; left/right float so text wraps
        // alongside; center puts it on its own centred line.
        align: {
          default: 'inline',
          parseHTML: element => element.getAttribute('data-align') || 'inline',
          renderHTML: attributes => ({ 'data-align': attributes.align || 'inline' })
        }
      };
    },
    addNodeView() {
      return ({ node, editor: view, getPos }) => {
        const wrap = document.createElement('span');
        wrap.className = 'tiptap-img-wrap';
        wrap.dataset.align = node.attrs.align || 'inline';

        // Alignment bar — how the image sits relative to the text around it.
        const bar = document.createElement('span');
        bar.className = 'tiptap-img-bar';
        bar.contentEditable = 'false';

        const setAlign = value => {
          if (typeof getPos !== 'function') return;
          const pos = getPos();
          if (typeof pos !== 'number') return;
          // Read the node back out of the document rather than using the one
          // captured when this view was built. That copy is a snapshot: after
          // a resize it still carries the old width, so aligning would quietly
          // undo the size, and vice versa.
          const current = view.view.state.doc.nodeAt(pos);
          if (!current) return;
          view.view.dispatch(
            view.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, align: value })
          );
        };

        for (const [value, label, title] of [
          ['inline', '↔', 'In the line of text'],
          ['left', '⇤', 'Float left, text wraps to the right'],
          ['center', '↕', 'Centred on its own line'],
          ['right', '⇥', 'Float right, text wraps to the left']
        ]) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = label;
          btn.title = title;
          btn.className = 'tiptap-img-align';
          if ((node.attrs.align || 'inline') === value) btn.classList.add('is-active');
          btn.addEventListener('mousedown', event => {
            event.preventDefault();
            event.stopPropagation();
            setAlign(value);
          });
          bar.appendChild(btn);
        }
        wrap.appendChild(bar);

        const img = document.createElement('img');
        img.src = node.attrs.src;
        if (node.attrs.alt) img.alt = node.attrs.alt;
        if (node.attrs.title) img.title = node.attrs.title;
        if (node.attrs.width) img.style.width = node.attrs.width;
        wrap.appendChild(img);

        const handle = document.createElement('span');
        handle.className = 'tiptap-img-handle';
        handle.contentEditable = 'false';
        wrap.appendChild(handle);

        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;

        // Follow whichever axis the pointer actually moved most. Dragging only
        // rightwards is useless for a right-floated image sitting against the
        // edge — pulling downwards has to grow it too.
        const onMove = event => {
          const dx = event.clientX - startX;
          const dy = event.clientY - startY;
          const aspect = startHeight > 0 ? startWidth / startHeight : 1;
          const next = Math.abs(dy) > Math.abs(dx)
            ? (startHeight + dy) * aspect
            : startWidth + dx;
          img.style.width = `${Math.max(40, Math.round(next))}px`;
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          const finalWidth = `${Math.round(img.getBoundingClientRect().width)}px`;
          if (typeof getPos === 'function') {
            const pos = getPos();
            if (typeof pos === 'number') {
              // Same as above: the live node, not the captured snapshot, so a
              // resize keeps whatever alignment the image currently has.
              const current = view.view.state.doc.nodeAt(pos);
              if (current) {
                view.view.dispatch(
                  view.view.state.tr.setNodeMarkup(pos, undefined, {
                    ...current.attrs,
                    width: finalWidth
                  })
                );
              }
            }
          }
        };

        handle.addEventListener('pointerdown', event => {
          event.preventDefault();
          event.stopPropagation();
          startX = event.clientX;
          startY = event.clientY;
          const rect = img.getBoundingClientRect();
          startWidth = rect.width;
          startHeight = rect.height;
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });

        return {
          dom: wrap,
          // The image is a leaf — let ProseMirror handle every other update.
          update: updated => {
            if (updated.type.name !== node.type.name) return false;
            img.src = updated.attrs.src;
            img.style.width = updated.attrs.width || '';
            const align = updated.attrs.align || 'inline';
            wrap.dataset.align = align;
            for (const btn of bar.querySelectorAll('.tiptap-img-align')) {
              btn.classList.toggle('is-active', btn.title.startsWith('In the line') ? align === 'inline'
                : btn.title.startsWith('Float left') ? align === 'left'
                : btn.title.startsWith('Centred') ? align === 'center'
                : align === 'right');
            }
            return true;
          },
          destroy: () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          }
        };
      };
    }
  });
  // Track the last content we pushed into the editor so we don't re-set on our own updates
  let lastPushedContent = null;

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        // History off: the editor's own would be a second, competing undo
        // stack that dies with the component. Text history is kept per block
        // in utils/textHistory.js instead, so it outlives a remount.
        StarterKit.configure({ history: false, listItem: false }),
        AnyBlockListItem,
        // html:true so setContent can parse BOTH legacy markdown content and the
        // HTML we now store. We store HTML (getHTML) because markdown collapses
        // consecutive blank lines — HTML keeps every empty paragraph.
        Markdown.configure({
          html: true,
          transformCopiedText: true,
          transformPastedText: true,
        }),
        // inline:true lets an image sit inside a paragraph — after text, between
        // words, anywhere the caret is — instead of being forced onto its own
        // full-width line. allowBase64 so pasted data: URLs render too.
        ResizableImage.configure({ inline: true, allowBase64: true }),
        InlineSeparator,
        AggregateMarkdown,
        Placeholder.configure({ placeholder }),
      ],
      content: content || '',
      editorProps: {
        attributes: { class: 'tiptap-inner', spellcheck: 'false' },
        handleKeyDown: handleHistoryKeys,
        handlePaste: handleImagePaste,
      },
      onUpdate({ editor: e }) {
        const value =
          emit === 'markdown'
            ? (e.storage?.markdown?.getMarkdown?.() ?? e.getHTML())
            : e.getHTML();
        // Tracked in the same format we emit, so the reactive push below can
        // tell "the parent echoed our own value back" from a real change.
        lastPushedContent = value;
        if (!applyingHistory) recordText(historyKey, value, e.state.selection.from);
        dispatch('change', value);
        // A separator's width is the room left on its line, and writing is what
        // changes that room.
        fitSeparators();
      },
      onFocus({ event }) {
        dispatch('focus', event);
      },
      onBlur({ event }) {
        dispatch('blur', event);
      },
    });
    lastPushedContent = content;
    initTextHistory(historyKey, content || '');
    // Restore scroll after editor settles
    if (initialScrollTop && wrapEl) {
      requestAnimationFrame(() => { wrapEl.scrollTop = initialScrollTop; });
    }

    // The other thing that changes the room on a line is the line getting
    // wider or narrower — a block resized, a window resized, a panel opened.
    //
    // Both an observer and the window's own event, for the reason written up
    // over the control bar: an observer reports nothing while the page is not
    // being drawn, and a window resize arrives either way. Between them the
    // width is right whichever way the line changed.
    if (typeof ResizeObserver !== 'undefined' && element) {
      separatorWatcher = new ResizeObserver(fitSeparators);
      separatorWatcher.observe(element);
    }
    window.addEventListener('resize', fitSeparators);
  });

  // Sync external content changes (e.g. switching notes)
  $: if (editor && content !== lastPushedContent) {
    editor.commands.setContent(content || '', false);
    lastPushedContent = content;
    // The change came from outside — a cloud download, or the workspace undo
    // restoring a snapshot — so the history is told about it rather than
    // being left pointing at a version this block no longer has.
    syncTextHistory(historyKey, content || '');
  }

  onDestroy(() => {
    separatorWatcher?.disconnect();
    window.removeEventListener('resize', fitSeparators);
    editor?.destroy();
  });

  function onScroll() {
    dispatch('scroll', wrapEl?.scrollTop ?? 0);
  }
</script>

<style>
  .tiptap-wrap {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    /* Reaching the top or bottom of a note stops there. Without this the
       browser hands the rest of the gesture to whatever is underneath, so
       scrolling to the end of the text carried on into the canvas. */
    overscroll-behavior: contain;
    /* The editor does not decide what it sits on.
     *
     * This used to fall back to the canvas colour, which is right in Single
     * Note mode — where the note *is* the canvas — and wrong everywhere else:
     * inside a block it painted the canvas over the block, so a text block's
     * writing area came out the colour of the board while its header kept the
     * block's own colour. Only text blocks showed it, because only they hold an
     * editor; a music or image block was never affected.
     *
     * BlockShell did carry an override, but at the same specificity — two
     * classes each — so which one won came down to the order the stylesheets
     * happened to load. That is why it looked intermittent.
     *
     * Transparent and inherit instead: Single Note mode sets --active-note-bg
     * and --active-note-text on every note it draws, so it is unaffected, and
     * anywhere else the editor now shows the colours of whatever contains it.
     */
    background: var(--active-note-bg, transparent);
    color: var(--active-note-text, inherit);
    box-sizing: border-box;
    /* The app's own face, which carries every weight between 100 and 900 —
       see the @font-face in app.css. Arial was named here and has two. */
    font-family: 'Inter', system-ui, Arial, Helvetica, sans-serif;
    font-size: 1.05rem;
    line-height: 1.6;
    cursor: text;
  }

  /* Inline variant: no scroller of its own and no imposed height, so a task
     row grows to fit exactly the lines it holds. */
  .tiptap-wrap.tiptap-inline {
    flex: 1 1 auto;
    overflow: visible;
    background: none;
    color: inherit;
    font-size: inherit;
    line-height: inherit;
    font-family: inherit;
  }
  .tiptap-wrap.tiptap-inline :global(.tiptap-inner) {
    padding: 0;
    min-height: 0;
  }

  .tiptap-mount {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* Padding lives on the contenteditable itself (not the wrap around it) so
     the padding band is part of the same clickable text surface — clicking
     anywhere in the block, including its edges, hits real editable content
     and gets native/ProseMirror click-to-position instead of falling back
     to a plain (and imprecise) editor.commands.focus() on the outer wrap. */
  :global(.tiptap-inner) {
    flex: 1 1 auto;
    /* Contains the floated pictures. This is the clearfix that used to sit
       after the text, without the empty block at the end of the content. */
    display: flow-root;
    outline: none;
    min-height: 80px;
    padding: 12px;
    box-sizing: border-box;
    white-space: pre-wrap;
    /* word-break: break-word throws off Chrome's contenteditable caret
       hit-testing near line/text ends (clicking after the last character
       lands one position short). overflow-wrap achieves the same
       long-word wrapping without that bug. */
    overflow-wrap: anywhere;
    cursor: text;
  }

  :global(.tiptap-inner p) { margin: 0; }

  /* A negative margin on the last line was tried here, to give back the leading
     under it. It does nothing: a scroller's overflow area is the union of the
     boxes inside it, and margins — positive or negative — are not part of it.
     The only way to make a scrollbar appear later is to make the boxes smaller,
     which is what the line height and the padding do. */

  /* Images and their drag-to-resize corner */
  :global(.tiptap-img-wrap) {
    position: relative;
    display: inline-block;
    max-width: 100%;
    line-height: 0;
    vertical-align: baseline;
  }

  /* Position relative to the surrounding text. Floating is what lets a
     paragraph actually run beside the image instead of under it. */
  :global(.tiptap-img-wrap[data-align='left']) {
    float: left;
    margin: 4px 14px 6px 0;
  }
  :global(.tiptap-img-wrap[data-align='right']) {
    float: right;
    margin: 4px 0 6px 14px;
  }
  :global(.tiptap-img-wrap[data-align='center']) {
    display: block;
    float: none;
    /* fit-content, or the block fills the line and the auto margins collapse
       to zero — leaving the image sitting on the left instead of centred. */
    width: fit-content;
    margin: 10px auto;
  }


  /* Alignment bar, only while the pointer is on the image */
  :global(.tiptap-img-bar) {
    position: absolute;
    top: 4px;
    left: 4px;
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.65);
    opacity: 0;
    transition: opacity 0.15s ease;
    z-index: 2;
    line-height: 1;
  }
  :global(.tiptap-img-wrap:hover .tiptap-img-bar) { opacity: 1; }
  :global(.tiptap-img-align) {
    all: unset;
    cursor: pointer;
    padding: 2px 5px;
    border-radius: 4px;
    color: #ffffff;
    font-size: 0.78rem;
    line-height: 1.1;
  }
  :global(.tiptap-img-align:hover) { background: rgba(255, 255, 255, 0.2); }
  :global(.tiptap-img-align.is-active) { background: rgba(255, 255, 255, 0.32); }
  :global(.tiptap-img-wrap img) {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    display: block;
  }
  :global(.tiptap-img-handle) {
    position: absolute;
    right: -5px;
    bottom: -5px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--active-note-text, #ffffff);
    border: 2px solid var(--active-note-bg, #000000);
    cursor: nwse-resize;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  /* Stays out of the way until you actually reach for the image. */
  :global(.tiptap-img-wrap:hover .tiptap-img-handle) { opacity: 1; }

  :global(.tiptap-inner h1) { font-size: 1.7em; font-weight: 700; margin: 0.6em 0 0.3em; }
  :global(.tiptap-inner h2) { font-size: 1.35em; font-weight: 700; margin: 0.5em 0 0.25em; }
  :global(.tiptap-inner h3) { font-size: 1.15em; font-weight: 600; margin: 0.4em 0 0.2em; }

  :global(.tiptap-inner em) { font-style: italic; }
  :global(.tiptap-inner s) { text-decoration: line-through; }
  :global(.tiptap-inner code) {
    font-family: monospace;
    background: rgba(255,255,255,0.1);
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 0.9em;
  }
  :global(.tiptap-inner pre) {
    background: rgba(255,255,255,0.07);
    border-radius: 6px;
    padding: 10px 12px;
    overflow-x: auto;
    margin: 0.5em 0;
  }
  :global(.tiptap-inner pre code) { background: none; padding: 0; }

  :global(.tiptap-inner ul, .tiptap-inner ol) { padding-left: 1.4em; margin: 0.3em 0; }
  :global(.tiptap-inner li) { margin: 0.15em 0; }

  /* These three were white, which is a colour that belongs to no theme and was
     invisible on half of them. currentColor is the writing's own colour
     wherever the editor happens to be — a block's, a note's, a mode's — so they
     follow it without being told, which is the rule in CLAUDE.md. */
  :global(.tiptap-inner blockquote) {
    border-left: 3px solid color-mix(in srgb, currentColor 30%, transparent);
    margin: 0.4em 0;
    padding-left: 10px;
    color: color-mix(in srgb, currentColor 70%, transparent);
  }

  :global(.tiptap-inner hr) {
    border: none;
    /* The browser's own stylesheet gives an <hr> `color: gray`, so currentColor
       on one is grey rather than the writing's colour — measured, after this
       rule looked right and came out the wrong colour anyway. */
    color: inherit;
    border-top: 1px solid color-mix(in srgb, currentColor 35%, transparent);
    margin: 0.8em 0;
  }

  /* The separator that shares a line. Its width is written on by the node view
     — it is the room left on the line, which no length can express — so there
     is none here. Centred on the line so it reads as a divider rather than an
     underscore. */
  :global(.tiptap-inline-sep),
  :global([data-inline-separator]) {
    display: inline-block;
    height: 0;
    margin: 0 0 0 0.45em;
    vertical-align: middle;
    border-top: 1px solid color-mix(in srgb, currentColor 35%, transparent);
  }

  /* The bullet takes the weight of what it belongs to: next to a title it is a
     title's bullet. The marker is drawn from the item's own font, so this is
     the whole of it. */
  :global(.tiptap-inner li:has(> h1, > h2, > h3)) {
    font-weight: 700;
  }

  /* Empty placeholder */
  :global(.tiptap-inner p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    color: color-mix(in srgb, currentColor 40%, transparent);
    pointer-events: none;
    float: left;
    height: 0;
  }
</style>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="tiptap-wrap" class:tiptap-inline={variant === 'inline'} bind:this={wrapEl} on:scroll={onScroll}
  on:click={() => editor?.commands.focus()}>
  <div class="tiptap-mount" bind:this={element}></div>
</div>
