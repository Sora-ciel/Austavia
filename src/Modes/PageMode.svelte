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
   * row being one block or several side by side; a ⋮⋮ handle beside each one
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
  import { slashItems, stepChoice, slashSplit } from '../utils/slashMenu.js';
  import { splitWritingAt } from '../utils/editorSplit.js';
  import BlockContextMenu from '../components/BlockContextMenu.svelte';
  import Lightbox from '../components/Lightbox.svelte';
  import { htmlToText } from '../utils/htmlToText.js';
  import { modeTextColor as modeTextColorFor } from '../utils/modeSurface.js';
  import { isPrimaryPointer } from '../utils/pointer.js';
  import {
    blocksOnPage, blocksOffPage, putOnPage, takeOffPage, placeOnPage, clickBelow, dropSide,
    PAGE_BLOCK_TYPES, blockPickName, rowsFor, editPage, isNarrow
  } from '../utils/pageLayout.js';

  export let openFolder = '';
  export let blocks = [];
  /** The page shown: the folder's own or a page block's, `{ rows, narrowRows }`. */
  export let page = { rows: [] };
  /** Its title: the folder's name, or the page block's title. */
  export let title = '';
  /** The page block shown, or null for the folder's own page. */
  export let pageId = null;
  export let canGoBack = false;
  export let canGoForward = false;
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
  $: shownRows = blocksOnPage(rows, blocks.filter(block => block.id !== pageId));

  /** Putting on or taking off -- the page's content, both layouts. */
  function changeContent(op) {
    dispatch('pageChange', { page: editPage(page, { narrow, content: true, op }) });
  }

  /** Moving -- the layout in use only. */
  function changeLayout(op) {
    dispatch('pageChange', { page: editPage(page, { narrow, op }) });
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

  function onPageClick(event) {
    if (event.target.closest?.('.page-cell, button, input, a, .page-title')) return;
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
      if (item.kind === 'new') dispatch('addBlock', { type: item.type });
      else changeContent(r => putOnPage(r, item.blockId, { blocks }));
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

  function menuAction(id) {
    const blockId = menu?.blockId;
    menu = null;
    if (!blockId) return;
    if (id === 'takeOff') changeContent(r => takeOffPage(r, blockId, { blocks }));
    else if (id === 'delete') dispatch('delete', { id: blockId });
  }

  // Moving: hold the handle and drag. Where it lands is decided by
  // dropSide (pageLayout.js): near a block's left or right edge is beside
  // it, anywhere else above or below it.
  const DRAG_THRESHOLD = 5;
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
    let target = null;
    for (const el of document.elementsFromPoint(event.clientX, event.clientY)) {
      const cell = el.closest?.('[data-page-block]');
      if (cell) { target = cell; break; }
    }
    if (!target || target.dataset.pageBlock === dragging) { drop = null; return; }
    const rect = target.getBoundingClientRect();
    const pageRect = canvasRef.getBoundingClientRect();
    drop = {
      targetId: target.dataset.pageBlock,
      side: dropSide({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, x: event.clientX, y: event.clientY }),
      box: {
        left: rect.left - pageRect.left + canvasRef.scrollLeft,
        top: rect.top - pageRect.top + canvasRef.scrollTop,
        width: rect.width,
        height: rect.height
      }
    };
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
      changeLayout(r => placeOnPage(r, moving, { targetId, side, blocks }));
    } else if (!dragging && press) {
      // A press without a move is a click: the menu.
      const handle = canvasRef?.querySelector(`[data-page-block="${press.blockId}"] .page-handle`);
      if (handle) openMenu(press.blockId, handle);
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
        : `left:${drop.box.left}px; top:${drop.side === 'above' ? drop.box.top - 5 : drop.box.top + drop.box.height + 2}px; width:${drop.box.width}px; height:3px;`)
    : '';

  // ── Pictures open full screen, as on the Canvas ──────────────────────
  let lbOpen = false;
  let lbImages = [];
  let lbStart = 0;

  function openLightbox(event) {
    const src = event.detail?.src;
    if (!src) return;
    lbImages = [src];
    lbStart = 0;
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

<div class="page-mode" class:dragging={Boolean(dragging)} class:narrow bind:this={canvasRef} style={pageVars} on:click={onPageClick}>
  <ModeWallpaper settings={backgroundSettings} />

  <!-- Back and forward through the pages and folders opened from nests
       (utils/pagePlaces.js), in the mode's own colours. Asked 2026-11-10. -->
  <div class="page-nav">
    <button class="page-nav-btn" title="Back" aria-label="Back" disabled={!canGoBack} on:click|stopPropagation={() => dispatch('placeBack')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
    </button>
    <button class="page-nav-btn" title="Forward" aria-label="Forward" disabled={!canGoForward} on:click|stopPropagation={() => dispatch('placeForward')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
    </button>
  </div>

  <div class="page-column">
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

    {#each shownRows as row (row.key)}
      <div class="page-row" class:several={row.blocks.length > 1}>
        {#each row.blocks as block (`${block.id}-${block._version || 0}`)}
          <div
            class="page-cell"
            class:moving={dragging === block.id}
            class:fits-picture={block.type === 'image' && row.blocks.length > 1}
            data-page-block={block.id}
          >
            <button
              class="page-handle"
              title="Drag to move, press for the menu"
              aria-label="Move or open the menu"
              on:pointerdown|preventDefault={(event) => handleDown(event, block.id)}
              on:click|stopPropagation
            >⋮⋮</button>
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
            />
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

{#if menu}
  <BlockContextMenu
    x={menu.x}
    y={menu.y}
    items={[
      { id: 'takeOff', label: 'Take off page' },
      { id: 'delete', label: 'Delete block', variant: 'danger' }
    ]}
    on:action={(e) => menuAction(e.detail)}
    on:close={() => (menu = null)}
  />
{/if}

{#if lbOpen}
  <Lightbox images={lbImages} startIndex={lbStart} on:close={() => (lbOpen = false)} />
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
  }

  .page-mode.dragging {
    cursor: grabbing;
    user-select: none;
  }

  /* At the top left, over the page and with it as it scrolls. */
  .page-nav {
    position: sticky;
    top: 0;
    z-index: 4;
    display: flex;
    gap: 2px;
    width: max-content;
    padding: 8px 10px 0;
    height: 0;
    overflow: visible;
  }

  .page-nav-btn {
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: color-mix(in srgb, var(--canvas-inner-bg, #000) 70%, transparent);
    color: var(--mode-text-color, #fff);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .page-nav-btn svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .page-nav-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--mode-text-color, #fff) 12%, transparent);
  }

  .page-nav-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* Above the wallpaper, which sits at z-index 0 -- see ModeWallpaper.svelte.
     On a computer the page takes most of the width (asked 2026-11-10, "on
     pc use more of the width than on phone"). */
  .page-column {
    position: relative;
    z-index: 1;
    max-width: 100%;
    margin: 0 auto;
    padding: 44px max(40px, 3vw) 0;
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

  .page-row {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }

  .page-cell {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    padding: 3px 0;
    cursor: auto;
  }

  /* A picture beside other blocks takes the width of the picture, not an
     equal share of the row, so the writing beside it starts right after it
     (asked 2026-11-10: "when a text is on the side of the image it creates
     a big space in between"). At most half the row, and as tall as most of
     the screen allows (ImgBlock sizes it). */
  .page-cell.fits-picture {
    flex: 0 1 auto;
    max-width: 50%;
  }

  .page-cell.moving {
    opacity: 0.4;
  }

  /* Beside a block while the pointer is on it, in the margin to its left. */
  .page-handle {
    position: absolute;
    left: -28px;
    top: 4px;
    width: 22px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font-size: 0.9rem;
    letter-spacing: -2px;
    line-height: 1;
    opacity: 0;
    cursor: grab;
    touch-action: none;
    transition: opacity 0.12s;
  }

  .page-cell:hover > .page-handle,
  .page-handle:focus-visible {
    opacity: 0.55;
  }

  .page-handle:hover {
    opacity: 1 !important;
    background: color-mix(in srgb, currentColor 10%, transparent);
  }

  /* Side by side within a row, the handle sits inside the gap. */
  .page-row.several > .page-cell + .page-cell > .page-handle {
    left: -24px;
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
    padding: 42px 14px 0;
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
