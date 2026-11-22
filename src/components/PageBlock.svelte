<script>
  /**
   * A page inside a folder: a block holding its own `title` and `rows` (and a
   * phone's `narrowRows`), shown by Page mode in place of the folder's own
   * page when it is opened.
   *
   * Asked 2026-11-10: "When adding something to nests you should be able to
   * choose new folder or new page too. so that pages can be nested in pages
   * instead of always being a different folder." A block rather than a
   * second kind of folder, so it works on its own and goes wherever blocks
   * go (CLAUDE.md, "a block works on its own"): on the Canvas it is a card
   * that opens it, on a page a line, as Notion shows a page inside a page.
   * Its rows are of the folder's own blocks (utils/pageLayout.js).
   */
  import { getContext } from 'svelte';
  import { readable } from 'svelte/store';
  import BlockShell from './BlockShell.svelte';
  import Block from './Block.svelte';
  import { blocksOnPage, rowsFor } from '../utils/pageLayout.js';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 260, height: 140 };
  export let initialBgColor = '#000000';
  export let initialTextColor = '#ffffff';
  export let initialTitle = '';
  export let initialRows = [];
  export let focused = false;
  export let canvasScale = 1;
  export let placement = 'canvas';

  const folders = getContext('folders') || { openPage: () => {} };
  const folderBlocks = folders.blocks || readable([]);
  const focusedId = folders.focused || readable(null);
  export let initialNarrowRows = undefined;
  export let blockWidth = 0;

  // On the Canvas, the page itself, live (asked 2026-11-22, PENDING "Pages on
  // the Canvas"): its blocks in its layout -- a phone's when the block is
  // narrow -- drawn by the same Block as Page mode draws them, and written
  // in the same way. A page inside it is a line to open, not another preview.
  $: previewRows = placement === 'page' ? [] : blocksOnPage(
    rowsFor({ rows: initialRows, ...(Array.isArray(initialNarrowRows) ? { narrowRows: initialNarrowRows } : {}) }, blockWidth > 0 && blockWidth < 520),
    $folderBlocks
  );
  // Focused itself, or one of its blocks is: either way it is the one being
  // worked in, so its preview takes the wheel (utils/modeWheel.js).
  $: holdsFocus = focused || previewRows.some(row => row.blocks.some(block => block.id === $focusedId));

  $: title = (initialTitle || '').trim() || 'Untitled page';
  $: count = (initialRows || []).reduce((n, row) => n + (row?.cells?.length || 0), 0);

  function open() {
    folders.openPage?.(id);
  }
</script>

<BlockShell
  {id}
  {initialPosition}
  {initialSize}
  {initialBgColor}
  {initialTextColor}
  focused={holdsFocus}
  {canvasScale}
  {placement}
  label="Page"
  minWidth={160}
  minHeight={90}
  fields={{}}
  on:update
  on:delete
  on:focusToggle
>
  {#if placement === 'page'}
    <button class="page-link" on:click|stopPropagation={open} title="Open this page">
      <span class="page-glyph" aria-hidden="true">▤</span>
      <span class="page-link-title">{title}</span>
    </button>
  {:else}
    <div class="page-card">
      <div class="page-card-head">
        <div class="page-card-title">{title}</div>
        <button class="page-card-open" on:click|stopPropagation={open}>Open page</button>
      </div>
      {#if previewRows.length}
        <div class="page-preview">
          {#each previewRows as row (row.key)}
            <div class="page-preview-row">
              {#each row.columns as col (col.key)}
                <div class="page-preview-col" style={col.width ? `flex: 0 1 ${col.width * 100}%;` : ''}>
                  {#each col.blocks as block (`${block.id}-${block._version || 0}`)}
                    <div class="page-preview-cell">
                      <Block
                        {block}
                        placement="page"
                        focused={block.id === $focusedId}
                        on:update={event => folders.update?.(event)}
                        on:delete={event => folders.remove?.(event)}
                        on:focusToggle={event => folders.focusToggle?.(event)}
                      />
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      {:else}
        <div class="page-card-count">{count === 1 ? '1 block' : `${count} blocks`}</div>
      {/if}
    </div>
  {/if}
</BlockShell>

<style>
  .page-link {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 2px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 1.05rem;
    text-align: left;
    cursor: pointer;
  }

  .page-link:hover {
    background: color-mix(in srgb, currentColor 7%, transparent);
  }

  .page-glyph {
    opacity: 0.7;
  }

  .page-link-title {
    font-weight: 600;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, currentColor 35%, transparent);
    text-underline-offset: 3px;
  }

  .page-card {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    color: var(--text);
  }

  .page-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  /* The page, scrolled inside the block; its blocks on the block's own
     colours, as a page's are on the page. */
  .page-preview {
    flex: 1;
    min-height: 0;
    /* A preview: the page at four fifths, so more of it is seen at once. */
    zoom: 0.8;
    overflow-y: auto;
    overflow-x: hidden;
    --mode-text-color: var(--text);
    --canvas-inner-bg: var(--bg);
  }
  .page-preview-row {
    display: flex;
    gap: 12px;
  }
  .page-preview-col {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .page-preview-cell {
    position: relative;
    min-width: 0;
    padding: 1px 0;
  }

  .page-card-title {
    font-weight: 700;
    font-size: 1.1rem;
  }

  .page-card-count {
    opacity: 0.6;
    font-size: 0.85rem;
  }

  .page-card-open {
    flex: none;
    padding: 5px 12px;
    border: 1px solid color-mix(in srgb, var(--text) 35%, transparent);
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
</style>
