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
  import BlockShell from './BlockShell.svelte';

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
  {focused}
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
      <div class="page-card-title">{title}</div>
      <div class="page-card-count">{count === 1 ? '1 block' : `${count} blocks`}</div>
      <button class="page-card-open" on:click|stopPropagation={open}>Open page</button>
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
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    color: var(--text);
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
    align-self: flex-start;
    margin-top: auto;
    padding: 5px 12px;
    border: 1px solid color-mix(in srgb, var(--text) 35%, transparent);
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
</style>
