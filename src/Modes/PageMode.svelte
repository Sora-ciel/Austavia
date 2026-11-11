<script>
  /**
   * Page mode: a page like Notion's, made of the folder's own blocks.
   *
   * Planned 2026-10-27 (PENDING, "Page mode, and nests"); redirected
   * 2026-11-04 on seeing a first version built from Simple Note's cards:
   * "text blocks and other blocks and all won't have the colors on the
   * borders. second. the page wherever you click, it's basically a line and
   * you can directly write something ... on one line or multiple lines we
   * can have multiple blocks sharing the width etc."
   *
   * So a block here is the same component as on the Canvas (Block.svelte),
   * drawn with BlockShell's `placement="page"`: no frame, no header, no
   * colours of its own, as wide as its place. The page is rows of them, a
   * row being one block or several side by side; a handle beside each one (a dot)
   * moves it -- onto another's side to share its row, above or below for a
   * row of its own -- and opens its menu. A click on the empty page writes.
   *
   * "/" in the writing (or "＋ Block…") opens one menu of new blocks and the
   * folder's blocks not on the page yet (SlashMenu, utils/slashMenu.js); the
   * one chosen goes where the "/" was, splitting the writing around it.
   *
   * What is the page's own is only its rows: utils/pageLayout.js decides,
   * this acts.
   */
  import { createEventDispatcher, tick, onMount } from 'svelte';
  import Block from '../components/Block.svelte';
  import ModeWallpaper from '../components/ModeWallpaper.svelte';
  import SlashMenu from '../components/SlashMenu.svelte';
  import CropEditor from '../components/CropEditor.svelte';
  import { widthFromDrag } from '../utils/crop.js';
  import { galleryOf } from '../utils/gallery.js';
  import { slashItems, stepChoice, slashSplit } from '../utils/slashMenu.js';
  import { splitWritingAt } from '../utils/editorSplit.js';
  import BlockContextMenu from '../components/BlockContextMenu.svelte';
  import Lightbox from '../components/Lightbox.svelte';
  import { htmlToText } from '../utils/htmlToText.js';
  import { modeTextColor as modeTextColorFor } from '../utils/modeSurface.js';
  import { isPrimaryPointer } from '../utils/pointer.js';
  import {
    blocksOnPage, blocksOffPage, putOnPage, takeOffPage, placeOnPage, clickBelow, clickWrites, dropSide,
    PAGE_BLOCK_TYPES, blockPickName, rowsFor, editPage, isNarrow, setCellWidth,
    setPlaceField, placesById, withTitle, TITLE_ID, pageBlockMenu, PICTURE_SIZES
  } from '../utils/pageLayout.js';
  import { createLongPress } from '../utils/longPress.js';
  import { idleScrollbar } from '../utils/idleScrollbar.js';

  export let openFolder = '';
  export let blocks = [];
  /** The page shown: the folder's own or a page block's, `{ rows, narrowRows }`. */
  export let page = { rows: [] };
  /** Its title: the folder's name, or the page block's title. */
  export let title = '';
  /** The page block shown, or null for the folder's own page. */
  export let pageId = null;
  /** Edit mode, switched from the control bar (App.svelte). */
  export let editMode = false;
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let backgroundSettings = {};
  export let canvasRef;
  export let library = { tracks: [], playlists: [] };
  export let nowPlayingId = null;
  export let isPlaying = false;

  const dispatch = createEventDispatcher();

  $: canvasTheme = { outerBg: '#000000', innerBg: '#000000', ...(canvasColors || {}) };
  $: modeTextColor = modeTextColorFor(canvasTheme);
  $: pageVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg}; --mode-text-color: ${modeTextColor};`;

  // A computer's layout and a phone's are kept apart (pageLayout.js,
  // asked 2026-11-10): which one is in use goes by this window's width.
  let innerWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  $: narrow = isNarrow(innerWidth);
  $: rows = rowsFor(page, narrow);
  // A page block never shows itself, which would open it inside itself.
  // The title is placed among the blocks (pageLayout.js withTitle), drawn
  // here rather than by a block component.
  const TITLE_BLOCK = { id: TITLE_ID, type: TITLE_ID };
  $: shownRows = blocksOnPage(withTitle(rows), [...blocks.filter(block => block.id !== pageId), TITLE_BLOCK]);
  // How each block is shown on this page in this layout: its crop, a nest's
  // tile size (asked 2026-11-10, per layout like its place).
  $: places = placesById(rows);

  // ── Edit mode: pictures sized and cropped (asked 2026-11-10) ─────────
  // "activate an edit mode for that mode. where you can change the images
  // size even crop it and other things we'll be able to do." A picture's
  // share of its row is its cell's, in the layout in use (pageLayout.js
  // setCellWidth); its crop is the picture's own (utils/crop.js).
  let liveWidth = null; // { id, width } while a picture's edge is dragged
  let cropping = null;  // the picture block being cropped

  $: widths = new Map(rows.flatMap(row => row.cells).filter(cell => cell.width).map(cell => [cell.blockId, cell.width]));
  // Reactive, not a plain function: the markup asks it for each column, and
  // Svelte redraws markup only when a name in it changes -- as a plain
  // function the width being dragged was never drawn until the drag ended,
  // so a picture did not change size under the finger (2026-11-11).
  $: widthOf = id => (liveWidth?.id === id ? liveWidth.width : widths.get(id));

  function sourceOf(block) {
    if (typeof block?.src === 'string' && block.src) return block.src;
    return block?.resolvedSrc || '';
  }

  function startWidthDrag(event, blockId) {
    event.preventDefault();
    event.stopPropagation();
    const cell = event.currentTarget.closest('.page-col');
    const row = cell?.parentElement;
    if (!cell || !row) return;
    const measure = clientX => widthFromDrag({
      rowWidth: row.getBoundingClientRect().width,
      cellLeft: cell.getBoundingClientRect().left,
      x: clientX
    });
    const onMove = e => { liveWidth = { id: blockId, width: measure(e.clientX) }; };
    const onUp = e => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const width = measure(e.clientX);
      liveWidth = null;
      changeLayout(r => setCellWidth(r, blockId, width));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // On a page a crop is the layout's, like the picture's place (asked
  // 2026-11-10: "on phone or pc you have different crop following the same
  // rule as block moving"); the picture's own crop is the viewer's to set.
  function applyCrop(crop) {
    const block = cropping;
    cropping = null;
    if (!block) return;
    changeLayout(r => setPlaceField(r, block.id, 'crop', crop));
  }

  // A nest's tile size, in edit mode, per layout.
  let liveTile = null; // { id, size } while the slider moves
  $: tileOf = id => (liveTile?.id === id ? liveTile.size : places.get(id)?.tile);
  function setTile(id, size) {
    liveTile = null;
    changeLayout(r => setPlaceField(r, id, 'tile', size));
  }


  /** Putting on or taking off -- the page's content, both layouts. */
  function changeContent(op) {
    dispatch('pageChange', { page: editPage(page, { narrow, content: true, op }) });
  }

  /** Moving -- the layout in use only. */
  function changeLayout(op) {
    // With the title among the rows, so it can be moved and dropped by.
    dispatch('pageChange', { page: editPage(page, { narrow, op: r => op(withTitle(r)) }) });
  }

  // ── Writing anywhere ─────────────────────────────────────────────────
  // A click on the page itself, not on a block or a control, writes:
  // utils/pageLayout.js clickBelow says where.
  let wantCaretIn = null;

  function editorOf(blockId) {
    return canvasRef?.querySelector(`[data-page-block="${blockId}"] .ProseMirror`)?.editor || null;
  }

  async function caretAtEnd(blockId) {
    if (focusedBlockId !== blockId) dispatch('focusToggle', { id: blockId });
    await tick();
    editorOf(blockId)?.commands.focus('end');
  }

  // Where the press that ends in a click began: a click writes only when it
  // began on the empty page too, with no drag (clickWrites in
  // utils/pageLayout.js).
  let pagePress = null;
  const onEmptyPage = target => !target?.closest?.('.page-cell, button, input, a, .page-title');
  function onPagePointerDown(event) {
    pagePress = { onPage: onEmptyPage(event.target), x: event.clientX, y: event.clientY };
  }

  function onPageClick(event) {
    if (!onEmptyPage(event.target)) return;
    const rows = canvasRef?.querySelectorAll('.page-row');
    const last = rows?.length ? rows[rows.length - 1].getBoundingClientRect() : null;
    const writes = clickWrites({
      pressOnPage: pagePress?.onPage === true,
      moved: pagePress ? Math.hypot(event.clientX - pagePress.x, event.clientY - pagePress.y) : 0,
      below: !last || event.clientY > last.bottom
    });
    pagePress = null;
    if (!writes) return;
    const answer = clickBelow(shownRows);
    if (answer.focus) {
      caretAtEnd(answer.focus);
    } else {
      wantCaretIn = 'new';
      dispatch('addBlock', { type: 'text' });
    }
  }

  // The block just made for writing takes the caret once it is drawn: App
  // focuses the new block, and here the editor inside it is given the caret.
  $: if (wantCaretIn === 'new' && focusedBlockId && shownRows.some(row => row.blocks.some(b => b.id === focusedBlockId))) {
    const id = focusedBlockId;
    wantCaretIn = null;
    tick().then(() => editorOf(id)?.commands.focus('end'));
  }

  // ── The title: the folder's name, renamed by pressing it ─────────────
  let renaming = false;
  let titleInput;

  async function startRename() {
    renaming = true;
    await tick();
    titleInput?.focus();
    titleInput?.select();
  }

  function finishRename(event, keep = true) {
    if (!renaming) return;
    renaming = false;
    const to = event.target.value.trim();
    if (keep && to && to !== title) dispatch('renamePage', { title: to });
  }

  function titleKeydown(event) {
    if (event.key === 'Enter') { event.preventDefault(); finishRename(event); }
    else if (event.key === 'Escape') { event.preventDefault(); finishRename(event, false); }
  }

  // ── Adding: "/" in the writing, or the "＋ Block…" button ─────────────
  // One menu either way: a new block of each kind, then the folder's blocks
  // not on the page yet, filtered by what is typed.
  let slashMenu = null; // { source: 'text' | 'button', textId, from, to, x, y, query }
  let slashActive = 0;

  $: offPage = blocksOffPage(rows, blocks.filter(block => block.id !== pageId)).map(block => ({
    id: block.id,
    type: block.type === 'cleantext' ? 'text' : block.type,
    name: blockPickName(block, htmlToText)
  }));
  $: slashRows = slashMenu ? slashItems({ query: slashMenu.query, types: PAGE_BLOCK_TYPES, existing: offPage }) : [];
  $: if (slashActive >= slashRows.length) slashActive = Math.max(0, slashRows.length - 1);

  function onSlash(textId, found) {
    if (!found) {
      if (slashMenu?.source === 'text' && slashMenu.textId === textId) slashMenu = null;
      return;
    }
    if (!slashMenu || slashMenu.query !== found.query) slashActive = 0;
    slashMenu = { source: 'text', textId, ...found };
  }

  function openAddMenu(event) {
    const box = event.currentTarget.getBoundingClientRect();
    slashMenu = { source: 'button', x: box.left, y: box.bottom, query: '' };
    slashActive = 0;
  }

  function onSlashKey(key) {
    if (!slashMenu) return;
    if (key === 'ArrowUp' || key === 'ArrowDown') slashActive = stepChoice(slashActive, slashRows.length, key);
    else if (key === 'Enter' || key === 'Tab') pickSlash(slashRows[slashActive]);
    else if (key === 'Escape') slashMenu = null;
  }

  function pickSlash(item) {
    const opened = slashMenu;
    slashMenu = null;
    if (!item || !opened) return;
    if (opened.source === 'button') {
      // From "＋ Block…" at the end, or "Add a block below…" in a block's menu.
      const afterId = opened.afterId || null;
      if (item.kind === 'new') dispatch('addBlock', { type: item.type, afterId });
      else changeContent(r => putOnPage(r, item.blockId, { afterId, blocks }));
      return;
    }
    const editor = editorOf(opened.textId);
    if (!editor) return;
    // The "/" and what was typed after it go; the writing is cut where they
    // were, and keeps its own part -- sent by its own update, flushed by the
    // blur -- before the page changes round it.
    editor.chain().deleteRange({ from: opened.from, to: opened.to }).run();
    const parts = splitWritingAt(editor, opened.from);
    const where = slashSplit(parts);
    editor.commands.setContent(where === 'above' ? parts.afterHtml : parts.beforeHtml, { emitUpdate: true });
    editor.commands.blur();
    dispatch('insertOnPage', {
      textId: opened.textId,
      where,
      afterHtml: parts.afterHtml,
      type: item.kind === 'new' ? item.type : null,
      existingId: item.kind === 'existing' ? item.blockId : null
    });
  }

  // ── A block's handle: its menu, and moving it ────────────────────────
  let menu = null; // { blockId, x, y }

  function openMenu(blockId, handle) {
    const box = handle.getBoundingClientRect();
    menu = { blockId, x: box.right + 4, y: box.top };
  }

  $: menuBlock = menu ? blocks.find(b => b.id === menu.blockId) : null;

  function menuAction(id) {
    const opened = menu;
    const blockId = opened?.blockId;
    menu = null;
    if (!blockId) return;
    if (id === 'takeOff') changeContent(r => takeOffPage(r, blockId, { blocks }));
    else if (id === 'delete') dispatch('delete', { id: blockId });
    else if (id === 'crop') cropping = blocks.find(b => b.id === blockId) || null;
    else if (id === 'replacePicture') choosePicture({ replace: blockId });
    else if (id === 'addPicture') choosePicture({ afterId: blockId });
    else if (id === 'addBlock') {
      slashMenu = { source: 'button', x: opened.x, y: opened.y, query: '', afterId: blockId };
      slashActive = 0;
    }
  }

  // ── A block's menu without edit mode ─────────────────────────────────
  // A long press on a phone, a right-click on a computer: asked 2026-11-11,
  // "easier to add an image or delete an image or block without having to go
  // to edit mode, using for example a pop-up that comes after a long press".
  // What it offers is pageBlockMenu (pageLayout.js). Not on writing: a long
  // press there selects words, and a right-click there is the browser's.
  const onWriting = target => Boolean(target?.closest?.('.ProseMirror, input, textarea, [contenteditable="true"]'));
  let heldBlock = null;
  let swallowClick = false;
  const hold = createLongPress({
    onLongPress: point => {
      if (!heldBlock || heldBlock === TITLE_ID) return;
      menu = { blockId: heldBlock, x: point.x, y: point.y };
      swallowClick = true;
      try { navigator.vibrate?.(15); } catch { /* no buzz here */ }
    }
  });

  function cellPointerDown(event, blockId) {
    if (event.pointerType !== 'touch' || onWriting(event.target)) return;
    heldBlock = blockId;
    hold.start({ x: event.clientX, y: event.clientY });
  }
  const cellPointerMove = event => hold.move({ x: event.clientX, y: event.clientY });
  const cellPointerUp = () => hold.finish();
  const cellPointerCancel = () => hold.cancel();

  function cellClickCapture(event) {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function cellContextMenu(event, blockId) {
    if (blockId === TITLE_ID || onWriting(event.target)) return;
    event.preventDefault();
    menu = { blockId, x: event.clientX, y: event.clientY };
  }

  // A picture chosen from the device: added under a block, or in place of one.
  let pictureInput;
  let pictureFor = null; // { afterId } | { replace }
  function choosePicture(target) {
    pictureFor = target;
    if (pictureInput) {
      pictureInput.value = '';
      pictureInput.click();
    }
  }
  function onPictureChosen(event) {
    const file = event.target.files?.[0];
    const target = pictureFor;
    pictureFor = null;
    if (!file || !target) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result;
      if (target.replace) {
        dispatch('update', { id: target.replace, src, resolvedSrc: null, changedKeys: ['src', 'resolvedSrc'], pushToHistory: true, bumpVersion: true });
      } else {
        dispatch('addBlock', { type: 'image', afterId: target.afterId, fields: { src } });
      }
    };
    reader.readAsDataURL(file);
  }

  // Moving: hold the handle and drag. Where it lands is decided by
  // dropSide (pageLayout.js): near a block's left or right edge is beside
  // it, anywhere else above or below it.
  const DRAG_THRESHOLD = 5;
  // Within this many pixels of a row's bottom, a drop goes below the whole row.
  const ROW_EDGE = 14;
  let press = null;    // { blockId, x, y }
  let dragging = null; // blockId
  let drop = null;     // { targetId, side, box }

  function handleDown(event, blockId) {
    if (!isPrimaryPointer(event)) return;
    press = { blockId, x: event.clientX, y: event.clientY };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
  }

  function handleMove(event) {
    if (!press) return;
    if (!dragging) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_THRESHOLD) return;
      dragging = press.blockId;
    }
    event.preventDefault();
    // What is under the pointer: a block, else a column's empty space under
    // its last block, else the rest of the page below everything.
    let target = null;
    let column = null;
    let pageEnd = false;
    for (const el of document.elementsFromPoint(event.clientX, event.clientY)) {
      const cell = el.closest?.('[data-page-block]');
      if (cell) { target = cell; break; }
      if (!column) column = el.closest?.('.page-col');
      if (el.closest?.('.page-below')) pageEnd = true;
    }
    const pageRect = canvasRef.getBoundingClientRect();
    const inPage = r => ({
      left: r.left - pageRect.left + canvasRef.scrollLeft,
      top: r.top - pageRect.top + canvasRef.scrollTop,
      width: r.width,
      height: r.height
    });

    // Asked 2026-11-10, for a block beside a longer one: "i want to have those
    // three solutions" -- beside it (its left or right edge), under it in its
    // column (its lower half, or the empty space under the column), or below
    // the whole row (the last few pixels of the row, or the next row's top).
    if (target && target.dataset.pageBlock !== dragging) {
      const rect = target.getBoundingClientRect();
      const rowEl = target.closest('.page-row');
      const rowRect = rowEl.getBoundingClientRect();
      const several = rowEl.classList.contains('several');
      let side = dropSide({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, x: event.clientX, y: event.clientY });
      let box = inPage(rect);
      if (several && (side === 'above' || side === 'below')) {
        if (side === 'below' && event.clientY > rowRect.bottom - ROW_EDGE) {
          box = inPage(rowRect);
        } else {
          side = side === 'above' ? 'over' : 'under';
        }
      }
      drop = { targetId: target.dataset.pageBlock, side, box };
      return;
    }
    if (column) {
      const cells = column.querySelectorAll('[data-page-block]');
      const last = cells[cells.length - 1];
      const rowEl = column.closest('.page-row');
      const rowRect = rowEl.getBoundingClientRect();
      // Near the row's bottom edge: below the whole row, as over a block.
      if (last && event.clientY > rowRect.bottom - ROW_EDGE) {
        const anchor = [...rowEl.querySelectorAll('[data-page-block]')].find(el => el.dataset.pageBlock !== dragging);
        if (anchor) {
          drop = { targetId: anchor.dataset.pageBlock, side: 'below', box: inPage(rowRect) };
          return;
        }
      }
      if (last && last.dataset.pageBlock !== dragging) {
        drop = { targetId: last.dataset.pageBlock, side: 'under', box: inPage(last.getBoundingClientRect()) };
        return;
      }
    }
    if (pageEnd) {
      const rows = canvasRef.querySelectorAll('.page-row');
      const lastRow = rows[rows.length - 1];
      if (lastRow) {
        drop = { targetId: null, side: 'end', box: inPage(lastRow.getBoundingClientRect()) };
        return;
      }
    }
    drop = null;
  }

  function stopListening() {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    window.removeEventListener('pointercancel', handleCancel);
  }

  function handleUp() {
    stopListening();
    if (dragging && drop) {
      const { targetId, side } = drop;
      const moving = dragging;
      changeLayout(r => (side === 'end'
        ? placeOnPage(r, moving, { blocks })
        : placeOnPage(r, moving, { targetId, side, blocks })));
    } else if (!dragging && press) {
      // A press without a move is a click: the menu.
      const handle = canvasRef?.querySelector(`[data-page-block="${press.blockId}"] .page-handle`);
      if (handle && press.blockId !== TITLE_ID) openMenu(press.blockId, handle);
    }
    press = null;
    dragging = null;
    drop = null;
  }

  function handleCancel() {
    stopListening();
    press = null;
    dragging = null;
    drop = null;
  }

  // Where the line showing the drop is drawn, inside the page.
  $: dropLine = drop
    ? (drop.side === 'left' || drop.side === 'right'
        ? `left:${drop.side === 'left' ? drop.box.left - 6 : drop.box.left + drop.box.width + 3}px; top:${drop.box.top}px; width:3px; height:${drop.box.height}px;`
        : `left:${drop.box.left}px; top:${drop.side === 'above' || drop.side === 'over' ? drop.box.top - 5 : drop.box.top + drop.box.height + 2}px; width:${drop.box.width}px; height:3px;`)
    : '';

  // ── Pictures open full screen, as on the Canvas ──────────────────────
  let lbOpen = false;
  let gallery = { images: [], blockIds: [], crops: {}, start: 0 };

  // Every picture on this page, in order (utils/gallery.js).
  function openLightbox(event) {
    const src = event.detail?.src;
    if (!src) return;
    gallery = galleryOf(shownRows.flatMap(row => row.blocks), src);
    lbOpen = true;
  }

  onMount(() => {
    const closeMenu = event => {
      if (menu && !event.target.closest?.('.ctx-menu')) menu = null;
      if (slashMenu?.source === 'button' && !event.target.closest?.('.slash-menu')) slashMenu = null;
    };
    window.addEventListener('pointerdown', closeMenu);
    return () => {
      stopListening();
      window.removeEventListener('pointerdown', closeMenu);
    };
  });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<svelte:window bind:innerWidth />

<div class="page-mode" class:dragging={Boolean(dragging)} class:edit-mode={editMode} class:narrow bind:this={canvasRef} style={pageVars} use:idleScrollbar={{ balance: true }} on:pointerdown={onPagePointerDown} on:click={onPageClick}>
  <ModeWallpaper settings={backgroundSettings} />

  <div class="page-column">
    {#each shownRows as row (row.key)}
      <div class="page-row" class:several={row.columns.length > 1}>
        {#each row.columns as col (col.key)}
          <!-- A column: a block, and any stacked under it (pageLayout.js). -->
          <div
            class="page-col"
            class:fits-picture={row.columns.length > 1 && col.blocks.length === 1 && col.blocks[0].type === 'image' && !widthOf(col.key)}
            class:sized={Boolean(widthOf(col.key))}
            style={widthOf(col.key) ? `flex: 0 1 ${widthOf(col.key) * 100}%; max-width: ${widthOf(col.key) * 100}%;` : ''}
          >
            {#each col.blocks as block (`${block.id}-${block._version || 0}`)}
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="page-cell"
                class:moving={dragging === block.id}
                data-page-block={block.id}
                on:pointerdown={(event) => cellPointerDown(event, block.id)}
                on:pointermove={cellPointerMove}
                on:pointerup={cellPointerUp}
                on:pointercancel={cellPointerCancel}
                on:click|capture={cellClickCapture}
                on:contextmenu={(event) => cellContextMenu(event, block.id)}
              >
                <button
                  class="page-handle"
                  title="Drag to move, press for the menu"
                  aria-label="Move or open the menu"
                  on:pointerdown|preventDefault={(event) => handleDown(event, block.id)}
                  on:click|stopPropagation
                >
                  <!-- A small dot in a wider place to hold: asked 2026-11-11,
                       "maybe a kind of dot or circle pretty small one but the
                       space that you can click to move is wider than the dot
                       so that it's not hard to hold onto it". It was four
                       arrows, and Notion's six dots before that. -->
                  <span class="page-handle-dot" aria-hidden="true"></span>
                </button>
                {#if block.id === TITLE_ID}
                  {#if renaming}
                    <input
                      class="page-title page-title-input"
                      aria-label="Page name"
                      value={title}
                      bind:this={titleInput}
                      on:keydown={titleKeydown}
                      on:blur={finishRename}
                    />
                  {:else}
                    <button class="page-title" title="Press to rename" on:click={startRename}>{title || 'Untitled'}</button>
                  {/if}
                {:else}
                <Block
                  {block}
                  placement="page"
                  focused={block.id === focusedBlockId}
                  fileKey={openFolder}
                  {library}
                  {nowPlayingId}
                  {isPlaying}
                  on:update
                  on:delete
                  on:focusToggle
                  on:lightbox={openLightbox}
                  on:slash={(e) => onSlash(block.id, e.detail)}
                  on:slashKey={(e) => onSlashKey(e.detail)}
                  on:play
                  on:toggle
                  pageCrop={places.get(block.id)?.crop}
                  tileSize={tileOf(block.id)}
                />
                {/if}
                {#if editMode && block.type === 'nest'}
                  <label class="page-edit-tools page-tile-size" title="Size of the tiles">
                    Tiles
                    <input
                      type="range"
                      min="100"
                      max="360"
                      step="10"
                      value={tileOf(block.id) || 210}
                      on:input={(e) => (liveTile = { id: block.id, size: Number(e.target.value) })}
                      on:change={(e) => setTile(block.id, Number(e.target.value))}
                      on:pointerdown|stopPropagation
                    />
                  </label>
                {/if}
                {#if editMode && block.type === 'image'}
                  <!-- A picture's tools in edit mode, and only there: its size
                       stays as it is outside it (asked 2026-11-11). One press
                       for a size, or the round grip on its edge dragged, the
                       share shown while it moves. -->
                  <div class="page-edit-tools">
                    <div class="page-edit-row">
                      <button on:click|stopPropagation={() => (cropping = block)} disabled={!sourceOf(block)}>Crop</button>
                      <button on:click|stopPropagation={() => choosePicture({ replace: block.id })}>Replace</button>
                    </div>
                    <div class="page-edit-row page-sizes" role="group" aria-label="Size">
                      {#each PICTURE_SIZES as size}
                        <button
                          class:on={size.width === null ? !widthOf(col.key) : Math.abs((widthOf(col.key) || 0) - size.width) < 0.01}
                          on:click|stopPropagation={() => changeLayout(r => setCellWidth(r, col.key, size.width))}
                        >{size.label}</button>
                      {/each}
                    </div>
                  </div>
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div class="page-width-grip" title="Drag to size" on:pointerdown={(e) => startWidthDrag(e, col.key)}>
                    {#if liveWidth?.id === col.key}
                      <span class="page-width-badge">{Math.round(liveWidth.width * 100)}%</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/each}

    <!-- The rest of the page: a click here writes. -->
    <div class="page-below">
      {#if !shownRows.length}
        <p class="page-empty">Click anywhere to write.</p>
      {/if}
      <button class="page-add-btn" on:click|stopPropagation={openAddMenu}>＋ Block…</button>
    </div>
  </div>

  {#if drop}
    <div class="page-drop-line" style={dropLine}></div>
  {/if}
</div>

{#if slashMenu}
  <SlashMenu
    items={slashRows}
    active={slashActive}
    x={slashMenu.x}
    y={slashMenu.y}
    search={slashMenu.source === 'button'}
    themeStyle={pageVars}
    on:hover={(e) => (slashActive = e.detail)}
    on:pick={(e) => pickSlash(e.detail)}
    on:key={(e) => onSlashKey(e.detail)}
    on:query={(e) => { slashMenu = { ...slashMenu, query: e.detail }; slashActive = 0; }}
  />
{/if}

<!-- A picture from the device, for a block's menu or edit mode's Replace. -->
<input class="page-picture-input" type="file" accept="image/*,video/mp4" bind:this={pictureInput} on:change={onPictureChosen} />

{#if menu}
  <BlockContextMenu
    x={menu.x}
    y={menu.y}
    items={pageBlockMenu(menuBlock)}
    on:action={(e) => menuAction(e.detail)}
    on:close={() => (menu = null)}
  />
{/if}

{#if cropping}
  <CropEditor src={sourceOf(cropping)} crop={cropping.crop} on:apply={(e) => applyCrop(e.detail)} on:close={() => (cropping = null)} />
{/if}

{#if lbOpen}
  <Lightbox
    images={gallery.images}
    startIndex={gallery.start}
    blockIds={gallery.blockIds}
    crops={gallery.crops}
    on:close={() => (lbOpen = false)}
    on:cropBlock={(e) => dispatch('update', { id: e.detail.blockId, crop: e.detail.crop, changedKeys: ['crop'], pushToHistory: true, bumpVersion: true })}
    on:newImage={(e) => dispatch('addImage', { src: e.detail.src })}
  />
{/if}

<style>
  .page-mode {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--canvas-inner-bg, #000);
    color: var(--mode-text-color, #fff);
    cursor: text;
    --sb-track: var(--canvas-inner-bg);
    --sb-thumb: var(--mode-text-color);
    /* As much room on the left as the scrollbar takes on the right, so the
       page is centred between the screen's edges whether the scrollbar shows
       or not (utils/idleScrollbar.js; asked 2026-11-11). */
    padding-left: var(--sb-balance, 0px);
  }

  /* The scrollbar fades while nobody is scrolling (idleScrollbar), and is a
     third of the app's usual width (asked 2026-11-11, "around half or third
     width"); the page is balanced by what it measures, so it stays centred. */
  .page-mode:global(.sb-idle) {
    --sb-thumb: transparent;
  }
  /* The standard properties app.css sets on everything make Chrome, and the
     Android app's web view, ignore the width below; off here, it takes. The
     colours below are the same theme variables, so the fading still works. */
  .page-mode {
    scrollbar-width: auto;
    scrollbar-color: auto;
  }
  .page-mode::-webkit-scrollbar {
    width: 4px;
  }
  .page-mode::-webkit-scrollbar-thumb {
    border: none;
    border-radius: 2px;
  }

  .page-mode.dragging {
    cursor: grabbing;
    user-select: none;
  }

  /* Above the wallpaper, which sits at z-index 0 -- see ModeWallpaper.svelte.
     On a computer the page takes most of the width (asked 2026-11-10, "on
     pc use more of the width than on phone"). */
  .page-column {
    position: relative;
    z-index: 1;
    max-width: 100%;
    margin: 0 auto;
    /* About half what it was (asked 2026-11-11, "use less margin on each side
       ... halve it"), and no less than the handle beside a block needs. */
    padding: 14px max(26px, 1.5vw) 0;
    box-sizing: border-box;
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }

  /* The folder's name, as the page's title: big, and pressed to rename. */
  .page-title {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 14px;
    padding: 2px 2px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-family: var(--block-header-font, inherit);
    font-size: 2.2rem;
    font-weight: 700;
    line-height: 1.2;
    text-align: left;
    cursor: text;
    overflow-wrap: anywhere;
  }

  .page-title-input {
    outline: none;
    border-color: color-mix(in srgb, currentColor 30%, transparent);
  }

  /* Columns as tall as the row, so the space under a shorter one is its own
     -- a drop there goes under its last block. */
  .page-row {
    display: flex;
    gap: 14px;
    align-items: stretch;
  }

  .page-col {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .page-cell {
    position: relative;
    min-width: 0;
    padding: 3px 0;
    cursor: auto;
    /* Selected words take the page's colour. A highlight reverses a region's
       two colours (app.css), and a block on a page has no background of its
       own -- its --bg is transparent -- so selected words were drawn
       see-through: gone in one engine, left in their own colour in another
       (reported 2026-11-11). */
    --selection-text: var(--canvas-inner-bg, var(--app-bg, #000));
  }

  /* A picture beside other blocks takes the width of the picture, not an
     equal share of the row, so the writing beside it starts right after it
     (asked 2026-11-10: "when a text is on the side of the image it creates
     a big space in between"). At most half the row, and as tall as most of
     the screen allows (ImgBlock sizes it). */
  .page-col.fits-picture {
    flex: 0 1 auto;
    max-width: 50%;
  }

  /* A picture given a size takes it in full. */
  .page-col.sized :global(.media-container) {
    width: 100% !important;
  }

  /* Edit mode handles blocks as blocks (asked 2026-11-11: "on edit mode ...
     it should take the whole block as a whole for easier handling and for
     example long held to pop to delete or other things"): each one outlined,
     and what is inside it -- writing, tiles, a calendar's hours -- left
     untouchable, so a press is on the block. A long press then opens its
     menu, writing included, and nothing is typed into or opened by mistake.
     A picture's tools, a nest's tile slider and the handle sit beside the
     block, not in it, and still work. */
  .page-mode.edit-mode .page-cell {
    outline: 1px dashed color-mix(in srgb, var(--mode-text-color, #fff) 45%, transparent);
    outline-offset: 2px;
    border-radius: 4px;
  }

  /* Everything inside, too, and over what it says for itself: the editor
     turns the pointer back on for its writing. */
  .page-mode.edit-mode .page-cell > :global(.note),
  .page-mode.edit-mode .page-cell > :global(.note *) {
    pointer-events: none !important;
    user-select: none;
    -webkit-user-select: none;
  }

  /* Over the picture's top left, on a backing of the page's colour so it
     reads over any photograph; two rows -- what to do, and its size -- that
     wrap on a narrow picture rather than run off it. */
  .page-edit-tools {
    position: absolute;
    left: 8px;
    right: 24px;
    top: 10px;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    pointer-events: none;
  }

  .page-edit-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--canvas-inner-bg, #000) 82%, transparent);
    pointer-events: auto;
  }

  .page-edit-tools button {
    min-width: 34px;
    min-height: 30px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--mode-text-color, #fff) 40%, transparent);
    background: transparent;
    color: var(--mode-text-color, #fff);
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
  }

  /* The size it has now. */
  .page-edit-tools button.on {
    background: var(--mode-text-color, #fff);
    color: var(--canvas-inner-bg, #000);
    border-color: var(--mode-text-color, #fff);
  }

  /* The picture's right edge to drag: a wide strip to hold, a round knob in
     its middle to see, the share of the row beside it while it moves. */
  .page-width-grip {
    position: absolute;
    top: 0;
    bottom: 0;
    right: -16px;
    width: 32px;
    z-index: 3;
    cursor: ew-resize;
    touch-action: none;
  }

  .page-width-grip::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 18px;
    height: 18px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 2px solid var(--canvas-inner-bg, #000);
    background: var(--mode-text-color, #fff);
    box-sizing: border-box;
  }

  .page-width-badge {
    position: absolute;
    top: calc(50% - 40px);
    right: 50%;
    transform: translateX(50%);
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--mode-text-color, #fff);
    color: var(--canvas-inner-bg, #000);
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
  }

  .page-picture-input {
    display: none;
  }

  /* A long press on a picture is the page's menu, not the phone's own
     picture menu or a drag of the image. */
  .page-cell :global(img),
  .page-cell :global(svg) {
    -webkit-touch-callout: none;
    -webkit-user-drag: none;
  }

  .page-cell.moving {
    opacity: 0.4;
  }

  /* Beside a block while the pointer is on it, just left of it: close
     enough to reach a block that sits to the right of another (asked
     2026-11-10: "make it be a little more on the right and style a bit
     better the dots"). A dot, in a pill that shows on hover. */
  /* The place to hold is wider than the dot drawn in it (2026-11-11), its
     middle where the old handle's was. */
  .page-handle {
    position: absolute;
    left: -23px;
    top: 1px;
    width: 24px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    cursor: grab;
    touch-action: none;
    transition: opacity 0.12s, background 0.12s;
    z-index: 2;
  }

  /* Just a dot (asked 2026-11-11, smaller than the 7px first tried). */
  .page-handle-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
  }

  /* On a phone, blocks are moved in edit mode only (asked 2026-11-10), so a
     finger reading or scrolling the page never picks one up. */
  .page-mode.narrow:not(.edit-mode) .page-handle {
    display: none;
  }

  /* Above the nest's tiles, which were drawn over it, so a finger on the
     slider landed on a tile and it could not be held (2026-11-11); and the
     slider takes a sideways drag rather than the page scrolling. */
  .page-tile-size {
    z-index: 6;
    pointer-events: auto;
    left: auto;
    right: 8px;
    top: 0;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--canvas-inner-bg, #000) 85%, transparent);
    font-size: 0.8rem;
    flex-direction: row;
  }

  .page-tile-size input {
    height: 28px;
    touch-action: none;
  }

  .page-cell:hover > .page-handle,
  .page-handle:focus-visible {
    opacity: 0.6;
  }

  .page-handle:hover {
    opacity: 1 !important;
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  /* Between two columns the handle sits in the gap, not over the left one. */
  .page-row.several > .page-col + .page-col .page-handle {
    left: -19px;
  }

  .page-below {
    flex: 1 0 40vh;
    padding-top: 8px;
  }

  .page-empty {
    margin: 0 0 10px;
    opacity: 0.5;
  }

  .page-add-btn {
    border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.82rem;
    padding: 4px 12px;
    cursor: pointer;
    opacity: 0.55;
  }

  .page-add-btn:hover {
    opacity: 1;
    background: color-mix(in srgb, currentColor 8%, transparent);
  }

  .page-drop-line {
    position: absolute;
    z-index: 3;
    border-radius: 2px;
    background: var(--mode-text-color, #fff);
    opacity: 0.7;
    pointer-events: none;
  }

  /* A phone has no margin for the handle: it shows at the block's top
     right, over it. Its rows are its own layout (pageLayout.js): stacked
     until something is moved on a phone, side by side if put so. */
  .page-mode.narrow .page-column {
    padding: 12px 14px 0;
  }
  .page-mode.narrow .page-row {
    gap: 10px;
  }
  .page-mode.narrow .page-handle {
    left: auto;
    right: 0;
    opacity: 0.35;
  }
</style>
