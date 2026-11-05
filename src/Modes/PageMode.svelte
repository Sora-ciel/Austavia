<script>
  /**
   * Page mode: the blocks put on the page, one under another, under the
   * folder's name -- a page like Notion's, made of the folder's own blocks.
   *
   * Planned 2026-10-27 and started 2026-11-04 (PENDING, "Page mode, and
   * nests"). Asked to start from an existing mode, "it's easier to get the
   * colors and structure for sync right": it is Simple Note's block view, in
   * a one-column layout, not a copy of it -- so every block looks, edits,
   * moves and syncs exactly as it does there (CLAUDE.md, "one of
   * everything"). What is the page's own is only which blocks it shows, in
   * what order: utils/pageEntries.js decides, this acts.
   *
   * Still to come, in PENDING's order: "/" in the writing to place blocks,
   * moving between blocks with the keys, nests.
   */
  import { createEventDispatcher, tick } from 'svelte';
  import SimpleNoteMode from './SimpleNoteMode.svelte';
  import PickerSheet from '../components/PickerSheet.svelte';
  import { htmlToText } from '../utils/htmlToText.js';
  import {
    blocksOnPage, blocksOffPage, putOnPage, takeOffPage, swapOnPage,
    PAGE_BLOCK_TYPES, blockPickName
  } from '../utils/pageEntries.js';

  export let openFolder = '';
  export let blocks = [];
  export let entries = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let leftControlColors = {};
  export let backgroundSettings = {};
  export let canvasRef;
  export let library = { tracks: [], playlists: [] };
  export let nowPlayingId = null;
  export let isPlaying = false;

  const dispatch = createEventDispatcher();

  $: shown = blocksOnPage(entries, blocks);

  function changePage(next) {
    dispatch('modeSettingChange', { page: { entries: next } });
  }

  function swap(event) {
    const { aId, bId } = event.detail || {};
    changePage(swapOnPage(entries, aId, bId));
  }

  function takeOff(event) {
    changePage(takeOffPage(entries, event.detail?.id, { blocks }));
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
    if (keep && to && to !== openFolder) dispatch('renameFolder', { to });
  }

  function titleKeydown(event) {
    if (event.key === 'Enter') { event.preventDefault(); finishRename(event); }
    else if (event.key === 'Escape') { event.preventDefault(); finishRename(event, false); }
  }

  // ── Adding: a type, then New or one of the folder's blocks of it ─────
  let picking = null; // null | 'type' | a block type

  $: typeItems = PAGE_BLOCK_TYPES.map(({ type, label }) => ({
    id: type,
    name: label,
    count: blocksOffPage(entries, blocks).filter(block => block.type === type || (type === 'text' && block.type === 'cleantext')).length || undefined
  }));

  $: choiceItems = picking && picking !== 'type'
    ? [
        { id: '__new', name: `New ${PAGE_BLOCK_TYPES.find(t => t.type === picking)?.label.toLowerCase() || 'block'}` },
        ...blocksOffPage(entries, blocks)
          .filter(block => block.type === picking || (picking === 'text' && block.type === 'cleantext'))
          .map(block => ({ id: block.id, name: blockPickName(block, htmlToText) }))
      ]
    : [];

  function pickType(event) {
    picking = event.detail;
  }

  function pickBlock(event) {
    const id = event.detail;
    const type = picking;
    picking = null;
    if (id === '__new') dispatch('addBlock', { type });
    else changePage(putOnPage(entries, id, { blocks }));
  }
</script>

<div class="page-mode">
  <SimpleNoteMode
    layout="page"
    columnCount={1}
    {openFolder}
    blocks={shown}
    {focusedBlockId}
    bind:canvasRef
    {canvasColors}
    {backgroundSettings}
    {leftControlColors}
    {library}
    {nowPlayingId}
    {isPlaying}
    on:play
    on:toggle
    on:update
    on:delete
    on:focusToggle
    on:swapBlocks={swap}
    on:takeOff={takeOff}
  >
    <div slot="top" class="page-head">
      {#if renaming}
        <input
          class="page-title page-title-input"
          aria-label="Page name"
          value={openFolder}
          bind:this={titleInput}
          on:keydown={titleKeydown}
          on:blur={finishRename}
        />
      {:else}
        <button class="page-title" title="Press to rename" on:click={startRename}>{openFolder || 'Untitled'}</button>
      {/if}
      {#if !shown.length}
        <p class="page-empty">Nothing on this page yet. Start writing, or put a block on it: a new one, or one already in this folder.</p>
      {/if}
    </div>
    <div slot="bottom" class="page-add">
      <button class="page-add-btn" on:click={() => dispatch('addBlock', { type: 'text' })}>＋ Text</button>
      <button class="page-add-btn" on:click={() => (picking = 'type')}>＋ Block…</button>
    </div>
  </SimpleNoteMode>

  {#if picking === 'type'}
    <PickerSheet title="Put on the page" items={typeItems} searchable={false} on:pick={pickType} on:close={() => (picking = null)} />
  {:else if picking}
    <PickerSheet title={PAGE_BLOCK_TYPES.find(t => t.type === picking)?.label || 'Block'} items={choiceItems} searchable={choiceItems.length > 8} on:pick={pickBlock} on:close={() => (picking = null)} />
  {/if}
</div>

<style>
  .page-mode {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
  }

  .page-head {
    padding: 18px 10px 10px;
    color: var(--mode-text-color, inherit);
  }

  /* The folder's name, as a page's title: big, and pressed to rename. */
  .page-title {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin: 0;
    padding: 2px 4px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-family: var(--block-header-font, inherit);
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.2;
    text-align: left;
    cursor: text;
    overflow-wrap: anywhere;
  }

  .page-title:hover {
    background: color-mix(in srgb, currentColor 6%, transparent);
  }

  .page-title-input {
    outline: none;
    border-color: color-mix(in srgb, currentColor 35%, transparent);
  }

  .page-empty {
    margin: 10px 4px 0;
    opacity: 0.6;
  }

  .page-add {
    display: flex;
    gap: 8px;
    padding: 6px 10px;
    color: var(--mode-text-color, inherit);
  }

  .page-add-btn {
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.85rem;
    padding: 5px 14px;
    cursor: pointer;
    opacity: 0.75;
  }

  .page-add-btn:hover {
    opacity: 1;
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
</style>
